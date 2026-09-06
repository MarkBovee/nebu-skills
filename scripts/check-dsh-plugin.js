#!/usr/bin/env node
// Validates plugins/agent-skills-router.dsh.mjs against core/router-core.js:
// export shape, config defaults, event wiring, decision-tree drift (every row
// must come verbatim from routingHintLines()), the per-skill slash-command
// surface (names, descriptions, steer handler), routing/state smoke behavior,
// and strict-mode tool gating. Exits non-zero on any failure.

"use strict"

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { createRequire } = require("node:module")
const { pathToFileURL } = require("node:url")

const repoRoot = path.resolve(__dirname, "..")
const pluginSourcePath = path.join(repoRoot, "plugins", "agent-skills-router.dsh.mjs")

// Companion skills whose command description must equal commands/<name>.md;
// decision-tree-derived commands are drift-proof by construction.
const COMMAND_DRIFT_SOURCES = [
  ["design-review"],
  ["gh-inbox"],
]

let failures = 0

// Record one assertion outcome and keep going so one run reports everything.
function check(label, ok, detail) {
  if (ok) {
    console.log(`  ok    ${label}`)
  } else {
    failures += 1
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

// Record whether one function throws, for schema boundary assertions.
function throws(fn) {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

async function main() {
  const routerCore = createRequire(__filename)(path.join(repoRoot, "core", "router-core.js"))

  // The plugin must stay dependency-free: its source contains no bare
  // specifiers and therefore loads out-of-tree as-is, exactly like the
  // installed preset row does inside dsh.
  const source = fs.readFileSync(pluginSourcePath, "utf8")

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "ask-dsh-plugin-"))
  const pluginCopy = path.join(workDir, "plugins", "ask-kit-router.mjs")
  fs.mkdirSync(path.join(workDir, "plugins"), { recursive: true })
  fs.mkdirSync(path.join(workDir, "vendor"), { recursive: true })
  fs.writeFileSync(pluginCopy, source)
  // Mirror the installed preset layout so the vendor fallback resolves.
  fs.copyFileSync(path.join(repoRoot, "core", "router-core.js"), path.join(workDir, "vendor", "router-core.js"))

  try {
    const mod = await import(pathToFileURL(pluginCopy).href)

    check("exports name/inject/apply", typeof mod.name === "string" && Array.isArray(mod.inject) && typeof mod.apply === "function")
    check("hard-injects systemPrompt", mod.inject.includes("systemPrompt"))
    check("stays dependency-free (no Config schema export)", mod.Config === undefined)

    const listeners = new Map()
    const commands = []
    const projections = []
    const ctx = {
      on: (name2, fn) => { if (!listeners.has(name2)) listeners.set(name2, []); listeners.get(name2).push(fn) },
      // Capture the lazy commands injection so the slash-command surface is
      // testable without a live Cordis tree.
      inject: (services, fn) => {
        if (services.length === 1 && services[0] === "commands") {
          fn({ commands: { register: (definition) => commands.push(definition) } })
        }
        // Capture the lazy sessionProjections injection so the panel state
        // bridge is testable without a live registry.
        if (services.length === 1 && services[0] === "sessionProjections") {
          fn({ sessionProjections: { register: (definition) => projections.push(definition) } })
        }
      },
    }
    mod.apply(ctx, { blockUntilSkillLoaded: true })
    for (const expected of ["agent/inbox/inserted", "tools/pre-execute", "tools/result", "system-prompt/assemble"]) {
      check(`registers ${expected}`, listeners.has(expected))
    }

    // Slash-command surface: one command per kit skill, names unique and
    // grammar-clean, descriptions derived from the decision-tree rows plus the
    // companion table (which must not drift from commands/<name>.md).
    const hintNames = routerCore.routingHintLines().map((line) => line.split("→").pop().trim())
    const expectedNames = [...hintNames, "design-review", "gh-inbox"]
    check("registers one command per kit skill", commands.length === expectedNames.length,
      `got ${commands.length}, want ${expectedNames.length}`)
    check("command names match kit skills", expectedNames.every((n) => commands.some((c) => c.name === n))
      && new Set(commands.map((c) => c.name)).size === commands.length)
    check("command names are lowercase grammar-clean",
      commands.every((c) => /^[a-z0-9][a-z0-9_-]*$/.test(c.name)))
    for (const [skill] of COMMAND_DRIFT_SOURCES) {
      const def = commands.find((c) => c.name === skill)
      const md = fs.readFileSync(path.join(repoRoot, "commands", `${skill}.md`), "utf8")
      const match = md.match(/^description:\s*(.+)$/m)
      check(`companion description matches commands/${skill}.md`, Boolean(def && match && def.description === match[1].trim()),
        def ? `"${def.description}"` : "missing definition")
    }
    if (commands.length > 0) {
      // Guarded lookups: a vanished command must FAIL cleanly, not crash main.
      const debugging = commands.find((c) => c.name === "debugging")
      const spec = commands.find((c) => c.name === "spec")
      check("behavior-test commands exist", Boolean(debugging && spec))
      if (debugging && spec) {
        const steered = []
        const result = debugging.handler({
          agent: { steer: (msg) => steered.push(msg) },
          rawInput: "login crash bij start",
        })
        const msg = steered[0]
        const steeredText = msg?.content?.[0]?.text ?? ""
        check("handler steers a load-the-skill prompt", steered.length === 1
          && steeredText.includes("'debugging'") && steeredText.includes("Apply it to: login crash bij start"))
        // The loop forwards inbox items verbatim into the model request, so the
        // steered value must be a full user message, not a bare string.
        check("steered payload is a proper user message", Boolean(msg) && typeof msg === "object"
          && msg.role === "user" && typeof msg.id === "string" && msg.id.length > 0
          && Array.isArray(msg.content) && msg.content[0]?.type === "text"
          && typeof msg.source?.kind === "string")
        check("handler reports success", result && result.kind === "success" && result.text.includes("debugging"))
        const bare = spec.handler({
          agent: { steer: (msg2) => steered.push(msg2) },
          rawInput: "   ",
        })
        check("bare invocation omits focus clause", steered.length === 2
          && !steered[1].content[0].text.includes("Apply it to:") && bare.kind === "success")
        const failed = debugging.handler({
          agent: { steer: () => { throw new Error("boom") } },
          rawInput: "",
        })
        check("handler reports error when steer throws", failed.kind === "error" && failed.text.includes("boom"))
      }
    }

    // Strict-mode gate denies bash before any skill load, allows after one.
    const pre = listeners.get("tools/pre-execute")[0]
    const agent = { id: "gate-check" }
    const denied = await pre({ name: "bash", agent }, async () => ({ kind: "allow" }))
    check("strict gate denies before skill load", denied && denied.kind === "deny")
    listeners.get("tools/result")[0]({ name: "skill", agent, arguments: { name: "develop" } }, { isError: false })
    const allowed = await pre({ name: "bash", agent }, async () => ({ kind: "allow" }))
    check("strict gate allows after skill load", allowed && allowed.kind === "allow")

    // Beslisboom drift: every canonical router-core row appears verbatim.
    const inbox = listeners.get("agent/inbox/inserted")[0]
    const assemble = listeners.get("system-prompt/assemble")[0]
    inbox({ agent, message: { text: "er is een bug, crash bij start" } })
    const assembly = await assemble({ sections: [] }, { agent }, async () => ({ sections: [] }))
    const section = assembly.sections.find((entry) => entry.name === "ask-kit:router")
    check("injects ask-kit:router section", Boolean(section))
    if (section) {
      const hintLines = routerCore.routingHintLines()
      for (const line of hintLines) {
        check(`decision-tree row derives from router-core (${line.split("→").pop().trim()})`, section.text.includes(line))
      }
    }

    // Routing smoke: a Dutch debugging prompt lands on debugging.
    const agent2 = { id: "route-check" }
    inbox({ agent: agent2, message: { text: "fout opsporen: waarom werkt de login niet" } })
    const routed = await assemble({ sections: [] }, { agent: agent2 }, async () => ({ sections: [] }))
    const routedSection = routed.sections.find((entry) => entry.name === "ask-kit:router")
    check("cascade routes Dutch bug phrase to debugging", Boolean(routedSection) && routedSection.text.includes("Active: debugging"))

    // Tool-injected contexts (leading tool-result blocks) must not flip routing.
    const agentCtx = { id: "ctx-check" }
    inbox({ agent: agentCtx, message: { content: [{ type: "tool-result", toolCallId: "t1", content: [] }, { type: "text", text: "er is een bug" }] } })
    const ctxAssembly = await assemble({ sections: [] }, { agent: agentCtx }, async () => ({ sections: [] }))
    const ctxSection = ctxAssembly.sections.find((entry) => entry.name === "ask-kit:router")
    check("tool-injected context does not route", Boolean(ctxSection) && !ctxSection.text.includes("Active:"))

    // Review-debt machinery mirrors router-core's own nudge wording.
    const agent3 = { id: "flip-check" }
    await pre({ name: "edit", agent: agent3 }, async () => ({ kind: "allow" }))
    const flagged = await assemble({ sections: [] }, { agent: agent3 }, async () => ({ sections: [] }))
    const flaggedText = flagged.sections.find((entry) => entry.name === "ask-kit:router").text
    const coreDebtOverview = routerCore.buildSkillOverview({
      matchedSkills: [], needsCodeReview: true, needsDesignReview: false,
      shouldCaptureImprovement: false, executionProfile: null, toolCallCount: 0,
      interactionCountSinceSkillLoad: 0, recentToolIds: [], recentEditedPaths: [],
      hasDoneSessionAudit: true, skillsLoadedCount: 1,
    })
    for (const line of coreDebtOverview.split("\n").filter((l) => l.startsWith("→"))) {
      check(`nudge derives from router-core (${line.slice(0, 40)}…)`, flaggedText.includes(line))
    }
    listeners.get("tools/result")[0]({ name: "skill", agent: agent3, arguments: { name: "code-review" } }, { isError: false })
    const cleared = await assemble({ sections: [] }, { agent: agent3 }, async () => ({ sections: [] }))
    const clearedText = cleared.sections.find((entry) => entry.name === "ask-kit:router").text
    check("code-review load clears review nudge", !clearedText.includes("→ Code edited"))
    check("code-review load arms improvement capture", clearedText.includes("→ Improvement found?"))
    listeners.get("tools/result")[0]({ name: "skill", agent: agent3, arguments: { name: "session-review" } }, { isError: false })
    const improvementCleared = await assemble({ sections: [] }, { agent: agent3 }, async () => ({ sections: [] }))
    const improvementClearedText = improvementCleared.sections.find((entry) => entry.name === "ask-kit:router").text
    check("session-review load clears improvement nudge", !improvementClearedText.includes("→ Improvement found?"))

    // Wrap-up steering: a completion phrase with pending review debt steers
    // the agent toward the matching review skill (once per episode) instead
    // of silently clearing the nudge — the chip stays until the review loads.
    const steered = []
    const steerAgent = { id: "steer-check", steer: (msg) => steered.push(msg) }
    await pre({ name: "edit", agent: steerAgent }, async () => ({ kind: "allow" }))
    inbox({ agent: steerAgent, message: { text: "ik ben klaar" } })
    const firstSteerText = steered[0]?.content?.[0]?.text ?? ""
    check("completion steers code-review once", steered.length === 1 && firstSteerText.includes("'code-review'"))
    inbox({ agent: steerAgent, message: { text: "nogmaals klaar" } })
    check("repeat completion does not re-steer", steered.length === 1)
    const steeredAssembly = await assemble({ sections: [] }, { agent: steerAgent }, async () => ({ sections: [] }))
    const steeredText = steeredAssembly.sections.find((entry) => entry.name === "ask-kit:router").text
    check("completion keeps review nudge armed", steeredText.includes("→ Code edited"))
    listeners.get("tools/result")[0]({ name: "skill", agent: steerAgent, arguments: { name: "code-review" } }, { isError: false })
    const afterSteerReview = await assemble({ sections: [] }, { agent: steerAgent }, async () => ({ sections: [] }))
    const afterSteerReviewText = afterSteerReview.sections.find((entry) => entry.name === "ask-kit:router").text
    check("code-review load clears steer debt", !afterSteerReviewText.includes("→ Code edited"))
    check("code-review load arms improvement after steer", afterSteerReviewText.includes("→ Improvement found?"))
    inbox({ agent: steerAgent, message: { text: "klaar" } })
    const secondSteerText = steered[1]?.content?.[0]?.text ?? ""
    check("completion steers session-review once", steered.length === 2 && secondSteerText.includes("'session-review'"))
    // write-skill resolves improvement intent, so a fresh improvement episode
    // later can steer toward session-review again.
    const steeredWrite = []
    const writeAgent = { id: "steer-check3", steer: (msg) => steeredWrite.push(msg) }
    listeners.get("tools/result")[0]({ name: "skill", agent: writeAgent, arguments: { name: "verification" } }, { isError: false })
    inbox({ agent: writeAgent, message: { text: "klaar" } })
    check("improvement steers session-review before write-skill", steeredWrite.length === 1)
    listeners.get("tools/result")[0]({ name: "skill", agent: writeAgent, arguments: { name: "write-skill" } }, { isError: false })
    listeners.get("tools/result")[0]({ name: "skill", agent: writeAgent, arguments: { name: "verification" } }, { isError: false })
    inbox({ agent: writeAgent, message: { text: "klaar" } })
    check("write-skill resets session-review steer guard", steeredWrite.length === 2)
    // Design debt: loading ui-ux arms design-review, completion steers it.
    const designSteered = []
    const designAgent = { id: "steer-check2", steer: (msg) => designSteered.push(msg) }
    listeners.get("tools/result")[0]({ name: "skill", agent: designAgent, arguments: { name: "ui-ux" } }, { isError: false })
    inbox({ agent: designAgent, message: { text: "done" } })
    const designSteerText = designSteered[0]?.content?.[0]?.text ?? ""
    check("completion steers design-review once", designSteered.length === 1 && designSteerText.includes("'design-review'"))

    // Panel state bridge (dsh-panel-widget): mutations append whole-value
    // ask-kit/state events and the askKit projection unit folds them.
    check("registers askKit projection unit", projections.length === 1
      && projections[0].key === "askKit" && typeof projections[0].apply === "function")
    if (projections.length === 1) {
      const unit = projections[0]
      const appended = []
      const bridgeAgent = { id: "bridge-check", session: { append: (type, data) => appended.push({ type, data }) } }
      await pre({ name: "edit", agent: bridgeAgent }, async () => ({ kind: "allow" }))
      listeners.get("tools/result")[0]({ name: "skill", agent: bridgeAgent, arguments: { name: "ui-ux" } }, { isError: false })
      check("mutations append whole-value panel events", appended.length >= 2
        && appended.every((event) => event.type === "ask-kit/state"))
      let state = unit.init()
      for (const event of appended) state = unit.apply(state, event)
      check("fold lands on the last whole value", state !== null && state.needsDesignReview === true
        && Array.isArray(state.loadedSkills) && state.loadedSkills.includes("ui-ux"))
      check("schema accepts the folded view", unit.schema.parse(state) === state)
      check("schema accepts null (pre-first-event)", unit.schema.parse(null) === null)
      check("schema rejects non-object views", throws(() => unit.schema.parse(42)))
      check("non-panel events leave state untouched",
        unit.apply(state, { type: "todo/write", data: {} }) === state)
      check("malformed payload cannot poison the fold",
        unit.apply(state, { type: "ask-kit/state", data: { loadedSkills: "nope" } }) === state)
      // The edit flip publishes only on false→true so repeat edits stay quiet.
      const before = appended.length
      await pre({ name: "edit", agent: bridgeAgent }, async () => ({ kind: "allow" }))
      check("repeat code edit does not re-publish", appended.length === before)
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }

  // Repo-layout import: the same file must also load straight from the
  // checkout, where router-core resolves via ../core instead of ../vendor.
  const repoMod = await import(pathToFileURL(pluginSourcePath).href)
  check("repo-checkout layout imports", typeof repoMod.apply === "function")

  if (failures > 0) {
    console.error(`\ncheck-dsh-plugin: ${failures} failure(s).`)
    process.exit(1)
  }
  console.log("\ncheck-dsh-plugin: all checks passed.")
}

main().catch((error) => {
  console.error(`check-dsh-plugin crashed: ${error && error.stack || error}`)
  process.exit(1)
})
