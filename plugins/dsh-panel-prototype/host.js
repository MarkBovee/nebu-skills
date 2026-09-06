// ask-kit panel prototype — HOST half (cordis_define `code.host` body).
// Companion of the ask-kit preset row: the row owns decision-tree injection and
// canonical tracking; this half only keeps a shadow of the same signals and
// serves them to the client half over the package RPC. Deliberately NO
// system-prompt injection here — running both would double the section.

// Fresh per-session tracking state, same fields the OpenCode router keeps.
function emptyState() {
  return {
    matchedSkills: [], lastMatch: '', matchedAt: 0,
    needsCodeReview: false, needsDesignReview: false, shouldCaptureImprovement: false,
    skillsLoadedCount: 0, loadedSkills: [], interactionCountSinceSkillLoad: 0,
  }
}

const states = new Map()

// Resolve (and lazily create) the state bucket for one agent/session key.
function stateFor(key) {
  const k = key || 'default'
  let s = states.get(k)
  if (!s) { s = emptyState(); states.set(k, s) }
  return s
}

// Most recently touched state bucket, used when the caller has no key yet.
function latestState() {
  let newest = null
  for (const s of states.values()) {
    if (!newest || (s.matchedAt || 0) >= (newest.matchedAt || 0)) newest = s
  }
  return newest
}

const CODE_EDIT_TOOLS = new Set(['edit', 'write', 'apply_patch'])
const REVIEW_SKILL = 'code-review'
const VERIFICATION_SKILL = 'verification'
const WRITE_SKILL_SKILL = 'write-skill'
const UI_UX_SKILL = 'ui-ux'
const DESIGN_REVIEW_SKILL = 'design-review'

// Extract the requested skill name from skill-tool arguments.
function skillNameOf(args) {
  const v = args?.name || args?.skill
  return typeof v === 'string' ? v.trim() : ''
}

return {
  apply(ctx) {
    // Observe dispatches: mark review debt on code-edit tools.
    ctx.on('tools/pre-execute', (exec, next) => {
      try {
        const name = typeof exec?.name === 'string' ? exec.name : ''
        if (name && CODE_EDIT_TOOLS.has(name)) {
          stateFor(exec.agent && exec.agent.id).needsCodeReview = true
        }
      } catch { /* tracking must never break dispatch */ }
      return next()
    })

    // Count successful skill loads and apply the kit's flag flips.
    ctx.on('tools/result', (exec, result) => {
      try {
        if (exec?.name !== 'skill' || !result || result.isError) return
        const st = stateFor(exec.agent && exec.agent.id)
        st.skillsLoadedCount += 1
        st.interactionCountSinceSkillLoad = 0
        const loaded = skillNameOf(exec.arguments)
        if (loaded && !st.loadedSkills.includes(loaded)) st.loadedSkills.push(loaded)
        st.lastMatch = loaded || st.lastMatch
        if (loaded === REVIEW_SKILL) { st.needsCodeReview = false; st.shouldCaptureImprovement = true }
        else if (loaded === VERIFICATION_SKILL) { st.shouldCaptureImprovement = true }
        else if (loaded === WRITE_SKILL_SKILL) { st.shouldCaptureImprovement = false }
        else if (loaded === UI_UX_SKILL) { st.needsDesignReview = true }
        else if (loaded === DESIGN_REVIEW_SKILL) { st.needsDesignReview = false }
      } catch { /* tracking must never break results */ }
    })

    // Package-private RPC feeding the composer status panel.
    harness.handle('ask-kit/state', (args) => {
      const wanted = args && typeof args.sessionId === 'string' ? args.sessionId : ''
      const st = (wanted && states.get(wanted)) || latestState() || emptyState()
      return {
        loadedSkills: st.loadedSkills.slice(-6),
        lastMatch: st.lastMatch,
        needsCodeReview: st.needsCodeReview,
        needsDesignReview: st.needsDesignReview,
        shouldCaptureImprovement: st.shouldCaptureImprovement,
        interactionCountSinceSkillLoad: st.interactionCountSinceSkillLoad,
        skillsLoadedCount: st.skillsLoadedCount,
        keyed: Boolean(wanted && states.get(wanted)),
      }
    })
  },
}
