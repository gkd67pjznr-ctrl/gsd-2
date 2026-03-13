---
id: M003
provides:
  - /gsd chat command with recall injection, conversation persistence, summarization, and quick mode suggestion
  - /gsd quick command with single-session lightweight execution, correction capture, and summary output
  - Always-on recall injection via before_agent_start for all GSD sessions
  - Unified status bar with "gsd-mode" key across idle/chat/quick/auto
  - Chat-to-quick handoff via task list file discovery
  - loadTaskList() markdown checkbox parser for cross-mode handoff
key_decisions:
  - D051 — Unified "gsd-mode" status bar key replaces "gsd-auto"
  - D052 — Always-on recall via before_agent_start hook
  - D053 — Quick mode artifacts in .gsd/quick/ not .gsd/milestones/
  - D054 — Chat persistence in .gsd/conversations/ with timestamped dirs
  - D055 — Chat-to-quick handoff via task list file discovery
  - D058 — Quick mode is single-session dispatch, not state machine
  - D059 — Quick mode relies on before_agent_start for recall, not template var
  - D060 — Chat end uses pendingChatEnd flag for multi-turn safety
  - D061 — Bare /gsd quick discovers chat task lists via findRecentTaskList()
patterns_established:
  - status.ts as single source of truth for GSD mode across all modules
  - Lifecycle pattern (pending flag + agent_end cleanup + try/finally status reset) reused across quick and chat modes
  - Instruction-based persistence (prompt tells agent to write summary.md/tasks.md) for chat and quick output
  - File-based cross-mode handoff without IPC or shared state
observability_surfaces:
  - getGSDMode() returns current mode for inspection
  - "gsd-mode" status bar key shows active mode in TUI
  - .gsd/conversations/<timestamp>/ directory presence confirms chat ran
  - .gsd/quick/<timestamp>/ directory presence confirms quick ran
  - findRecentTaskList() returns null when no task list exists (graceful fallback)
requirement_outcomes:
  - id: R020
    from_status: active
    to_status: validated
    proof: 17 test assertions in chat-mode.test.ts prove chat lifecycle creates output dirs, dispatches prompts, resets status
  - id: R021
    from_status: active
    to_status: validated
    proof: 33 test assertions across quick-mode.test.ts and load-task-list.test.ts prove arg parsing, dispatch, correction capture, status transitions, task list parsing
  - id: R022
    from_status: active
    to_status: validated
    proof: 60 test assertions across gsd-status.test.ts (16), quick-mode.test.ts (27), chat-mode.test.ts (17) prove all mode transitions
  - id: R023
    from_status: active
    to_status: validated
    proof: 11 test assertions in always-on-recall.test.ts prove injection for non-auto sessions, auto-mode skip, empty recall handling
  - id: R024
    from_status: active
    to_status: validated
    proof: 14 test assertions in chat-handoff.test.ts prove findRecentTaskList discovery, task list loading, undone filtering, quick mode dispatch
duration: 1 day (3 slices, 6 tasks)
verification_result: passed
completed_at: 2026-03-12
---

# M003: Conversational Modes & Lightweight Execution

**Three new interaction modes (chat, quick, always-on recall) with unified status bar and chat-to-quick task list handoff, extending adaptive intelligence from auto-mode-only to every GSD session.**

## What Happened

S01 laid the foundation: a unified status bar helper (`status.ts`) replacing the old `"gsd-auto"` key with `"gsd-mode"`, and always-on recall injection in `before_agent_start` so every Pi session in a GSD project gets past corrections/preferences — not just auto-mode. Auto-mode's 5 `setStatus` calls were migrated to the shared helper. Chat and quick subcommand stubs were registered.

S02 built quick mode: `/gsd quick --<description>` parses the description, creates a timestamped output directory in `.gsd/quick/`, loads the `quick-task.md` prompt template with quality instructions, dispatches a single agent session, and captures corrections on completion using the same pipeline as auto-mode (`transformSessionEntries` + `detectCorrections` + `writeCorrection` + `checkAndPromote`). `loadTaskList()` was built as a reusable markdown checkbox parser for S03's handoff.

S03 completed the picture: `/gsd chat` starts brainstorming sessions with full recall (via `before_agent_start`), persists conversations to `.gsd/conversations/<timestamp>/` with summary and task list files, and suggests `/gsd quick` when actionable work is detected. The handoff loop was closed — bare `/gsd quick` (no `--` description) discovers the most recent `tasks.md` from chat conversations, loads undone items, and dispatches them as a quick mode task.

