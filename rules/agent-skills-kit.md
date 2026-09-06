# Agent Skills Kit — Router

The `agent-skills-router` plugin injects a decision tree into every prompt under the `╌ Agent Skills Kit ╌` header.

## Decision tree

```
Specify requirements, build design brief → spec
Clarify scope, plan ambiguous work       → intake
Debug bug, crash, failing test, error    → debugging
Review code changes before handoff       → code-review
Verify claim, prove it works             → verification
Audit, refactor, reduce tech debt        → improve
Reflect on session, file improvement     → session-review
Coordinate multi-agent, parallel tasks   → agent-workflows
Create or revise a skill                 → write-skill
Design or polish UI/UX                   → ui-ux
Write text that reads human, not AI      → text-writing
Normal software work (default)           → develop
```

## Nudges from the router

| Nudge | Meaning |
|-------|---------|
| `→ Code edited — skill(name: 'code-review')` | A code edit tool ran. Load code-review before claiming done. |
| `→ Design produced — skill(name: 'design-review')` | The `ui-ux` skill was loaded. Filter the UI for AI-default slop before showing it. |
| `→ Working without loaded skill` | 5+ interactions without loading any skill. Load one now. |
| `→ Improvement found? skill(name: 'session-review')` | Session uncovered a reusable workflow gap worth filing. |

## Handoff to subagents

Include the same decision tree in the handoff prompt so subagents also know which skill to load.

## Slash commands

Every skill also ships as a slash command that loads its skill. `commands/<name>.md` is the canonical source; `export-platform-skills.js` generates `.opencode/commands/` (OpenCode) and `.github/prompts/*.prompt.md` (Copilot/VS Code). Claude Code and dsh get their command surface for free from their skills. Never hand-edit the generated copies.
