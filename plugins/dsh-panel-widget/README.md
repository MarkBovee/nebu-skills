# ask-kit-panel (dsh dual-face widget)

The slim Agent Skills Kit status line under the DSH web composer: badge
`╌ Agent Skills Kit ╌`, loaded-skill chips, and review nudges (⚠ code-review /
design-review, ✓ improvement). No decision tree in the UI — the tree stays in the
system prompt; this surface only mirrors live session state.

This is the persistent successor of the `askkit-1` runtime demo
(`../dsh-panel-prototype/`): a real dual-face package instead of a
`cordis_define` session artifact.

## Faces

- **Browser face** (`client.js`) — lazy-CJS factory bundle registered in slot
  `conversation.composer.dock` (`id: ask-kit-status`, order 50). Reads the
  `askKit` session projection reactively (`sessions.binding(id).session.
  projections.faceOf("askKit")`), no polling RPC. The bundle uses the fixed
  registration id `ask-kit-panel`, which must match the package name and node
  face's exported `name`; client-modules bundles do not expose a stable
  `currentScript` URL.
- **Node face** (`index.mjs`) — inert Cordis plugin so the package loads
  cleanly as a node-plugin row too (dual-face requirement).

## State bridge

The **ask-kit router row** (`plugins/agent-skills-router.dsh.mjs`) owns the
canonical skill/review state. On every mutation it appends a whole-value
`ask-kit/state` event to the agent's session log (`agent.session.append`) — the
whole-value rule keeps replay trivially cheap. It also registers the `askKit`
projection unit via `ctx.inject(["sessionProjections"], …)`: a pure fold
(last-write-wins over those events) with a dependency-free hand-rolled schema,
so preset-local rows stay free of bare npm specifiers.

The client reads only the finished view from the projection store; sessions
without an askKit value (no router row mounted) render nothing.

## Install

Managed by `scripts/install.sh` / `scripts/install.ps1`:

- Package copied to `~/.dsh/client-plugins/ask-kit-panel/` and symlinked into
  `~/.dsh/profiles/node_modules/ask-kit-panel` so its bare package name resolves
  for both the node loader and the client-module registry.
- Roster row appended idempotently to `~/.dsh/profiles/web/cordis.patch.yml`
  under marker comments referencing the bare package name `ask-kit-panel`;
  existing patch content is never touched.

A dsh web restart is required after installing or updating the package.
