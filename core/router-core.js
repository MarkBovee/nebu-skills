const fs = require("node:fs/promises")
const path = require("node:path")

const DEFAULT_MAX_HINTS = 4
const DEFAULT_MAX_LISTED_SKILLS = 8
const INTERACTION_GUARD_THRESHOLD = 5
const MAX_SESSION_CACHE = 100
const CODE_EDIT_TOOL_IDS = new Set(["edit", "write", "apply_patch"])

const SKILL_DEVELOP = "develop"
const SKILL_INTAKE = "intake"
const SKILL_SPEC = "spec"
const SKILL_CODE_REVIEW = "code-review"
const SKILL_VERIFICATION = "verification"
const SKILL_DEBUGGING = "debugging"
const SKILL_IMPROVE = "improve"
const SKILL_UI_UX = "ui-ux"
const SKILL_DESIGN_REVIEW = "design-review"
const SKILL_SESSION_REVIEW = "session-review"
const SKILL_AGENT_WORKFLOWS = "agent-workflows"
const SKILL_WRITE_SKILL = "write-skill"
const SKILL_TEXT_WRITING = "text-writing"
const VALID_EXECUTION_TIERS = new Set(["light", "standard", "heavy", "deep"])
const VALID_DELEGATION_MODES = new Set(["auto", "prefer-subagent", "owner-only"])

const CODE_WORK_TOOL_IDS = new Set(["edit", "write", "apply_patch"])
const RECENT_TOOL_MAX = 20

const IMPROVE_PHRASES = [
  "improve", "audit", "tech debt", "tech debt audit", "audit codebase",
  "improve codebase", "direction", "audit and plan", "refactor this",
  "refactoren", "code cleanup", "opschonen", "simplify this code",
  "vereenvoudigen", "remove over-engineering", "deduplicate logic",
  "restructure this code", "reduce complexity", "untangle this",
  "clean architecture mess", "clean up", "debt", "code smell",
]

// Signal phrases per skill. Case-insensitive match. Order = cascade priority.
const BUG_PHRASES = [
  "bug", "failing test", "broken build", "debug", "debuggen", "error",
  "start debugging", "start investigating", "fout opsporen", "crash",
  "stack trace", "race condition", "memory leak", "not working",
  "doesn't work", "broke", "regression",
  "slow startup", "timeout", "hanging", "hangt", "crash loop",
  "None", "target_temp", "malfunction", "storing",
]
const UI_PHRASES = [
  "design a ui", "redesign this page", "improve ux", "polish the frontend",
  "landing page design", "dashboard design", "mobile app ui", "design system",
  "ui review", "redesign the frontend", "improve this page", "ux",
  "user interface", "frontend design", "visual design", "css polish",
]
const SESSION_REVIEW_PHRASES = [
  "retrospective", "retro", "reflect on session", "how did i use skills",
  "file an issue", "create issue", "github issue",
  "file issue", "gh issue create", "open issue", "create ticket",
]
const AGENT_PHRASES = [
  "multi-agent", "parallel work", "agent coordination", "task handoff",
  "subagent delegation", "parallelize",
]
const WRITE_SKILL_PHRASES = [
  "create skill", "revise skill", "skill design", "trigger-focused",
  "write skills", "improve skills", "skill improvement", "skill gap",
  "workflow improvement", "routing gap", "missing guardrail",
  "prompt pack improvement", "reusable improvement", "agent missed",
  "auto improvement", "new skill", "write a skill", "author skill",
]
const REVIEW_PHRASES = [
  "review", "nakijken", "diff", "pull request", "code review",
  "fresh eyes", "start reviewing", "review deze wijziging",
  "after code changes", "after coding", "before claiming done",
  "code reviewen", "check de wijziging", "review changes",
  "second look", "bekijk de diff", "controleer de code",
  "code check", "diff review", "PR review",
]
const COMPLETION_PHRASES = [
  "done", "finished", "ready", "handoff", "hand off", "wrap up",
  "claim success", "klaar", "gereed", "afronden", "afgerond",
  "task complete", "finishing work", "workspace done", "inleveren",
  "all done", "good to go",
  "verify", "verifiëren", "prove", "controleren of het werkt",
  "bewijzen dat het werkt",
  "test de fix", "check of het werkt", "validate", "valideren",
  "cleanup", "clean up",
]
const SPEC_PHRASES = [
  "specify requirements", "requirements spec", "requirements specification",
  "requirements capture", "requirements engineering", "design brief",
  "decision register", "requirements traceability", "traceable requirements",
  "validation gate", "readiness gate", "handover package", "spec before build",
  "truth spine", "requirements-driven", "formalize requirements",
]

