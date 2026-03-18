# M001-1ya5a3: GSD Studio MVP

**Gathered:** 2026-03-18
**Status:** Ready for planning

## Project Description

A premium local desktop coding agent GUI for gsd-2. Replaces the terminal experience with a beautifully designed Electron app featuring a continuous document-flow conversation stream, bespoke tool cards with syntax-highlighted diffs and code previews, wizard-style interactive prompts, a Monaco code editor, file tree navigation, and a live localhost preview pane. The design language is dark monochrome with warm amber accent, Inter + JetBrains Mono typography, Phosphor icons — inspired by Linear and Vercel's design sensibility. No AI slop. No generic component-kit aesthetic. Tool cards are art.

## Why This Milestone

gsd-2 is a powerful coding agent but lives in a terminal. This milestone delivers a visual, spatial interface where you see the conversation, the code, the files, and the preview all at once. It transforms the agent from text-scrolling-by into a cockpit.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Launch the desktop app, point it at a project directory, and start a conversation with gsd-2 through a premium GUI
- Watch tool calls stream as beautiful, bespoke cards — diffs for edits, syntax-highlighted code for reads, styled terminal output for bash commands
- Interact with agent prompts (select, confirm, input) through wizard-style inline components with tab-to-add-notes, option cards, and recommended option highlighting
- Browse the project file tree and open files in a custom-themed Monaco editor
- See a live preview of web apps the agent builds via a localhost iframe
- Experience the whole thing as a cohesive, premium, Linear/Vercel-quality design

### Entry point / environment

- Entry point: Electron app launch (dev: `npm run dev`, prod: app binary)
- Environment: local macOS desktop (primary), future: cross-platform
- Live dependencies involved: gsd-2 CLI (spawned as subprocess), local filesystem, local dev servers

## Completion Class

- Contract complete means: All UI components render correctly, RPC protocol handles all event types, tool cards display accurate data for each tool type
- Integration complete means: Full round-trip — user sends prompt, gsd-2 processes it, events stream back, tool cards render, files appear in tree, editor opens them, preview shows running app
- Operational complete means: App handles gsd-2 process crashes gracefully, reconnects, and maintains conversation state

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- Send a real prompt to gsd-2 via the GUI and watch the full execution — message streaming, tool cards, file changes — render beautifully in real-time
- Interact with an ask_user_questions prompt through the GUI's wizard-style UI, including adding notes and selecting from options
- Open a file the agent just created/modified in the Monaco editor and see it syntax-highlighted with the custom theme
- See a live web app preview in the iframe after the agent builds something with a dev server

## Risks and Unknowns

- **Monaco theming depth** — Custom dark theme needs to match the app aesthetic exactly. Monaco's theming API is powerful but the token color customization can be tedious.
- **Streaming performance** — High-frequency message_update deltas need smooth rendering. Markdown parsing + Shiki highlighting in the render loop could cause jank.
- **Tool card diversity** — Many tool types with different data shapes. Each needs bespoke rendering. The design surface is large.
- **Electron IPC architecture** — Main process manages gsd-2 subprocess, renderer needs the event stream. Need clean IPC bridge via preload/contextBridge.
- **Extension UI complexity** — The ask_user_questions interaction model is rich (tab headers, multi-select, notes, review screen). Recreating this in React with premium UX is substantial work.

## Existing Codebase / Prior Art

- `packages/pi-coding-agent/src/modes/rpc/rpc-client.ts` — TypeScript RPC client SDK. Use this to spawn and communicate with gsd-2.
- `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts` — Full type definitions for all RPC commands, responses, and events.
- `packages/pi-coding-agent/src/modes/rpc/rpc-mode.ts` — Server-side RPC mode implementation. Reference for understanding event shapes.
- `src/headless.ts` — Headless orchestrator. Reference for how to manage gsd-2 subprocess lifecycle.
- `src/headless-events.ts` — Event classification (terminal, blocked, milestone-ready). Reuse patterns.
- `src/resources/extensions/ask-user-questions.ts` — Ask user questions tool. Reference for the full interaction model: single/multi-select, "None of the above", notes field, recommended option highlighting.
- `src/resources/extensions/get-secrets-from-user.ts` — Secrets collection tool. Reference for paged masked input UI.
- `src/resources/extensions/shared/interview-ui.ts` — Interview round widget. Reference for the full multi-page wizard interaction: tab navigation, notes, review screen, exit confirmation.
- `~/.claude/skills/gsd-headless-rpc/` — Comprehensive RPC protocol documentation skill.

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R001-R012 — All active requirements are owned by this milestone's slices
- R008 (design system) and R011 (no AI slop) apply to every slice
- R004 (tool cards) and R009 (interactive prompts) are the differentiators

## Scope

### In Scope

- Electron + Vite + React desktop app shell
- gsd-2 JSON-RPC integration via TypeScript SDK
- Continuous document-flow message rendering with Shiki-highlighted code blocks
- Bespoke tool cards for Read, Write, Edit, Bash, lsp, search, and browser tools
- Wizard-style interactive prompt UI (select, confirm, input, editor)
- Monaco editor with custom dark theme
- File tree sidebar with auto-refresh
- Localhost iframe preview pane
- Dark monochrome + warm amber design system
- Zustand state management

### Out of Scope / Non-Goals

- Multi-project/session management (R013 — deferred)
- Settings/preferences UI (R014 — deferred)
- Onboarding flow (R015 — deferred)
- App packaging/distribution (R016 — deferred)
- Cloud/remote execution (R017 — out of scope)
- WebContainers (R018 — out of scope)
- Mobile or tablet support
- Collaborative/multi-user features

## Technical Constraints

- Must use Electron (Chromium-based) for the desktop shell — required for reliable rendering of Monaco, Shiki, and potential future WebContainers
- gsd-2 communication MUST use the existing JSON-RPC protocol — no custom protocols
- JSONL framing: LF-only splitting, NOT readline (breaks on Unicode separators)
- Extension UI requests MUST be responded to — agent blocks until response is sent
- Must work on macOS with Apple Silicon (primary dev environment)

## Integration Points

- **gsd-2 subprocess** — Spawned via `RpcClient`, communicates via stdin/stdout JSONL
- **Local filesystem** — File tree reads, file watching for auto-refresh
- **Local dev servers** — Preview iframe loads localhost URLs from agent-spawned servers

## Open Questions

- **Conversation persistence** — Should the GUI persist conversation history to disk, or rely on gsd-2's session files? Current thinking: lean on gsd-2's session management initially.
- **Multiple gsd-2 instances** — Deferred, but the IPC architecture should not preclude it.
