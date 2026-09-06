# Changelog

All notable changes to `agent-skills-kit` live here.

Format follows Keep a Changelog. Stable releases use SemVer tags in `vX.Y.Z` form.

## Unreleased

## [1.6.4] - Unreleased

### Fixed

- **ask-kit-panel client loader registration.** The browser bundle now uses its stable roster id instead of `document.currentScript`; dsh `client-modules` bundles do not provide a reliable script URL, which caused the panel loader to register under no matching id.

## [1.6.3] - Unreleased

### Fixed

- **`develop` skill loads in dsh again (issue #32).** `skills/ask-develop/SKILL.md` shipped with 115 trailing NUL bytes, so dsh's skill provider treated it as a binary file (`FS_NOT_TEXT`) and silently dropped `develop` from the session catalog — the decision tree advertised it while `skill(name: 'develop')` failed with "unknown or no longer available". The NUL bytes are removed and the exports regenerated; `validate-plugin.js` and `export-platform-skills.js` now fail the release when any source `SKILL.md` contains a NUL byte in its first 8192 bytes, so a binary skill file can never ship again.
- **`develop` skill body is now English.** The Dutch prose in `skills/ask-develop/SKILL.md` (staged-delegation and git-workflow sections, model-tiering table) is translated; routing trigger phrases stay multilingual on purpose.

### Changed

- **"beslisboom" terminology removed.** The Dutch term is replaced with English everywhere: the dsh router's injected section is now `ask-kit:router` (was `ask-kit:beslisboom`), and comments, docs, and check labels use "decision tree". The only remaining Dutch strings are the historical stale-preset description that the installers use as a migration trigger and the trigger keywords/phrases the router must catch.

## [1.6.2] - Unreleased

### Fixed

- **`gh-inbox` now surfaces threaded discussion replies.** The discussion fetch queries each comment's `replies` connection — `Discussion.comments` only returns top-level comments and its `totalCount` ignores replies — and the new-item diff counts top-level + threaded replies, so a user reply nested under a comment is triaged like any other new comment instead of being dismissed as a silent edit/reaction (the exact miss behind issue #30). The posting step now also documents that REST cannot create discussion comments (POST returns 404) and that `addDiscussionComment` requires `replyToId` to be the thread's root comment: pointing it at a reply already inside the thread is rejected with "Parent comment is already in a thread".

## [1.6.1] - Unreleased

### Changed

- **Review nudges now steer the agent instead of silently clearing.** In the dsh router row, a completion phrase ("done", "klaar", …) with pending review debt no longer wipes the flags; it queues a load-the-skill steer toward the outstanding review skill (`code-review`, `design-review`, or `session-review` for an armed improvement capture), once per skill per episode, so the widget chip stays visible until the review is actually loaded — which is what clears it via the skill-load flip table. Loading `write-skill` still resolves the improvement intent and resets the steer guard, so a later improvement episode can steer again. Covered by new assertions in `check-dsh-plugin.js`.

## [1.6.0] - Unreleased

### Added

- **Installed-artifact verification.** New `scripts/check-installed-artifacts.sh` runs the installers into fully isolated homes (a fake dsh package shim on PATH makes the dsh preset path testable without a real dsh install) and asserts the deployed user-visible surfaces — the dsh preset description, the router prompt header, the widget status bar, the OpenCode core copy — match the repo strings, sweeps the installed tree for known-stale managed strings, and seeds a stale pre-English preset description to prove a refresh converges back to English (the exact drift that previously survived a green repo-side suite). Wired into the AGENTS.md validation list and CI.
- **Persistent dsh status widget (dual-face package).** The `askkit-1` panel demo is now a real package, `plugins/dsh-panel-widget/`, managed by both installers into `~/.dsh/client-plugins/ask-kit-panel/`: a browser face (lazy-CJS factory bundle registering the `ask-kit-status` entry in `conversation.composer.dock`) and an inert node face so the package also loads as a plain plugin row. It renders prototype semantics only — badge `╌ Agent Skills Kit ╌`, loaded-skill chips, ⚠ code-review/design-review and ✓ improvement nudges — with no decision tree in the UI. The bundle derives its own registration id from its script URL because the client-module boot graph keys bundles by the roster-entry name — the bare package name `ask-kit-panel` — so no machine-specific artifact ships in the repo.
- **Panel state bridge over session projections.** The ask-kit router row now appends the complete post-change tracking state as a whole-value `ask-kit/state` session event on every mutation (the edit flip publishes only on false→true to keep the log quiet) and registers an `askKit` projection unit through a lazy `ctx.inject(["sessionProjections"])`: a pure last-write-wins fold with a hand-rolled schema that keeps the row dependency-free. The widget reads the finished view reactively via `sessions.binding(id).session.projections.faceOf("askKit")` — no polling RPC — and sessions without an askKit value render nothing. Malformed log payloads cannot poison the fold.
- **Installer parity for the widget.** `install.sh` / `install.ps1` copy the package unconditionally, symlink it into `~/.dsh/profiles/node_modules/ask-kit-panel` so the bare name resolves for both the node loader (ESM import of `index.mjs`) and the client-module registry (`require.resolve` of its `package.json`), and manage the roster row idempotently in `~/.dsh/profiles/web/cordis.patch.yml` under marker comments referencing `name: ask-kit-panel`: an existing row is left alone, a bare `[]` placeholder is swapped for the managed section preserving every other line, and any other content gets the section appended after a blank separator. Pointing the roster name at the bare directory made the node face fail to load (Node ESM cannot import a directory); pointing it at `index.mjs` broke the client face (`index.mjs/package.json` is unresolvable), so the bare package name is the only form both faces accept.

### Changed

- `check-dsh-plugin.js` covers the new bridge: projection-unit shape, whole-value event appends, fold behavior (including malformed-payload rejection), schema boundary, and the false→true-only edit flip.

### Fixed

- **Plugin output is always English.** The dsh router row, status widget, and OpenCode variant no longer emit Dutch: the injected prompt section reads "Decision tree — …", the widget status bar shows "no skill loaded" / "⚠ code-review needed" / "✓ capture improvement?", the installer preset description is English, and `rules/agent-skills-kit.md` uses "Decision tree" throughout. Trigger phrases for routing stay intentionally multilingual so Dutch prompts still match. Both installers now migrate an existing preset's stale pre-English description on refresh (only the exact old managed default is replaced; user-edited descriptions survive).
- **`session-review` load clears the improvement flag.** Loading `session-review` now sets `shouldCaptureImprovement` back to false in both the dsh router row and the OpenCode router, so the "file issue" nudge disappears once the review skill is actually loaded — previously only `write-skill` cleared it, leaving the hint on forever. Covered by new assertions in `check-dsh-plugin.js` and `check-router-nudges.js`.

## [1.5.0] - 2026-08-25

### Added

- **dsh slash commands for every kit skill.** The `ask-kit` router row now also registers one command per skill through dsh's plugin-owned command registry (`ctx.commands.register()` via a lazy `ctx.inject(["commands"])`, mirroring how shipped rows like `/plan` register): `/spec`, `/intake`, `/debugging`, … plus companions `/design-review` and `/gh-inbox`. Decision-tree rows double as picker descriptions; a command handler steers the session with a load-the-skill prompt following the platform command-file pattern (per-workflow specifics stay in the skill body), with the typed remainder as focus (`/debugging login crash`). Steered input is wrapped in a proper user message (`id`/`role`/`content`/`source`) because dsh's agent loop forwards inbox items verbatim into the next model request. dsh has no file-based command discovery, so this closes the gap behind OpenCode/Copilot's exported command files — no generated artifacts needed.

### Fixed

- **Docs: wrong dsh command claim.** README and AGENTS.md said dsh skills "already act as slash commands"; in reality dsh only exposes model-facing skill catalogs. The docs now describe the programmatic registration, and `check-dsh-plugin.js` validates the new surface (command count/names, grammar-clean names, companion-description drift against `commands/<name>.md`, steer-handler behavior). Stale "ten skills" wording updated to fourteen.

## [1.4.0] - 2026-08-24

### Added

- **dsh router plugin (optional `ask-kit` agent preset).** `plugins/agent-skills-router.dsh.mjs` ports the OpenCode router to DeepSeek Harness as a Cordis preset row: it appends the decision-tree section to every model step via the `system-prompt/assemble` waterfall (all 12 rows derived verbatim from `routingHintLines()`), tracks per-session skill loads and review/design-review debt through `tools/pre-execute`, `tools/result`, and `agent/inbox/inserted`, clears nudges on completion phrases, and optionally gates bash/edit/write until a skill loads (`blockUntilSkillLoaded` row config, default false). The unified installer (`install.sh` / `install.ps1`) copies the deployed dsh `standard` preset once into `~/.dsh/.agent-presets/ask-kit/`, appends the managed router row, and vendors `core/router-core.js` beside it so no copy can drift; reinstalls refresh only the managed parts.
- **dsh plugin validation.** New `scripts/check-dsh-plugin.js` asserts export shape, config defaults, event wiring, strict-gate behavior, cascade routing of Dutch bug phrases, and decision-tree drift against `core/router-core.js`; wired into the AGENTS.md validation list.

## [1.3.2] - 2026-08-24

### Added

- **Router nudge regression checks.** New `scripts/check-router-nudges.js` drives the plugin through scripted hook sequences (session audit, blocked-tool guard, auto-match, code-review/design-review set-and-clear, completion path) and asserts the exact nudge output; wired into CI as "Validate router nudges".

### Fixed

- **Release gate parity.** `tag-release.sh` and `tag-release.ps1` now run `validate-plugin.js` before tagging — a stale `plugin.json` version can no longer produce a locally green tag that fails the Release workflow (the v1.2.x failure mode).
- **Ghost slash-commands removed on reinstall.** Installers now track managed command and prompt files via `.ask-managed-commands.txt` / `.ask-managed-prompts.txt` manifests in `~/.config/opencode/commands/` and `~/.copilot/prompts/`; files retired from the pack are deleted instead of surviving forever.
- **Single source for the decision-tree hint.** The plugin's blocked-tool message is now derived from `routingHintLines()` in `core/router-core.js` (`OVERVIEW_ROWS`) instead of a hand-maintained string copy.
- **`.dsh` pull-recovery gap closed.** `release-helpers.sh` and `release-helpers.ps1` (used by `update.*`) now restore generated `.dsh/` artifacts during pull recovery, matching `bootstrap.*` behavior.
- **Completion clears design nudge.** A completion phrase now clears `needsDesignReview` alongside `needsCodeReview`, so skipping the design-review filter stops the nudge after wrap-up instead of nagging forever.
- **Doc drift assertions.** `validate-plugin.js` now fails when README's `<code>N skills</code>` badge drifts from the actual skill count, when a skill lacks its `commands/<name>.md` file, or when the decision-tree rows in `rules/agent-skills-kit.md` drift from `OVERVIEW_ROWS`.

## [1.3.1] - 2026-08-20

### Added

- **New `gh-inbox` skill.** `skills/ask-gh-inbox/SKILL.md` processes the current repository's GitHub inbox: resolve the repo, fetch open issues and discussions, diff against `.gh-inbox-state.json`, triage new items, reply where the action is factual and low-risk, report, and persist state. Ships as slash command `gh-inbox`. The standalone `commands/gh-inbox.md` workflow moved into the skill; the command now loads the skill (DRY).
- **Automatic skill-match nudge in the OpenCode router.** `plugins/agent-skills-router.mjs` now runs the prompt through `cascadeRoute` and surfaces a one-line nudge (`→ Match: <skill> — call skill(name: '<skill>') now`) when a non-default skill matches and is not yet loaded, instead of leaving the agent to self-select from the decision tree alone. (#24 follow-on)
- **Provider peak-window warnings.** The router detects the active provider via the `chat.params` hook and warns once per session when a provider's peak window is active: Anthropic/Claude (weekdays 13:00–19:00 UTC, faster session-limit drain) and DeepSeek (01:00–04:00 or 06:00–10:00 UTC, 2x price). (#19)
- **`agent-workflows` progress-update guidance.** New section for long-running background subagents: emit periodic, rate-limited (milestone- or time-based, never per tool call) progress updates to the main channel — status, milestone/phase, approximate progress, blockers, and final output location; surface blocked/failed promptly and stop on completion. (#24)

### Changed

- **`ask-develop` DeepSeek peak rule.** The peak-pricing check now points to the router's automatic DeepSeek warning instead of asking the agent to self-detect the window.

## [1.3.0] - 2026-08-20

### Added

- **New `text-writing` skill.** `skills/ask-text-writing/SKILL.md` produces human-sounding text that avoids detectable AI writing patterns — banned-vocabulary list (loads `references/banned-words.md`), structure/punctuation/accuracy/formatting constraints, voice calibration, and a ten-point self-check before output. For tweets, emails, articles, copy, cover letters, and any text that must not read as AI-generated. Routing row in the decision tree (after `ui-ux`), ships as slash command `text-writing`. Adapted from [jalaalrd/anti-ai-slop-writing](https://github.com/jalaalrd/anti-ai-slop-writing) (MIT); the untracked nested clone in `skills/` is removed.

### Changed

- **`rules/coding-standards.md` markup structure comments.** New hard rule: concise start/end comments around major sections and meaningful components in HTML and other markup, labeling repeated groups without annotating every element; generated output may be minified only when comments and content-sensitive blocks are preserved as required.

## [1.2.1] - 2026-08-18

### Fixed

- **PowerShell installer command and prompt sync.** Windows installation no longer fails because wildcard paths were passed through `-LiteralPath`; generated OpenCode commands and Copilot prompts are now copied item by item.

## [1.2.0] - 2026-08-18

### Added

- **New `design-review` skill.** `skills/ask-design-review/SKILL.md` reviews an existing design, UI, or copy against an anti-default (anti-slop) checklist before shipping: quick-scan signal table, per-section checks (visual, color/typography, copy, UX/IA/a11y, visible code tells, strategic/business tells), a self-check of six questions, and a pushback protocol. Companion to `ui-ux`, not a routing row in the decision tree. Ships as slash command `design-review`.
- **Router nudge after `ui-ux`.** When the `ui-ux` skill is loaded, the plugin sets `needsDesignReview` and appends "→ Design produced — `skill(name: 'design-review')`" until `design-review` is loaded. Mirrors the existing `needsCodeReview` mechanism.

### Changed

- **`ask-ui-ux` gate.** UI workflow now runs output through the `design-review` filter before showing it, and cross-references the skill under `## Use with`.
- **Comments guidance tightened in `rules/coding-standards.md`.** Inline `why` comments are now encouraged, not optional — a comment when in doubt, never line-by-line narration. New file-level purpose comment rule: short intent comment near the top of files whose purpose goes beyond their name (shared modules, core router, platform export targets). Quality checklist updated to match.

## [1.1.0] - 2026-08-18

### Added

- **New `spec` skill — B4Code-style requirements specification.** `skills/ask-spec/SKILL.md` formalizes intent into a validated, traceable spec before development: Capture → Structure → Validate → Transfer, with the four gates (Completeness, Stakeholder, Readiness, Handover) and the truth spine (`Need → Context → Decision → Requirement → Validation → Handover → Build`). Human-owned decisions; AI accelerates, never owns. Routed ahead of `intake` in the cascade, with triggers for spec/requirements/design-brief/decision-register language.
- **Slash commands for every skill.** New canonical `commands/<name>.md` source, one per skill, each loading its skill and applying it to `$ARGUMENTS` (DRY — no duplicated workflows). `export-platform-skills.js` now generates `.opencode/commands/` (OpenCode) and `.github/prompts/*.prompt.md` (Copilot/VS Code). Claude Code and dsh get commands for free because their skills already act as slash commands. Installers sync commands into `~/.config/opencode/commands/` and `~/.copilot/prompts/`. CI/release export checks now also cover the generated command files.

## [1.0.1] - 2026-08-16

### Added

- **DeepSeek Harness (dsh) support.** New `dsh` export target in `scripts/export-platform-skills.js` generates `.dsh/skills/` with dsh-optimized frontmatter (`name` + trigger-augmented `description` capped at dsh's 500-char catalog limit, plus `whenToUse`). The unified installer now installs that variant into `~/.dsh/skills/` (rank 400, shadows the canonical shared copy) and appends marker-delimited routing guidance to `~/.dsh/AGENTS.md` exactly once when dsh is present. dsh needs no plugin wrapper: its native `skill` tool + catalog is the kit's routing model. PowerShell parity included. Preview-API exposure documented in README.

### Fixed

- **Bootstrap pull conflicts on generated dsh assets.** `bootstrap.sh`/`bootstrap.ps1` now treat `.dsh/*` as generated platform artifacts when restoring the managed checkout before a pull.
- **CI export checks cover the dsh target.** The `Ensure generated exports are committed` check in `ci.yml`/`release.yml` now also covers `.dsh/skills/*/SKILL.md`.

## [1.0.0] - 2026-08-16

### Changed

- **First 1.x release.** Marks the stable, platform-portable skill-pack baseline for OpenCode, GitHub Copilot, and Claude Code.

## [0.6.1] - 2026-07-30

### Fixed

- **`coding-standards.md` now installed on all platforms.** OpenCode already had it, Claude Code did not — `rules/coding-standards.md` is now also copied to `~/.claude/rules/`. Copilot instructions now include a summary and reference. (#18)
- **Platform-independent SKILL.md reference.** `rules/coding-standards.md` → `coding-standards.md` in `ask-code-review/SKILL.md`, so the path works regardless of where the rules are installed. (#18)
- **Release guard: validate external skill references.** `validate-plugin.js` now checks that every `rules/<file>` referenced in backtick quotes in SKILL.md actually exists in `rules/`. Blocks future releases with dangling references. (#18)

## [0.6.0] - 2026-07-29

### Added

- **Develop skill: staged delegation pattern.** New `Delegate (staged)` mode for sequential dependency chains — each stage has its own complexity tier, the main agent orchestrates with per-stage validation and commit. The model tiering table maps task complexity (light/standard/heavy) to agent type (mini→flash, default→flash, high→pro). Peak-pricing check (DeepSeek peak hours) before every dispatch. (#18)
- **Intake skill: stage detection in execution planning.** New check in the planning flow: detects whether work splits into dependent stages with mixed complexity. 10 new trigger phrases for stage signals. Expanded `AMBIGUITY_PHRASES` in router-core. (#18)
- **Agent-workflows skill: cross-reference to staged delegation.** The "Not a good fit" section now points to `develop` staged delegation for sequential dependency chains. (#18)

## [0.5.9] - 2026-07-28

### Fixed

- **PowerShell installer tolerates minimal or malformed `opencode.json`.** `instructions`, `plugin`, `permission`, and `permission.external_directory` are now initialized safely under `Set-StrictMode -Version Latest`, preventing missing-property failures during bootstrap/install.
- **PowerShell installer no longer requires admin for OpenCode skill links.** Per-skill link creation now uses the existing symlink-or-junction fallback path, matching the non-admin-safe behavior used elsewhere in the installer.
- **Release automation added.** GitHub Actions now validates changes on pushes and pull requests, then tags and publishes a GitHub Release when a versioned change reaches `main`.
- **Release metadata and routing checks synchronized.** The Claude plugin manifest now matches `VERSION`, and routing assertions use the current `improve` skill name.

### Changed

- **Intake skill: pair programming flow added.** New section with a plan→present→validate→implement flow for pair programming sessions. Triggers extended with "we moeten dit aanpakken", "laten we dit doen", "pair programming", "samenwerken". (#17)
- **Develop skill: "Plan if missing" tightened.** For new or unclear scope, intake is loaded instead of inline planning. (#17)

## [0.5.8] - 2026-07-28

### Changed

- **ask-ui-ux geüpdatet naar ui-ux-pro-max v2.x.** SKILL.md herschreven met v2 features: 161 reasoning rules, priority tabel, Design Dials (variance/motion/density), Persist pattern (MASTER.md + page overrides), uitgebreide werkstroom. Scripts (core.py, search.py, design_system.py) geüpdatet met BM25-engine, 12 domeinen, 22 stacks. Toegevoegd: validate_data.py, unit tests, references/pro-rules.md en quick-reference.md. Nieuwe data: app-interface.csv, google-fonts.csv (1924 fonts), motion.csv, 9 extra stack CSVs (angular, laravel, threejs, javafx, wpf, winui, avalonia, uno, uwp).

## [0.5.7] - 2026-07-28

### Fixed

- **PowerShell bootstrap/update pull.** Git's normal stderr output no longer terminates the installer before its exit code can be handled on Windows PowerShell.

## [0.5.0] - 2026-07-27

### Changed

- **Agent self-selects skills via the decision tree.** Router no longer does automatic phrase-based skill matching. Instead, `buildSkillOverview()` injects a decision tree every prompt — agent evaluates the task and loads via `skill(name: '...')`. Eliminates false positives and gives the agent full autonomy. README diagram and Router section updated.
- **Context-aware nudges in router.** Tracks tool usage, code edits, and skill-load events. Nudges when code is edited without review, or when many tools run without loading any skill. Session-start audit shows all available skills with descriptions.
- **Skill triggers enriched.** `develop` (rewrite, refactor, coordinator), `debugging` (slow startup, timeout, crash loop, None), `verification` (test de fix, cleanup, validate), `code-review` (check de wijziging, review changes, second look). Corresponding cascade phrase lists updated.
- **hasPhraseSignal uses word-boundary regex.** Prevents false positives (e.g. "prove" matching inside "improve") for the completion-state check.
- **Plugin error handling.** `tui.prompt.append` wrapped in try/catch — plugin errors don't break the session.
- **rules/agent-skills-kit.md ships with installer.** Beslisboom usage instructions registered in `opencode.json` instructions array so every new session has the decision tree context. Both `install.sh` and `install.ps1` updated.
- **AGENTS.md updated.** New-session validation steps (decision-tree check, plugin registration check, export check).

## [0.5.1] - 2026-07-27

### Fixed

- **install.sh copies rules instead of symlinks.** Bootstrap/update uses a temp checkout (`/tmp/agent-skills-kit-release-*/`) — symlinks broke after cleanup. Rules (`coding-standards.md`, `agent-skills-kit.md`) now copied to target for stable persistence across reboots and upgrades.

## [0.5.3] - 2026-07-27

### Fixed

- **Plugin .mjs instead of .js.** OpenCode `package.json` lacks `"type": "module"`, so `.js` was loaded as CommonJS — a plugin using `import/export` failed silently, no hook fired. `.mjs` forces ESM regardless of `package.json`.
- **Destructive tools blocked until a skill is loaded.** `tool.execute.before` blocks `edit`/`write`/`apply_patch`/`bash` while `skillsLoadedCount === 0`. The error shows the complete decision tree.

## [0.5.2] - 2026-07-27

### Changed

- **First-action instruction in plugin hook.** `buildSkillOverview` shows "Load matching skill *now*" until a skill is loaded, then "Decision tree — load different skill". No longer depends on the passive `rules/agent-skills-kit.md` document.
- **`rules/agent-skills-kit.md` back to pure reference.** No more "first action" instruction — the plugin hook injects the directive copy.
- **Duplicate const fix** in `buildSkillOverview` (router-core.js).

## [0.5.4] - 2026-07-27

### Fixed

- **Router-core require path in plugin.** `require(resolve(here, "core/router-core"))` resolved to `plugins/core/` instead of the project root — the plugin failed with `MODULE_NOT_FOUND`. Path corrected to `../core/router-core`.

## [0.5.6] - 2026-07-28

### Changed

- **code-review skill now enforces coding-standards.md explicitly.** Intro clarifies coding-standards hard rules (intent comments, DRY, meaningful names, explicit shapes, language rules, fail-fast) are correctness — not style. Review checklist includes dedicated coding-standards check.

## [0.5.5] - 2026-07-28

### Added

- **develop skill: destructive-operations guardrail.** Rule 11 added: no modifying/deleting external system state (entity registries, databases, remote config) without showing the user what will change and getting confirmation before acting. Prevents autonomous HA entity registry mutations. (#13)
- **AGENTS.md: coding-standards priority over system prompt.** Explicit priority rules: `coding-standards.md` takes precedence over generic "no comments" rules; Ponytail's boilerplate restriction does not apply to purpose comments. (#14)

## [0.4.1] - 2026-07-24

### Changed

- **Renamed `github-issues` → `session-review`.** Skill refocused on agent self-review of skill usage and filing improvements in `MarkBovee/agent-skills-kit`. General issue filing kept as secondary mode. Router cascade updated to new skill name and phrases.
- **Router cascade reordered by lifecycle stage:** Start → Execute → Validate → Improve → Coordinate → Product. README diagram and legend updated accordingly.

## [0.4.0] - 2026-07-24

### Added

- **Git workflow als standaard in `develop` skill.** Feature/bugfix/hotfix branches, meteen draft PR, squash merge, cleanup. Vervangt `dev-release-flow` (verwijderd).

### Changed

- **Skills hernoemd (breaking):** `kaizen`→`develop`, `kickoff`→`intake`, `writing-agent-skills-kit`→`write-skill`. Router constants, plugin, cross-refs, exports, README, AGENTS.md, install scripts allemaal mee.
- **Router cascade:** `DEV_FLOW_PHRASES` verwijderd, `WRITING_PHRASES`→`WRITE_SKILL_PHRASES`.
- **Export script:** hardcoded skill references geüpdatet (CLAUDE.md, copilot-instructions.md).

### Fixed

- **`home-assistant` frontmatter:** YAML folded scalar (`>`) brak `parseFrontmatter`. Omgerekend naar single-line description.
- **`home-assistant` te lang:** 353→83 regels SKILL.md + aparte REFERENCE.md (128 regels). Skill verplaatst naar persoonlijke `~/.config/opencode/skills/`.

### Removed

- **`dev-release-flow` skill verwijderd.** Git workflow zit nu in `develop` als standaard.
- **Install scripts:** stale skill lijst uitgebreid met `kaizen`, `ask-kaizen`, `kickoff`, `ask-kickoff`, `refactor`, `ask-refactor`.

## [0.3.8] - 2026-07-23

### Changed

- **copilot-instructions.md:** "always invoke code-review after every edit" → only for meaningful/subtle/risky changes. Trivial edits skip review.
- **code-review triggers verscherpt:** `diff`, `after code changes`, `after coding`, `before claiming done` verwijderd. Laadt alleen nog bij expliciete review-intent.

## [0.3.6] - 2026-07-21

### Changed

- **skills/ask-agent-workflows/SKILL.md** aangescherpt: default-delegate reflex, partial/blocked/timeout contract, stuck recovery. Overlap verwijderd, 124→106 lines strakker. (`## Good fit`, `## Context retention`, `### Output contract`, `### Concrete flows`)

## [0.3.5] - 2026-07-21

### Changed

- **skills/ask-agent-workflows/SKILL.md** uitgebreid met context-retentie denkkader, output contract, concrete flow voorbeelden, en keep/delegeer tabel. Beter subagent gebruik bespaart hoofdcontext. (`## Not a good fit`, `## Context retention`, `### Output contract`, `### Concrete flows`)
- **Cavecrew skill verwijderd** uit opencode — vervangen door context-retentie patronen in agent-workflows skill.

## [0.3.4] - 2026-07-21

### Removed

- **ask-skill-finder** verwijderd. `core/community-skills.js`, `core/community-skills-index.json` (257KB), `scripts/fetch-community-skills-index.js` en alle runtime bundling verwijdert. AI agent context niet langer belast met ~290KB aan community index data.

### Changed

- **AGENTS.md compressed to caveman format.** ~60% shorter (8KB→3.3KB). Fewer tokens per session.
- **AGENTS.md coding-standards inline replaced with a reference to `rules/coding-standards.md`.** No more duplicated content.
- **Router hints compressed.** `buildRoutingLines()` output ~70% shorter (~1KB→~300B per prompt injection).
- **router-core.js + plugin compressed.** router-core 16KB→13.5KB, plugin 6KB→4.9KB. Total ~8KB saved in mandatory context per session.
- **update.sh/update.ps1 cleaned up.** No more community-skills index refresh during update.
- **README cleaned up.** Platform matrix, maintenance, repo map without skill-finder references.

## [0.3.3] - 2026-07-21

### Fixed

- **coding-standards.md made language-agnostic.** Removed C#-specific rules, added intent-comments hard rule, per-language sections (JS/TS, Python, Go, Rust, Shell), expanded delivery patterns and quality checklist.
- **AGENTS.md description rule relaxed.** No longer enforces "Use when..." prefix — requires accurate, informative description.
- **DRY fixes: duplicate helpers consolidated into router-core.** `unique()`, `toSingleLine()`, `stripFrontmatter()` defined once, imported everywhere.
- **cascadeRoute comment numbering fixed.** Duplicate step 3 removed, cascade order 1-11 matches body.

## [0.3.2] - 2026-07-21

### Fixed

- **plugin.json version drift synced with VERSION.** plugin.json was stuck at 0.1.19 while VERSION read 0.3.1. Bumped to match canonical VERSION source.
- **validate-plugin.js now accepts `ask-{name}` directory pattern.** Skills use `ask-` prefix for directory names (`ask-debugging/`) but frontmatter `name` strips it (`debugging`). Validator now accepts both exact match and `ask-{name}` convention, fixing 10 false-positive errors.

## [0.3.1] - 2026-07-21

### Fixed

- **agent-skills-router plugin rewritten for OpenCode's actual plugin API.** The old plugin used `chat.message`, `experimental.chat.system.transform`, and `tool.definition` hooks that do not exist in OpenCode. Replaced with `tui.prompt.append` (routing hints injected per-prompt), `session.created`, and the existing `tool.execute.before`/`after` that already worked. Plugin format changed from CommonJS to ESM for OpenCode compatibility.

## [0.3.0] - 2026-07-21

### Changed

- **Skill display names stripped of `ask-` prefix.** Frontmatter `name`, router constants, cascade text, docs, cross-refs, and generated exports all use short names (`debugging`, `kaizen`, `code-review`, etc.). Directory names and file paths keep the `ask-` prefix for namespace isolation.

## [0.2.2] - 2026-07-21

### Fixed

- **agent-skills-router plugin now actually activates.** Installer patched `opencode.json` `plugin` array to include `./plugins/agent-skills-router.js`. Previously the file was copied but never registered — plugin never ran, so no routing hints were injected and no skills were auto-suggested.
- **First-turn routing blind spot fixed.** `system.transform` hook now runs `cascadeRoute` directly on the user's message when session state has no prior matches, so routing hints are available from turn 1 instead of turn 2+.
- **Hardened skill-loading enforcement.** System prompt now includes a CRITICAL instruction: the model MUST call `skill` at task start before any code or tools. Same mandate injected into the `skill` tool's definition description.

## [0.2.1] - 2026-07-21

### Added

- **Global coding standards injected via OpenCode instructions.** `rules/coding-standards.md` ships coding principles, C# rules, EF Core practices, and quality checklist. Installer copies it to `$OPENCODE_DIR/rules/` and patches `opencode.json` `instructions` array so it loads every session automatically. Supports idempotent reinstall — already-present entry is never duplicated.

## [0.2.0] - 2026-07-20

### Changed

- **Skills reduced from 17 to 10.** Merged overlapping skills to eliminate redundancy and make routing predictable:
  - `ask-brainstorming` + `ask-planning` + `ask-kickoff` → `ask-kickoff` (pre-execution: design, scoping, planning)
  - `ask-implementation` → `ask-kaizen` (mode selection + cheap-first escalation absorbed into default baseline)
  - `ask-workspace-wrapup` → `ask-verification` (wrap-up pattern merged into verification)
  - `ask-refactoring` → `ask-improve` (refactoring as a category in the audit skill)
  - `ask-skill-improvement` → `ask-writing-agent-skills-kit` (one meta-skill for writing + improvement)
  - `ask-using-agent-skills-kit` removed (router always active; fallback skill served no purpose)
- **Router rewired from score-based to deterministic cascade.** Signal phrases checked in priority order; first match wins. No more ad-hoc scoring + 5 correction layers.
- **`execution_tier` added to all 10 skills.** Every skill declares its cost tier (`light`/`standard`/`heavy`):
  - `light`: `ask-agent-workflows`, `ask-github-issues` → Flash model, mini subagent
  - `standard`: `ask-kaizen`, `ask-kickoff`, `ask-code-review`, `ask-debugging`, `ask-verification`, `ask-writing-agent-skills-kit` → Flash model, default agent
  - `heavy`: `ask-improve`, `ask-ui-ux` → Pro model, high agent
- System prompt injection now shows the cascade order for transparency.
- Export script references updated: `ask-skill-improvement` → `ask-writing-agent-skills-kit`.

### Removed

- 7 skills: `ask-brainstorming`, `ask-planning`, `ask-implementation`, `ask-workspace-wrapup`, `ask-refactoring`, `ask-skill-improvement`, `ask-using-agent-skills-kit`.
- Scoring functions (`scoreSkill`, `findMatches`) and 5 ad-hoc routing correction functions from `router-core.js`.

### Added

- `cascadeRoute()` in `router-core.js` — deterministic cascade router with phrase-based signal detection.
- Per-cascade-step signal phrase sets: `BUG_PHRASES`, `IMPROVE_PHRASES`, `UI_PHRASES`, `ISSUE_PHRASES`, `AGENT_PHRASES`, `WRITING_PHRASES`, `COMPLETION_PHRASES`, `AMBIGUITY_PHRASES`.

## [0.1.19] - 2026-07-14

### Added

- README now documents the cost-aware execution-profile mechanism (`execution_tier`/`delegation_default` frontmatter, tier table, and how hosts should read the injected "Suggested execution profile" hint).
- `ask-improve` and `ask-github-issues` now declare `execution_tier`/`delegation_default` (`heavy`/`prefer-subagent` and `light`/`prefer-subagent` respectively) so cheap-first routing reflects their actual default scope.
- `ask-agent-workflows`, `ask-planning`, `ask-refactoring`, and `ask-verification` gained `## Use with` cross-references for better skill-to-skill collaboration.
- The Copilot `SessionStart` hook now surfaces the same cost-aware default hint as the OpenCode router plugin.
- `scripts/validate-plugin.js` now validates `execution_tier`/`delegation_default` frontmatter values against the enums exported from `core/router-core.js`.

### Changed

- `ask-agent-workflows` cheap-first guidance now also calls out picking the smallest/cheapest model class when a delegation surface exposes a model parameter.

## [0.1.18] - 2026-07-13

### Added

- VS Code and GitHub Copilot agent-plugin manifest with native Agent Skills and lifecycle hooks.
- Lightweight hook routing that reuses the canonical skill router without executing tools or commands.

## [0.1.17] - 2026-07-01

### Changed


## [0.1.16] - 2026-06-30

### Fixed

- repaired the managed skill reinstall path so exported skill frontmatter stays parseable in editor-native skill roots

## [0.1.15] - 2026-06-30

### Added

- `ask-improve` skill for structured codebase audits and audit-driven implementation plans

### Changed

- Router trigger hygiene: removed duplicate triggers (`version bump`, `bump version`, `release notes`, `changelog`) from `ask-implementation` (owned by `ask-agent-workflows`); removed `code review` from `ask-improve` (owned by `ask-code-review`)

### Fixed

- `check-trigger-overlap.js` now passes cleanly with no duplicate triggers

## [0.1.14] - 2026-06-09

### Changed

- remove the per-host bootstrap and update alias scripts in favor of one generic `scripts/bootstrap.*` and one generic `scripts/update.*` entrypoint per shell
- simplify the README and agent docs to document one bootstrap flow, one install flow, and one update flow instead of six host-named wrappers

## [0.1.13] - 2026-06-09

### Changed

- replace the three per-platform install entrypoints with one unified installer per shell (`scripts/install.sh` and `scripts/install.ps1`)
- centralize managed skills under `~/.agents/skills/` as the single source of truth for VS Code / Copilot and OpenCode skill discovery
- bootstrap and update entrypoints now delegate to the unified installer instead of separate per-platform install scripts
- non-default install roots now flow through `AGENTS_DIR`, `COPILOT_DIR`, `OPENCODE_DIR`, and `CLAUDE_DIR` environment variables instead of the old per-script positional installer arguments

### Fixed

- unified installer now removes older managed skill copies from `~/.copilot/skills/`, `~/.config/opencode/skills/`, and `~/.claude/skills/` so stale duplicated installs do not survive the new shared-root layout
- when `~/.claude/` already exists, the installer now recreates `~/.claude/skills` as a link back to `~/.agents/skills/` while still maintaining Claude rules under `~/.claude/rules/`

## [0.1.12] - 2026-06-09

### Changed

- centralize managed-skill cleanup and manifest helpers in the shared release helper scripts so Copilot, Claude Code, and OpenCode installers no longer duplicate the same stale-skill logic in each installer entrypoint

### Fixed

- Copilot and Claude Code installers now clean up older legacy installs from `~/.agents/skills/` during upgrades instead of leaving that legacy global path behind on machines that moved to editor-native install roots
- document the verified editor-specific install roots and clarify that `~/.agents/` is a legacy cleanup location, not the single canonical global install target across all supported editors

## [0.1.11] - 2026-06-09

### Fixed

- close the lingering issue loop around `ask-skill-finder` host-capability gating by shipping the execute-versus-proposal rubric already present on `main` and validating that unsupported hosts fall back cleanly to proposal mode
- close the lingering PowerShell bootstrap helper-path issue by validating the managed-checkout bootstrap flow end-to-end and shipping the clearer incomplete-checkout handling already present in the bootstrap scripts

## [0.1.10] - 2026-06-09

### Changed

- router scoring now emits a cost-aware execution profile so bounded chores such as version bumps, changelog edits, and release notes default to a cheap `mini`/small-agent path with subagent preference when the host supports it
- `ask-agent-workflows`, `ask-implementation`, and `ask-kaizen` now encode an explicit cheap-first escalation path so simple mechanical work stays off high-cost agents until scope or validation demands escalation

## [0.1.9] - 2026-06-05

### Changed

- `ask-code-review`: mandatory after every code edit; review depth scales with risk but no edit skips review — tiny changes get a quick checklist pass instead of self-review bypass
- `export-platform-skills.js`: generated Copilot and Claude instructions now enforce always-invoke review rule instead of the softer handoff-only trigger

## [0.1.8] - 2026-06-03

### Fixed

- bootstrap scripts now recover older managed checkouts that are dirty only because generated `.github`, `.claude`, or `CLAUDE.md` artifacts drifted locally before retrying `git pull`
- update scripts now use the same generated-artifact recovery path before pulling a managed checkout forward

## [0.1.7] - 2026-06-03

### Changed

- `ask-skill-finder` now defines an explicit execute-mode capability rubric for OpenCode, GitHub Copilot, Claude Code, and unknown hosts, and now falls back to proposal mode immediately when any required local runtime capability is missing or uncertain

### Fixed

- PowerShell bootstrap scripts now stop on failed `git clone` and `git pull` calls instead of surfacing a misleading missing-helper error after native git failures
- bootstrap scripts now report incomplete managed checkouts with a direct delete-and-rerun recovery hint across PowerShell and shell entrypoints

## [0.1.6] - 2026-06-03

### Changed

- `ask-skill-finder` now ships a self-contained runtime bundle under `skills/ask-skill-finder/runtime/`, including the helper module, cached community index, and standalone refresh script
- `scripts/export-platform-skills.js` now resyncs the bundled skill-finder runtime from the canonical helper and fetch-script sources before regenerating Copilot and Claude exports
- documented the bundled skill-finder runtime and platform packaging behavior in `README.md`

### Fixed

- fixed `ask-skill-finder` references so OpenCode, Copilot, and Claude exports no longer depend on missing repo-root helper or script paths at runtime
- fixed concurrent Copilot and Claude installer runs so shared export generation now serializes instead of racing on `.github/skills/` and `.claude/skills/`

## [0.1.4] - 2026-06-03

### Changed

- router scoring now loads `ask-kickoff` more aggressively for ambiguous or close-call starts and pulls `ask-kaizen` in earlier for concrete executable requests
- `ask-kaizen` and `ask-kickoff` frontmatter triggers now cover more real user phrasing so both skills surface earlier from the router

## [0.1.3] - 2026-06-03

### Added

- added `scripts/tag-release.sh` and `scripts/tag-release.ps1` so release tags now derive automatically from `VERSION`, with optional push support for the current branch and tag

### Changed

- `scripts/check-release-readiness.js` now treats `scripts/tag-release.*` as release-sensitive shipped surfaces
- documented the version-based release tagging flow and dry-run checks in `README.md`

## [0.1.2] - 2026-06-03

### Changed

- `ask-ui-ux` now defaults Playwright screenshot capture examples to `--wait-for-timeout 6000` and explicitly prefers a small `networkidle` script for lazy-loaded or highly animated pages
- `ask-ui-ux` now tells screenshot-based vision review loops to locate each issue and apply the fix immediately unless the overall visual direction itself is in doubt

## [0.1.1] - 2026-06-03

### Changed

- documented release discipline for agents so shipped fixes now require a patch bump unless explicitly kept unreleased
- release guidance and readiness checks now call out that bootstrap and update users only receive shipped fixes after the matching stable tag exists

### Fixed

- `scripts/check-release-readiness.js` now fails when shipped install surfaces changed since the latest stable tag but `VERSION` was not bumped above that tag

## [0.1.0] - 2026-06-03

### Added

- added root `VERSION` file as the canonical release version source
- added per-platform `.agent-skills-kit-install.txt` manifests so users can inspect installed version, ref, and commit locally
- added `scripts/check-release-readiness.js` to validate `VERSION` and changelog structure before a release tag is cut
- added this root `CHANGELOG.md` and linked it from `README.md`

### Changed

- bootstrap and update scripts now resolve the latest stable SemVer tag before reinstalling managed assets
- stable update scripts now report the current and target managed version instead of always pulling the active branch blindly
- documented the stable release flow, release metadata, and bootstrap fallback behavior in `README.md`
- removed the `ask-test-driven-development` skill and folded proof-oriented guidance back into `ask-kaizen`, `ask-debugging`, and `ask-verification`

### Fixed

- aligned `ask-using-agent-skills-kit` with the full 17-skill roster so fallback routing now explicitly covers `ask-github-issues` and `ask-skill-finder`
- installers and updates now remove stale managed skills during reinstall, including retired skills such as `ask-test-driven-development`