// Signal phrases for human-first writing. Chosen to avoid colliding with
// develop triggers (write/rewrite) and write-skill phrases (create skill).
const TEXT_WRITING_PHRASES = [
  "anti-slop", "make this sound human", "sound human", "not read like ai",
  "read like ai", "not ai", "write a tweet", "draft email", "draft an email",
  "write an email", "cover letter", "linkedin post", "blog post", "newsletter",
  "copywriting", "schrijf als mens", "niet ai", "menselijk laten klinken",
]

const AMBIGUITY_PHRASES = [
  "brainstorm", "brainstormen", "fuzzy idea", "design tradeoff",
  "unsure what to build", "product direction", "idee uitwerken",
  "ambiguous", "unclear scope", "behavior-changing work",
  "fuzzy requirements", "what should we build", "wat moeten we bouwen",
  "wat moeten we maken", "best approach", "how should we approach",
  "not sure where to start", "start by clarifying", "start with questions",
  "ik weet niet waar te beginnen", "hoe pakken we dit aan",
  "plan", "plannen", "multi-file work", "multi-phase work", "migration",
  "sequencing risk",
  "staged refactor", "stages", "service by service",
  "dependency chain", "sequential steps",
  "per service", "per laag", "stap voor stap",
  "start planning", "start with a plan",
  "werk voorplannen", "uncertain", "unsure", "which approach",
  "cross-cutting", "cross cutting", "scope is unclear",
  "requirements are unclear", "what should we do next", "what next",
]

function createEmptySessionState() {
  return {
    matchedSkills: [], needsCodeReview: false, shouldCaptureImprovement: false,
    needsDesignReview: false,
    executionProfile: null,
    toolCallCount: 0, interactionCountSinceSkillLoad: 0,
    recentToolIds: [], recentEditedPaths: [],
    hasDoneSessionAudit: false, skillsLoadedCount: 0,
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function hasPhraseSignal(query, phrases) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return false
  return phrases.some((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    try {
      return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(normalized)
    } catch {
      return normalized.includes(phrase)
    }
  })
}

function stripQuotes(value) {
  return value.replace(/^['"]|['"]$/g, "").trim()
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const result = {}
  let currentListKey = null
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const listItem = line.match(/^[-*]\s+(.*)$/)
    if (currentListKey && listItem) {
      if (!Array.isArray(result[currentListKey])) result[currentListKey] = []
      result[currentListKey].push(stripQuotes(listItem[1]))
      continue
    }
    const keyValue = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!keyValue) continue
    const [, key, rawValue] = keyValue
    if (!rawValue) { currentListKey = key; result[key] = []; continue }
    currentListKey = null
    result[key] = stripQuotes(rawValue)
  }
  return result
}

function stripFrontmatter(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
}

function toSingleLine(text, maxLength = 120) {
  const singleLine = text.replace(/\s+/g, " ").trim()
  if (singleLine.length <= maxLength) return singleLine
  return `${singleLine.slice(0, maxLength - 3).trim()}...`
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean)
  if (typeof value === "string") return [value.trim()].filter(Boolean)
  return []
}

function parseBooleanField(value) {
  if (value === true || value === false) return value
  if (typeof value !== "string") return false
  return value.trim().toLowerCase() === "true"
}

function parseExecutionTier(value, fallback = "standard") {
  if (typeof value !== "string") return fallback
  const normalized = value.trim().toLowerCase()
  return VALID_EXECUTION_TIERS.has(normalized) ? normalized : fallback
}

function parseDelegationMode(value, fallback = "auto") {
  if (typeof value !== "string") return fallback
  const normalized = value.trim().toLowerCase()
  return VALID_DELEGATION_MODES.has(normalized) ? normalized : fallback
}

async function pathExists(target) {
  try { await fs.access(target); return true } catch { return false }
}

async function findSkillFiles(root) {
  const results = []
  const entries = await fs.readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name)
    if (entry.isDirectory()) { results.push(...(await findSkillFiles(entryPath))); continue }
    if (entry.isFile() && entry.name === "SKILL.md") results.push(entryPath)
  }
  return results
}

async function loadSkills(pathsToScan) {
  const files = []
  for (const skillPath of pathsToScan) {
    if (!(await pathExists(skillPath))) continue
    files.push(...(await findSkillFiles(skillPath)))
  }
  const skills = []
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8")
    const frontmatter = parseFrontmatter(content)
    const name = (frontmatter.name || path.basename(path.dirname(filePath))).trim()
    const description = (frontmatter.description || "").trim()
    const triggers = normalizeStringList(frontmatter.triggers)
    const isDefault = parseBooleanField(frontmatter.default)
    const executionTier = parseExecutionTier(frontmatter.execution_tier)
    const delegationDefault = parseDelegationMode(frontmatter.delegation_default)
    if (!name || !description) continue
    skills.push({ name, description, triggers, isDefault, executionTier, delegationDefault, filePath })
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name))
}