## Cross-Slice Verification

- **Chat with recall, persistence, summarization, quick suggestion**: S03 chat-mode.test.ts (17 assertions) proves lifecycle; prompt template instructs agent to suggest `/gsd quick` when work detected
- **Quick mode execution through phases**: S02 quick-mode.test.ts (27 assertions) proves arg parsing, directory creation, prompt dispatch, status transitions, correction capture, error recovery
- **Status bar across all transitions**: S01 gsd-status.test.ts (16), S02 quick-mode.test.ts (27), S03 chat-mode.test.ts (17) — collectively prove idle↔auto, idle↔quick, idle↔chat transitions including error recovery
- **Always-on recall**: S01 always-on-recall.test.ts (11 assertions) proves injection for non-auto sessions, skip for auto (avoids duplication), empty recall handling
- **Chat→quick handoff**: S03 chat-handoff.test.ts (14 assertions) proves findRecentTaskList discovery, task list loading, undone item filtering, formatting into quick mode description, fallback when no task list exists
- **Full test suite**: 76/77 pass (1 pre-existing embed-trigger.test.ts failure unrelated to M003)

## Requirement Changes

- R020 (Chat Persistence): active → validated — 17 test assertions prove chat lifecycle with output directory creation and prompt dispatch
- R021 (Quick Mode): active → validated — 33 test assertions prove complete quick mode contract
- R022 (Status Bar): active → validated — 60 test assertions across 3 slices prove all mode transitions
- R023 (Always-On Recall): active → validated — 11 test assertions prove recall injection in before_agent_start
- R024 (Chat-to-Quick Handoff): active → validated — 14 test assertions prove file-based handoff loop

## Forward Intelligence

### What the next milestone should know
- All three GSD modes (chat, quick, auto) share the same recall pipeline via `before_agent_start` + `buildRecallBlock()`. Any recall improvements benefit all modes automatically.
- The lifecycle pattern (pending flag + agent_end cleanup + try/finally status reset) is proven and should be reused for any future mode additions.
- Quick and chat persistence are instruction-based — the agent is told to write artifacts, but compliance is not programmatically enforced.

### What's fragile
- Chat persistence format depends on prompt template compliance — if the agent doesn't write `tasks.md` in checkbox format, the handoff to quick mode silently produces no tasks
- `transformSessionEntries` was made public from auto.ts for quick mode reuse — changes to auto.ts session format would break quick mode too

### Authoritative diagnostics
- `getGSDMode()` is the single source of truth for current mode across all GSD modules
- `findRecentTaskList()` returns null when no task list exists — check this first when debugging handoff failures

### What assumptions changed
- Assumed vitest was the test runner — project uses `node:test` with `npx tsx --test` (discovered in S01, carried through S02/S03)

## Files Created/Modified

- `src/resources/extensions/gsd/status.ts` — unified status bar helper
- `src/resources/extensions/gsd/quick.ts` — quick mode dispatch and lifecycle
- `src/resources/extensions/gsd/task-list.ts` — markdown checkbox parser
- `src/resources/extensions/gsd/chat.ts` — chat mode lifecycle
- `src/resources/extensions/gsd/prompts/quick-task.md` — quick mode prompt template
- `src/resources/extensions/gsd/prompts/chat-session.md` — chat mode prompt template
- `src/resources/extensions/gsd/auto.ts` — migrated status bar calls, exported transformSessionEntries
- `src/resources/extensions/gsd/index.ts` — always-on recall injection, quick/chat agent_end handling
- `src/resources/extensions/gsd/commands.ts` — chat/quick command routing
- `src/resources/extensions/gsd/tests/gsd-status.test.ts` — 16 assertions
- `src/resources/extensions/gsd/tests/always-on-recall.test.ts` — 11 assertions
- `src/resources/extensions/gsd/tests/quick-mode.test.ts` — 27 assertions
- `src/resources/extensions/gsd/tests/load-task-list.test.ts` — 6 assertions
- `src/resources/extensions/gsd/tests/chat-mode.test.ts` — 17 assertions
- `src/resources/extensions/gsd/tests/chat-handoff.test.ts` — 14 assertions
