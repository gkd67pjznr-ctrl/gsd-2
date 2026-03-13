# M003: Conversational Modes & Lightweight Execution — Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

## Project Description

Add two new GSD modes — `/gsd chat` for stateful brainstorming/analysis conversations with full recall injection, and `/gsd quick` for lightweight task execution without milestone scaffolding — plus a persistent status bar showing current GSD state in every Pi session.

## Why This Milestone

GSD's adaptive intelligence (corrections, preferences, recall) only activates during auto-mode dispatch. In regular conversations — where most corrections actually happen — the agent is stateless with no recall of past mistakes. The milestone/slice/task hierarchy is also too heavy for small tasks, forcing users to either skip GSD entirely or endure unnecessary ceremony.

The user identified this gap directly: "the problem is that those functions generally only happen when IN CONVERSATION with me."

## User-Visible Outcome

### When this milestone is complete, the user can:

- Type `/gsd chat` and have a brainstorming conversation where the agent has full recall of past corrections and preferences, with the conversation recorded and summarized
- Type `/gsd quick --fix the login button` and get lightweight GSD execution (research → plan → execute → verify) without creating a milestone
- See at a glance whether GSD is in chat mode, quick mode, auto mode, or idle via a persistent status indicator at the bottom of every Pi session
- Have `/gsd chat` detect when real work is needed and suggest running `/gsd quick` with a prepared task list
- Have `/gsd quick` automatically load any task list created during a `/gsd chat` session

### Entry point / environment

- Entry point: `/gsd chat`, `/gsd quick`, `/gsd quick --<description>` commands in Pi
- Environment: local dev, Pi TUI
- Live dependencies involved: none (all in-process)

## Completion Class

- Contract complete means: commands register, recall injection works in both modes, conversations persist, quick tasks execute through phases, status bar reflects state
- Integration complete means: chat → quick handoff works (task list created in chat, consumed by quick), recall pipeline from M001/M002 flows into both modes
- Operational complete means: none (no services)

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- `/gsd chat` starts a session with corrections and preferences injected, records the conversation, and suggests `/gsd quick` when work is detected
- `/gsd quick --<description>` executes a task through research/plan/execute/verify phases with recall injection, produces a summary, and captures any corrections
- Status bar shows the current GSD mode and updates on mode transitions
- A chat session that produces a task list can hand off to `/gsd quick` which loads that task list

## Risks and Unknowns

- **Conversation summarization quality** — auto-summarizing chat sessions reliably without losing important context; may need structured extraction rather than free-form summary
- **Task detection in chat** — how to reliably detect when a conversation has shifted from brainstorming to "this needs real work" without false positives
- **Quick mode phase compression** — which phases (research, plan, execute, verify) are mandatory vs. skippable for small tasks; over-ceremony defeats the purpose
- **Status bar interaction with existing TUI** — `ctx.ui.setStatus()` is simple but needs to stay updated across mode transitions, session starts/ends, and auto-mode
- **Chat-to-quick handoff format** — what the task list artifact looks like and how `/gsd quick` discovers and loads it

## Existing Codebase / Prior Art

- `src/resources/extensions/gsd/index.ts` — Extension entry point; `pi.on("agent_start")` hook for system prompt injection, `pi.registerCommand()` for commands, `ctx.ui.setStatus()` for status bar
- `src/resources/extensions/gsd/auto.ts` — Auto-mode dispatch loop; `buildCorrectionsVar()` and `buildQualityVar()` are the recall/quality injection points to reuse
- `src/resources/extensions/gsd/recall.ts` — `buildRecallBlock()` for assembling corrections/preferences into prompt content
- `src/resources/extensions/gsd/commands.ts` — Existing `/gsd` command registration and wizard flow
- `src/resources/extensions/gsd/state.ts` — State derivation from disk files; needs extension for chat/quick states
- `src/resources/extensions/gsd/guided-flow.ts` — Guided flow for milestone/slice/task creation; reference for how quick mode might work at a smaller scale
- `src/resources/extensions/gsd/prompt-loader.ts` — Template loading and variable substitution
- `src/resources/extensions/gsd/dashboard-overlay.ts` — TUI overlay; reference for how to use Pi TUI APIs

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R007 (Live Recall Injection) — extended to cover chat and quick modes, not just auto-mode dispatch
- New requirements will be created for chat mode, quick mode, and status bar

## Scope

### In Scope

- `/gsd chat` command: start stateful conversation with full recall injection, conversation persistence (`.gsd/conversations/`), auto-summarization on end, task detection and `/gsd quick` suggestion, task list creation
- `/gsd quick` command: lightweight execution with optional `--<description>` argument, compressed phases (research → plan → execute → verify), recall injection, correction capture, summary output, git branch optional
- `/gsd quick` task list loading: discover and load task lists from chat sessions
- Status bar: persistent GSD state indicator via `ctx.ui.setStatus()` showing current mode (idle/chat/quick/auto), updated on transitions
- Always-on recall: `agent_start` hook injects recall into every GSD session regardless of mode

### Out of Scope / Non-Goals

- Multi-session chat (each `/gsd chat` is a single session; history is read-only after)
- Chat spawning auto-mode directly (chat suggests quick, user decides)
- Voice or rich media in chat
- Quick mode managing git branches (optional, not required)
- Modifying the existing auto-mode flow

## Technical Constraints

- Pi SDK's `ctx.ui.setStatus(key, text)` is the only footer API — no custom layout, just key-value text
- `pi.registerCommand()` handler receives `args` as a raw string — parsing `--<description>` is manual
- `agent_start` system prompt injection is the universal hook — all recall must flow through here
- Conversation persistence must not interfere with milestone/slice/task file structure
- Quick mode must reuse existing recall, quality, and correction infrastructure — no parallel systems

## Integration Points

- `recall.ts` — Both modes need `buildRecallBlock()` for prompt injection
- `auto.ts` — Quick mode reuses `buildCorrectionsVar()`, `buildQualityVar()`, `embedCorrection()`
- `corrections.ts` — Both modes write corrections via `writeCorrection()`
- `state.ts` — Needs new state types for chat and quick modes
- `commands.ts` — New command registration for `/gsd chat` and `/gsd quick`
- `index.ts` — `agent_start` hook needs always-on recall injection; `ctx.ui.setStatus()` for status bar
- `prompt-loader.ts` — New templates for chat and quick mode prompts

## Open Questions

- Should `/gsd chat` use a fresh Pi session (via `pi.startSession()`) or inject into the current session? Fresh session is cleaner but loses conversation flow. Current session preserves flow but mixes chat with whatever the user was doing.
- Should `/gsd quick` create a git branch? For very small tasks it's overhead, but it enables clean rollback.
- What triggers "end of chat" for summarization — explicit `/gsd chat end` command, or session end?
- Should the status bar show more than mode (e.g., current task name, time elapsed, cost)?
- How does `/gsd quick` handle failure — retry like auto-mode, or bail and let the user decide?