function findSkill(skills, name) {
  return skills.find((skill) => skill.name === name)
}

function agentTierForExecutionTier(executionTier) {
  switch (executionTier) {
    case "light": return "mini"
    case "heavy": return "high"
    case "deep": return "xhigh"
    default: return "default"
  }
}

function buildExecutionProfile(matchedSkill, query) {
  if (!matchedSkill) return null
  let executionTier = matchedSkill.executionTier || "standard"
  let delegationMode = matchedSkill.delegationDefault || "auto"
  if (executionTier === "light" && delegationMode === "auto") delegationMode = "prefer-subagent"
  if (executionTier === "deep" && delegationMode === "auto") delegationMode = "owner-only"
  return { executionTier, agentTier: agentTierForExecutionTier(executionTier), delegationMode, matchedSkill: matchedSkill.name }
}

const OVERVIEW_ROWS = [
  { label: "Specify requirements, build design brief",   skill: SKILL_SPEC },
  { label: "Clarify scope, plan ambiguous work",       skill: SKILL_INTAKE },
  { label: "Debug bug, crash, failing test, error",    skill: SKILL_DEBUGGING },
  { label: "Review code changes before handoff",       skill: SKILL_CODE_REVIEW },
  { label: "Verify claim, prove it works",             skill: SKILL_VERIFICATION },
  { label: "Audit, refactor, reduce tech debt",        skill: SKILL_IMPROVE },
  { label: "Reflect on session, file improvement",     skill: SKILL_SESSION_REVIEW },
  { label: "Coordinate multi-agent, parallel tasks",   skill: SKILL_AGENT_WORKFLOWS },
  { label: "Create or revise a skill",                 skill: SKILL_WRITE_SKILL },
  { label: "Design or polish UI/UX",                   skill: SKILL_UI_UX },
  { label: "Write text that reads human, not AI",      skill: SKILL_TEXT_WRITING },
  { label: "Normal software work (default)",           skill: SKILL_DEVELOP },
]

// Render the canonical decision-tree rows as plain hint lines so every surface
// that mirrors the tree (plugin blocked-tool message, docs checks) derives
// from OVERVIEW_ROWS instead of keeping its own copy in sync.
function routingHintLines() {
  return OVERVIEW_ROWS.map((row) => `  ${row.label} → ${row.skill}`)
}

function buildSkillOverview(sessionState) {
  const interactionsSinceLoad = sessionState.interactionCountSinceSkillLoad || 0
  const skillsLoaded = (sessionState.skillsLoadedCount || 0) > 0
  const lines = [
    "╌ Agent Skills Kit ╌",
    skillsLoaded
      ? "Decision tree — load a different skill via `skill(name: '...')`:"
      : "Load matching skill *now* via `skill(name: '...')` before tools:",
    "",
  ]
  for (const row of OVERVIEW_ROWS) {
    lines.push(`  ${row.label} → ${row.skill}`)
  }
  const matched = sessionState.matchedSkills || []
  if (matched.length > 0) {
    lines.push("")
    lines.push(`Active: ${matched.map(s => s.name).join("+")}${sessionState.executionProfile ? ` (${sessionState.executionProfile.executionTier}/${sessionState.executionProfile.delegationMode})` : ""}`)
  }
  if (sessionState.needsCodeReview) {
    lines.push("→ Code edited — `skill(name: 'code-review')` before claiming done")
  }
  if (sessionState.needsDesignReview) {
    lines.push("→ Design produced — `skill(name: 'design-review')` filters AI defaults before showing")
  }
  if (interactionsSinceLoad >= INTERACTION_GUARD_THRESHOLD && (sessionState.skillsLoadedCount || 0) === 0) {
    lines.push("→ Working through 5 actions without a loaded skill — `skill(name: 'develop')` sets workflow guardrails")
  }
  if (sessionState.shouldCaptureImprovement) {
    lines.push("→ Improvement found? `skill(name: 'session-review')` to file issue")
  }
  return lines.join("\n")
}

