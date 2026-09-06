// agent-skills-router.dsh - Cordis host plugin for DeepSeek Harness. Injects the
// decision tree into every model step, registers one slash command per kit skill,
// tracks per-session skill/review state, optionally gates code tools until
// a skill is loaded, and publishes that state as whole-value session events
// feeding the `askKit` projection unit read by the dsh-panel-widget client.
// All shared logic comes from core/router-core.js so no decision-tree copy can
// drift. The file must stay dependency-free: preset-local rows cannot resolve
// bare npm specifiers.

import { createRequire } from "node:module"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))

// Router-core sits beside this file in the installed preset (vendor/) or one
// level up when running straight from the repo checkout (core/).
function resolveRouterCore() {
  const candidates = [
    resolve(here, "../vendor/router-core.js"),
    resolve(here, "../core/router-core.js"),
  ]
  for (const candidate of candidates) {
    try { return require(candidate) } catch { /* try next layout */ }
  }
  throw new Error(
    "agent-skills-router.dsh: cannot find router-core.js in any known layout "
    + `(tried ${candidates.join(", ")})`,
  )
}

const routerCore = resolveRouterCore()

/** Cordis plugin name. */
export const name = "agent-skills-router-dsh"

/** The prompt registry is a hard dependency: without it there is nothing to inject into. */
export const inject = ["systemPrompt"]

// Row config has no schema export by design: normalize it manually in apply().

const {
  SKILL_CODE_REVIEW, SKILL_VERIFICATION, SKILL_WRITE_SKILL, SKILL_SESSION_REVIEW,
  SKILL_UI_UX, SKILL_DESIGN_REVIEW,
  routingHintLines, cascadeRoute, hasPhraseSignal, COMPLETION_PHRASES,
  INTERACTION_GUARD_THRESHOLD,
} = routerCore

const CODE_EDIT_TOOL_IDS = new Set(["edit", "write", "apply_patch"])
const GATED_TOOLS = new Set(["bash", "edit", "write", "apply_patch"])
const SECTION_NAME = "ask-kit:router"
const LOADED_SKILLS_MAX = 12

// Panel state bridge (plugins/dsh-panel-widget): every mutation appends the
// complete post-change state as one session event (the projection layer's
// whole-value rule), and the askKit projection unit folds those events into
// the schema-validated view the widget client reads from its snapshot.
const PANEL_EVENT_TYPE = "ask-kit/state"
const PANEL_PROJECTION_KEY = "askKit"
const PANEL_STATE_VERSION = 1

// Companion skills outside the routing tree that still get a slash command.
// Descriptions are copied verbatim from commands/<name>.md; check-dsh-plugin.js
// fails on drift between this table and those generated files.
const COMPANION_COMMANDS = [
  ["design-review", "Review a design, UI, or copy for AI-generated patterns and quality"],
  ["gh-inbox", "Check the current repository's GitHub issues and discussions, triage activity, reply when clear, and persist inbox state"],
]

// Slash-command surface: one picker entry per kit skill. Beslisboom rows are
// parsed first-segment-label / last-segment-skill so both derivations agree
// even if a future label ever contained an arrow.
const COMMAND_ROWS = [
  ...[...routingHintLines()].map((line) => {
    const segments = line.split("→")
    return [(segments[segments.length - 1] ?? "").trim(), (segments[0] ?? "").trim()]
  }),
  ...COMPANION_COMMANDS,
]

// Build one proper inbox user message without importing @deepseek-ai/dsh-llm:
// preset-local rows cannot resolve bare specifiers, so this mirrors
// createUserMessage's shape ({id, role, text content, user source}) that the
// agent loop forwards verbatim into the next model request.
function buildUserMessage(text) {
  return Object.freeze({
    id: randomUUID(),
    role: "user",
    content: Object.freeze([{ type: "text", text }]),
    source: Object.freeze({ kind: "user" }),
  })
}

// Queue a load-the-skill user message through the agent's steer channel,
// mirroring the slash-command handler's prompt pattern; best-effort and
// silent when the agent cannot steer (plain test doubles, headless runs).
function steerReviewSkill(agent, skill) {
  try {
    if (typeof agent?.steer !== "function") return
    agent.steer(buildUserMessage(
      `Load the '${skill}' skill via the skill tool and follow its full workflow.`,
    ))
  } catch { /* steering is best-effort */ }
}

