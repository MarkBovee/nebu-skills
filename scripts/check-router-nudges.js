#!/usr/bin/env node

// Drive the OpenCode router plugin through scripted hook sequences and assert
// the exact nudge behavior (decision-tree audit, auto-match, blocked-tool hint,
// needsCodeReview / needsDesignReview set-and-clear paths). Exits non-zero on
// any failure so CI catches routing regressions without a manual session test.

const {
  COMPLETION_PHRASES,
  routingHintLines,
} = require("../core/router-core")

const PLUGIN_PATH = require("node:path").resolve(__dirname, "..", "plugins", "agent-skills-router.mjs")

let failedChecks = 0

// Record one assertion result and keep going so a run reports every failure.
function check(label, condition, detail) {
  if (condition) {
    console.log(`OK: ${label}`)
    return
  }

  failedChecks += 1
  console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ""}`)
}

async function main() {
  const { AgentSkillsRouter } = await import(PLUGIN_PATH)
  const plugin = await AgentSkillsRouter()
  await plugin["session.created"]()

  // Fresh session: first prompt injects the skill catalog audit plus decision tree.
  const auditAppend = await plugin["tui.prompt.append"]({ prompt: "start hier" })
  const auditText = auditAppend?.append || ""
  check("first prompt contains session audit header", auditText.includes("FIRST ACTION: scan the decision tree"))
  check("first prompt contains kit overview", auditText.includes("╌ Agent Skills Kit ╌"))

  // Blocked-tool guard: bash before any skill load returns the derived hint rows.
  const blocked = await plugin["tool.execute.before"]({ tool: "bash" })
  const blockedError = typeof blocked?.tool_error === "string" ? blocked.tool_error : ""
  check("blocked-tool message asks for a skill load", blockedError.includes("Load a skill first"))
  const expectedHint = routingHintLines().join("\n")
  check(
    "blocked-tool hint matches routingHintLines() exactly",
    blockedError.endsWith(expectedHint),
    `expected suffix:\n${expectedHint}`,
  )

  // Auto-match nudge: a debugging-shaped prompt proposes the matching skill.
  const matchAppend = await plugin["tui.prompt.append"]({ prompt: "fix this bug in the parser" })
  check(
    "auto-match nudge proposes debugging",
    (matchAppend?.append || "").includes("Match: debugging"),
  )

  // Interaction guard: prompts count even when no tools run between them.
  for (let interaction = 0; interaction < 2; interaction += 1) {
    const append = await plugin["tui.prompt.append"]({ prompt: `routine interaction ${interaction}` })
    check(
      `interaction guard stays quiet before five actions (${interaction + 3})`,
      !(append?.append || "").includes("Working through 5 actions"),
    )
  }
  const guardAppend = await plugin["tui.prompt.append"]({ prompt: "fifth routine interaction" })
  check(
    "interaction guard uses five actions without tools",
    (guardAppend?.append || "").includes("Working through 5 actions"),
  )

  // A successful skill load resets the interaction guard.
  await plugin["tool.execute.after"]({ tool: "skill" }, { args: { name: "develop" } })
  const afterSkillLoad = await plugin["tui.prompt.append"]({ prompt: "reset check" })
  check(
    "skill load resets interaction guard",
    !(afterSkillLoad?.append || "").includes("Working through 5 actions"),
  )

  // Code-edit tracking: an edit tool sets the code-review nudge.
  await plugin["tool.execute.after"]({ tool: "edit" }, {})
  const afterEdit = await plugin["tui.prompt.append"]({ prompt: "volgende stap" })
  check(
    "code edit sets code-review nudge",
    (afterEdit?.append || "").includes("`skill(name: 'code-review')`"),
  )

  // Design gate: loading ui-ux arms the design-review nudge until it is loaded.
  await plugin["tool.execute.after"]({ tool: "skill" }, { args: { name: "ui-ux" } })
  const afterUiUx = await plugin["tui.prompt.append"]({ prompt: "check de pagina" })
  check(
    "ui-ux load sets design-review nudge",
    (afterUiUx?.append || "").includes("`skill(name: 'design-review')`"),
  )
  await plugin["tool.execute.after"]({ tool: "skill" }, { args: { name: "design-review" } })
  const afterDesignReview = await plugin["tui.prompt.append"]({ prompt: "check de pagina" })
  check(
    "design-review load clears design-review nudge",
    !(afterDesignReview?.append || "").includes("design-review"),
  )

  // Completion path: a completion phrase clears both review nudges and files the improvement hook.
  const completionWord = COMPLETION_PHRASES[0]
  await plugin["tool.execute.after"]({ tool: "write" }, {})
  const beforeCompletion = await plugin["tui.prompt.append"]({ prompt: "nog een ding" })
  check(
    "second edit keeps code-review nudge armed",
    (beforeCompletion?.append || "").includes("`skill(name: 'code-review')`"),
  )
  const afterCompletion = await plugin["tui.prompt.append"]({ prompt: `ik ben ${completionWord}` })
  // Flag clears land after the completion prompt renders; assert on the follow-up.
  const postCompletion = await plugin["tui.prompt.append"]({ prompt: "en nu verder" })
  const completionText = postCompletion?.append || ""
  check(
    "completion phrase clears code-review nudge",
    !completionText.includes("Code edited"),
  )
  check(
    "completion phrase clears design-review nudge",
    !completionText.includes("Design produced"),
  )
  check(
    "completion phrase arms session-review hint",
    completionText.includes("`skill(name: 'session-review')`"),
  )

  // Loading session-review files the improvement, so the capture hint clears.
  await plugin["tool.execute.after"]({ tool: "skill" }, { args: { name: "session-review" } })
  const afterSessionReview = await plugin["tui.prompt.append"]({ prompt: "en nu verder" })
  check(
    "session-review load clears improvement hint",
    !(afterSessionReview?.append || "").includes("`skill(name: 'session-review')`"),
  )

  if (failedChecks > 0) {
    console.error(`\n${failedChecks} nudge check(s) failed.`)
    process.exitCode = 1
    return
  }

  console.log("\nAll router nudge checks passed.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