function cascadeRoute(query, skills, sessionState) {
  const q = query.trim().toLowerCase()
  if (!q) {
    const fallback = findSkill(skills, SKILL_DEVELOP)
    return { matchedSkills: fallback ? [fallback] : [], executionProfile: buildExecutionProfile(fallback, "") }
  }
  const tryRoute = (phrases, name) => {
    if (!hasPhraseSignal(q, phrases)) return null
    const skill = findSkill(skills, name)
    return skill ? { matchedSkills: [skill], executionProfile: buildExecutionProfile(skill, q) } : null
  }
return (
    tryRoute(SPEC_PHRASES, SKILL_SPEC) ||                   // 1. Start (explicit spec)
    tryRoute(AMBIGUITY_PHRASES, SKILL_INTAKE) ||            // 2. Start
    tryRoute(BUG_PHRASES, SKILL_DEBUGGING) ||               // 2. Execute
    tryRoute(REVIEW_PHRASES, SKILL_CODE_REVIEW) ||          // 3. Validate
    (sessionState.needsCodeReview && (() => {
      if (!hasPhraseSignal(q, COMPLETION_PHRASES)) return null
      const primary = findSkill(skills, SKILL_CODE_REVIEW)
      if (!primary) return null
      const secondary = findSkill(skills, SKILL_VERIFICATION)
      return { matchedSkills: secondary ? [primary, secondary] : [primary], executionProfile: buildExecutionProfile(primary, q) }
    })()) ||
    tryRoute(COMPLETION_PHRASES, SKILL_VERIFICATION) ||     // 4. Validate
    tryRoute(IMPROVE_PHRASES, SKILL_IMPROVE) ||           // 5. Improve
    tryRoute(SESSION_REVIEW_PHRASES, SKILL_SESSION_REVIEW) ||         // 6. Improve
    tryRoute(AGENT_PHRASES, SKILL_AGENT_WORKFLOWS) ||       // 7. Coordinate
    tryRoute(WRITE_SKILL_PHRASES, SKILL_WRITE_SKILL) ||     // 8. Coordinate
    tryRoute(UI_PHRASES, SKILL_UI_UX) ||                    // 9. Product
    tryRoute(TEXT_WRITING_PHRASES, SKILL_TEXT_WRITING) ||   // 10. Product
    (() => {
      const fallback = findSkill(skills, SKILL_DEVELOP)
      return { matchedSkills: fallback ? [fallback] : [], executionProfile: buildExecutionProfile(fallback, q) }
    })()                                                     // 11. Execute (default)
  )
}

function trimSessionCache(cache, maxEntries) {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value
    if (!oldestKey) return
    cache.delete(oldestKey)
  }
}

function setSessionState(cache, sessionID, updates) {
  if (!sessionID) return null
  const current = cache.get(sessionID) || createEmptySessionState()
  const next = { ...current, ...updates }
  cache.delete(sessionID)
  cache.set(sessionID, next)
  trimSessionCache(cache, MAX_SESSION_CACHE)
  return next
}

function getSessionState(cache, sessionID) {
  if (!sessionID) return createEmptySessionState()
  return cache.get(sessionID) || createEmptySessionState()
}

// Check whether a provider's usage currently falls inside its peak-pricing
// or session-drain window. Anthropic drains Claude session limits faster on
// weekdays 13:00-19:00 UTC; DeepSeek doubles its price during 01:00-04:00
// or 06:00-10:00 UTC. Returns false for unknown providers or off-window times.
function isInPeakWindow(date, providerID) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false
  const provider = String(providerID || "").toLowerCase()
  const day = date.getUTCDay()
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60

  if (provider.includes("anthropic") || provider.includes("claude")) {
    return day >= 1 && day <= 5 && hour >= 13 && hour < 19
  }

  if (provider.includes("deepseek")) {
    return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10)
  }

  return false
}

// Build a short human-readable description of a provider's active peak window.
function describePeakWindow(providerID) {
  const provider = String(providerID || "").toLowerCase()
  if (provider.includes("anthropic") || provider.includes("claude")) {
    return "Claude peak hours (Mon-Fri 13:00-19:00 UTC) - session limit drains faster than usual"
  }
  if (provider.includes("deepseek")) {
    return "DeepSeek peak window (01:00-04:00 or 06:00-10:00 UTC) - usage costs 2x"
  }
  return ""
}

module.exports = {
  CODE_EDIT_TOOL_IDS, CODE_WORK_TOOL_IDS, DEFAULT_MAX_HINTS, DEFAULT_MAX_LISTED_SKILLS,
  INTERACTION_GUARD_THRESHOLD, RECENT_TOOL_MAX,
  VALID_DELEGATION_MODES, VALID_EXECUTION_TIERS,
  SKILL_AGENT_WORKFLOWS, SKILL_CODE_REVIEW, SKILL_DEBUGGING,
  SKILL_SESSION_REVIEW, SKILL_IMPROVE, SKILL_DEVELOP, SKILL_INTAKE, SKILL_UI_UX,
  SKILL_VERIFICATION, SKILL_WRITE_SKILL, SKILL_SPEC, COMPLETION_PHRASES, SKILL_DESIGN_REVIEW,
  SKILL_TEXT_WRITING,
  buildSkillOverview, cascadeRoute, buildExecutionProfile, loadSkills,
  createEmptySessionState, getSessionState, setSessionState,
  findSkill, hasPhraseSignal, routingHintLines,
  stripFrontmatter, toSingleLine, normalizeStringList,
  parseBooleanField, parseFrontmatter, unique,
  isInPeakWindow, describePeakWindow,
}