// Project the wire view of one tracking bucket: the COMPLETE post-change state
// per the projection layer's whole-value rule, so every fold is last-write-wins
// and every served value is self-describing.
function panelViewOf(st) {
  return {
    loadedSkills: [...st.loadedSkills],
    lastMatch: st.lastMatch,
    needsCodeReview: st.needsCodeReview === true,
    needsDesignReview: st.needsDesignReview === true,
    shouldCaptureImprovement: st.shouldCaptureImprovement === true,
    skillsLoadedCount: st.skillsLoadedCount,
    interactionCountSinceSkillLoad: st.interactionCountSinceSkillLoad,
  }
}

// Re-validate one logged panel payload into a fresh view; returns null when
// the data is malformed so a corrupt or foreign log entry cannot poison the
// fold on replay.
function normalizePanelView(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  if (!Array.isArray(data.loadedSkills)) return null
  return {
    loadedSkills: data.loadedSkills.filter((s) => typeof s === "string" && s.trim()),
    lastMatch: typeof data.lastMatch === "string" ? data.lastMatch : "",
    needsCodeReview: data.needsCodeReview === true,
    needsDesignReview: data.needsDesignReview === true,
    shouldCaptureImprovement: data.shouldCaptureImprovement === true,
    skillsLoadedCount: Number.isFinite(data.skillsLoadedCount) ? data.skillsLoadedCount : 0,
    interactionCountSinceSkillLoad: Number.isFinite(data.interactionCountSinceSkillLoad)
      ? data.interactionCountSinceSkillLoad
      : 0,
  }
}

// Minimal skill stubs so router-core's cascadeRoute can match names without
// touching a filesystem catalog; only skill names surface in hints anyway.
const SKILL_STUBS = [...routingHintLines()]
  .map((line) => line.split("→").pop()?.trim())
  .filter(Boolean)
  .map((skill) => ({ name: skill, description: "", triggers: [] }))

// Fresh per-agent tracking state, mirroring the OpenCode plugin's fields.
// steeredSkills remembers which review skills a completion phrase already
// pushed the agent toward, so a single debt episode steers at most once.
function emptyState() {
  return {
    lastMatch: "", matchedAt: 0, needsCodeReview: false, needsDesignReview: false,
    shouldCaptureImprovement: false, skillsLoadedCount: 0, loadedSkills: [],
    interactionCountSinceSkillLoad: 0,
    steeredSkills: [],
  }
}

/**
 * Register event listeners that keep state fresh and inject the section.
 * @param ctx - the mounting preset's scope context.
 * @param config - raw row config; only an exact `blockUntilSkillLoaded: true` enables gating.
 */
export function apply(ctx, config) {
  const blockUntilSkillLoaded = config?.blockUntilSkillLoaded === true
  const states = new Map()

  // Resolve (and lazily create) the state bucket for one agent key.
  function stateFor(key) {
    const k = String(key || "default")
    let s = states.get(k)
    if (!s) { s = emptyState(); states.set(k, s) }
    return s
  }

  // Drop one agent's bucket so long-lived processes do not accumulate state.
  ctx.on("agent/disposed", (payload) => {
    try {
      const id = payload?.agent ? String(payload.agent.id) : ""
      if (id) states.delete(id)
    } catch { /* cleanup is best-effort */ }
  })

  // Append the whole post-change state to the session log; best-effort and
  // silent when no session is reachable (plain test doubles, headless runs).
  // A byte-identical repeat of the last published view is skipped so prompt
  // churn cannot flood the log with no-op events.
  function publishPanelState(agent, st) {
    try {
      const session = agent?.session
      if (typeof session?.append !== "function") return
      const view = panelViewOf(st)
      const serialized = JSON.stringify(view)
      if (serialized === st._panelPublished) return
      st._panelPublished = serialized
      const appended = session.append.call(session, PANEL_EVENT_TYPE, view)
      if (appended && typeof appended.catch === "function") appended.catch(() => {})
    } catch { /* panel state is best-effort */ }
  }

  // Register the askKit projection unit when the seam exists: a pure last-
  // write-wins fold over the whole-value events, with a dependency-free
  // hand-rolled schema because preset rows cannot resolve bare npm specifiers.
  ctx.inject(["sessionProjections"], (projectionCtx) => {
    projectionCtx.sessionProjections.register({
      key: PANEL_PROJECTION_KEY,
      schema: {
        // Boundary validation: only an object-or-null view may leave the unit.
        parse(value) {
          if (value === null) return null
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("ask-kit panel projection: view must be an object or null")
          return value
        },
      },
      init: () => null,
      apply: (state, event) => {
        if (event?.type !== PANEL_EVENT_TYPE) return state
        const next = normalizePanelView(event.data)
        return next === null ? state : next
      },
      view: (state) => state,
      stateVersion: PANEL_STATE_VERSION,
    })
  })

  // Render the canonical decision tree plus live nudges for one state bucket;
  // rows come verbatim from routingHintLines() so they cannot drift.
  function buildOverview(st) {
    const lines = ["╌ Agent Skills Kit ╌"]
    lines.push(st.skillsLoadedCount > 0
      ? "Decision tree — load a different skill via `skill(name: '...')`:"
      : "Load matching skill *now* via `skill(name: '...')` before tools:")
    lines.push("")
    lines.push(...routingHintLines())
    if (st.lastMatch) { lines.push(""); lines.push(`Active: ${st.lastMatch}`) }
    if (st.interactionCountSinceSkillLoad >= INTERACTION_GUARD_THRESHOLD && st.skillsLoadedCount === 0) {
      lines.push("→ Working through 5 actions without a loaded skill — `skill(name: 'develop')` sets workflow guardrails")
    }
    if (st.needsCodeReview) lines.push("→ Code edited — `skill(name: 'code-review')` before claiming done")
    if (st.needsDesignReview) lines.push("→ Design produced — `skill(name: 'design-review')` filters AI defaults before showing")
    if (st.shouldCaptureImprovement) lines.push("→ Improvement found? `skill(name: 'session-review')` to file issue")
    return lines.join("\n")
  }

  // Pull plain text out of a user message payload without retaining objects;
  // tool-injected contexts (leading tool-result blocks) are ignored so they
  // cannot flip routing mid-step.
  function messageText(message) {
    try {
      const content = message?.content
      if (Array.isArray(content)) {
        if (content[0]?.type === "tool-result") return ""
        return content.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join(" ")
      }
      if (typeof content === "string") return content
      if (typeof message?.text === "string" && message.text.trim()) return message.text
    } catch { /* shape drift, skip routing this message */ }
    return ""
  }

  // Extract the requested skill name from skill-tool call arguments.
  function skillNameOf(args) {
    const v = args?.name ?? args?.skill
    return typeof v === "string" ? v.trim() : ""
  }

  // Apply the kit's review-flag flips for one successfully loaded skill.
  // Loading a review skill also resets its steer guard, so a fresh debt
  // episode later in the session can steer the agent toward it again.
  function applySkillFlips(st, loaded) {
    st.skillsLoadedCount += 1
    if (loaded) {
      if (!st.loadedSkills.includes(loaded)) st.loadedSkills.push(loaded)
      if (st.loadedSkills.length > LOADED_SKILLS_MAX) st.loadedSkills.shift()
      st.lastMatch = loaded
      st.interactionCountSinceSkillLoad = 0
    }
    if (loaded === SKILL_CODE_REVIEW) {
      st.needsCodeReview = false; st.shouldCaptureImprovement = true
      st.steeredSkills = st.steeredSkills.filter((s) => s !== SKILL_CODE_REVIEW); return
    }
    if (loaded === SKILL_VERIFICATION) { st.shouldCaptureImprovement = true; return }
    if (loaded === SKILL_WRITE_SKILL) {
      st.shouldCaptureImprovement = false
      st.steeredSkills = st.steeredSkills.filter((s) => s !== SKILL_SESSION_REVIEW); return
    }
    if (loaded === SKILL_SESSION_REVIEW) {
      st.shouldCaptureImprovement = false
      st.steeredSkills = st.steeredSkills.filter((s) => s !== SKILL_SESSION_REVIEW); return
    }
    if (loaded === SKILL_UI_UX) { st.needsDesignReview = true; return }
    if (loaded === SKILL_DESIGN_REVIEW) {
      st.needsDesignReview = false
      st.steeredSkills = st.steeredSkills.filter((s) => s !== SKILL_DESIGN_REVIEW)
    }
  }

  // Route every incoming prompt: refresh Active hints and, on completion
  // phrases, push the agent to settle pending review debt by steering it
  // toward the matching review skill — once per skill per episode, so the
  // chip stays visible until the review is actually loaded (applySkillFlips
  // clears the flag then) instead of silently vanishing on "done".
  ctx.on("agent/inbox/inserted", (payload) => {
    try {
      const text = messageText(payload?.message)
      if (!text.trim()) return
      const st = stateFor(payload?.agent?.id)
      st.interactionCountSinceSkillLoad += 1
      st.lastMatch = cascadeRoute(text, SKILL_STUBS, st)?.matchedSkills?.[0]?.name || "develop"
      st.matchedAt = Date.now()
      if (hasPhraseSignal(text, COMPLETION_PHRASES)) {
        const pending = []
        if (st.needsCodeReview) pending.push(SKILL_CODE_REVIEW)
        if (st.needsDesignReview) pending.push(SKILL_DESIGN_REVIEW)
        if (st.shouldCaptureImprovement) pending.push(SKILL_SESSION_REVIEW)
        for (const skill of pending) {
          if (st.steeredSkills.includes(skill)) continue
          st.steeredSkills.push(skill)
          steerReviewSkill(payload?.agent, skill)
        }
      }
      publishPanelState(payload?.agent, st)
    } catch (error) {
      console.error("[ask-kit] routing failed:", error)
    }
  })

  // Track dispatches: flag review debt pre-dispatch, gate tools when enabled.
  ctx.on("tools/pre-execute", async (exec, next) => {
    try {
      const toolID = typeof exec?.name === "string" ? exec.name : ""
      if (!toolID) return next()
      if (CODE_EDIT_TOOL_IDS.has(toolID)) {
        // Publish only on the false→true flip so repeated code edits do not
        // spam the session log with identical whole-value events.
        const st = stateFor(exec.agent?.id)
        if (!st.needsCodeReview) {
          st.needsCodeReview = true
          publishPanelState(exec.agent, st)
        }
      }
      if (blockUntilSkillLoaded && GATED_TOOLS.has(toolID) && stateFor(exec.agent?.id).skillsLoadedCount === 0) {
        return { kind: "deny", reason: "Load a skill first via `skill(name: '...')`.\n" + routingHintLines().join("\n") }
      }
    } catch (error) {
      console.error("[ask-kit] gating check failed (failing open):", error)
    }
    return next()
  })

  // Count successful skill loads and hand off to the flip table.
  ctx.on("tools/result", (exec, result) => {
    try {
      if (exec?.name !== "skill" || !result || result.isError) return
      const st = stateFor(exec.agent?.id)
      applySkillFlips(st, skillNameOf(exec.arguments))
      publishPanelState(exec.agent, st)
    } catch (error) {
      console.error("[ask-kit] skill tracking failed:", error)
    }
  })

  // Register one slash command per kit skill. Lazy `ctx.inject` (not the
  // top-level inject list) mirrors dsh-plan-mode: compositions without a
  // commands service simply get no picker entries instead of failing the row.
  ctx.inject(["commands"], (commandCtx) => {
    for (const [skill, description] of COMMAND_ROWS) {
      commandCtx.commands.register({
        name: skill,
        description,
        input: { hint: "[focus]" },
        // Steer the agent with the load-the-skill prompt pattern from the
        // platform command files; optional rawInput becomes the focus
        // argument. Per-workflow specifics stay in the skill body itself.
        handler: ({ agent, rawInput }) => {
          const focus = String(rawInput || "").trim()
          const prompt = `Load the '${skill}' skill via the skill tool and follow its full workflow.`
            + (focus ? ` Apply it to: ${focus}` : "")
          try {
            agent.steer(buildUserMessage(prompt))
          } catch (error) {
            return { kind: "error", text: `Could not queue skill load: ${error?.message || error}` }
          }
          return { kind: "success", text: `Queued skill load: ${skill}${focus ? ` — ${focus}` : ""}` }
        },
      })
    }
  })

  // Append the live decision-tree section to every model-step assembly.
  ctx.on("system-prompt/assemble", async (assembly, context, next) => {
    const result = await next()
    try {
      const st = stateFor(context?.agent?.id ?? context?.scope)
      const text = "--- Agent Skills Kit ---\n" + buildOverview(st)
      const sections = (result.sections || []).filter((s) => s?.name !== SECTION_NAME)
      sections.push({ name: SECTION_NAME, text })
      result.sections = sections
    } catch (error) {
      console.error("[ask-kit] section injection failed:", error)
    }
    return result
  })
}

export default { name, inject, apply }
