# M003: Conversational Modes & Lightweight Execution

**Vision:** Users can brainstorm with full recall (`/gsd chat`), execute lightweight tasks without ceremony (`/gsd quick`), and always see current GSD state via a persistent status bar — closing the gap where adaptive intelligence only activated during auto-mode.

## Success Criteria

- `/gsd chat` starts a session with corrections and preferences injected, records the conversation to `.gsd/conversations/`, summarizes on end, and suggests `/gsd quick` when actionable work is detected
- `/gsd quick --fix the login button` executes through research → plan → execute → verify phases with recall injection and correction capture, producing a summary in `.gsd/quick/`
- A persistent status bar shows the current GSD mode (idle/chat/quick/auto) and updates on all mode transitions
- Every Pi session in a GSD project gets recall injected via `before_agent_start`, not just auto-mode
- A chat session that produces a task list can hand off to `/gsd quick` which loads and executes that task list

## Key Risks / Unknowns

- **Always-on recall in `before_agent_start` performance** — async `buildRecallBlock()` runs on every agent turn; must not degrade normal Pi usage
- **Chat-to-quick handoff** — task list format and discovery mechanism between modes is novel; no existing pattern to follow
- **Quick mode phase compression** — determining which phases are mandatory vs. skippable without defeating the purpose of "quick"

## Proof Strategy

- Always-on recall performance → retire in S01 by building and exercising the real `before_agent_start` injection with kill switch and early returns
- Chat-to-quick handoff → retire in S03 by proving a chat session creates a task list that `/gsd quick` discovers and loads
- Quick mode phase compression → retire in S02 by building quick mode with all phases and verifying the flow is still lightweight

## Verification Classes

- Contract verification: unit tests for recall injection, quick mode dispatch, chat persistence, status bar state transitions, command routing
- Integration verification: live `/gsd chat` and `/gsd quick` commands exercised in Pi TUI, mode transitions update status bar, chat→quick handoff works
- Operational verification: none (all in-process)
- UAT / human verification: commands feel lightweight and recall is visibly present in agent responses

## Milestone Definition of Done

This milestone is complete only when all are true:

- All three slices are complete with tests passing
- `/gsd chat` starts with recall, persists conversation, summarizes on end, suggests quick when work detected
- `/gsd quick --<description>` executes a task through phases with recall and correction capture
- Status bar reflects current mode across all transitions (idle ↔ chat ↔ quick ↔ auto)
- Always-on recall is injected in every GSD session via `before_agent_start`
- Chat → quick handoff proven: task list created in chat, consumed by quick
- All existing tests (M001 + M002) continue to pass

## Requirement Coverage

- Covers: R022 (Status Bar), R023 (Always-On Recall), R021 (Quick Mode), R020 (Chat Persistence), R024 (Chat-to-Quick Handoff)
- Extends: R007 (Live Recall Injection — extended from auto-mode to all modes)
- Leaves for later: none
- Orphan risks: none — all M003 context requirements mapped

## Slices

- [x] **S01: Always-On Recall & Status Bar** `risk:high` `depends:[]`
  > After this: every Pi session in a GSD project gets recall injected via `before_agent_start` (not just auto-mode), and a status bar shows the current GSD mode (idle/auto) — proven by unit tests and live Pi session exercise
- [x] **S02: Quick Mode** `risk:medium` `depends:[S01]`
  > After this: user types `/gsd quick --fix the login button` and gets lightweight task execution through research→plan→execute→verify with recall injection, correction capture, and summary output in `.gsd/quick/` — status bar shows "quick" during execution
- [ ] **S03: Chat Mode with Quick Handoff** `risk:medium` `depends:[S01,S02]`
  > After this: user types `/gsd chat` to start a brainstorming session with full recall, conversation is persisted to `.gsd/conversations/`, agent suggests `/gsd quick` when work is detected, task list created in chat is discoverable by `/gsd quick` — status bar shows "chat" during session

## Boundary Map

### S01 → S02

Produces:
- Always-on recall injection in `before_agent_start` hook — `buildRecallBlock()` called for every GSD session, result injected into system prompt
- Unified status bar key `"gsd-mode"` with `setGSDStatus(mode: 'idle' | 'chat' | 'quick' | 'auto')` helper function
- Auto-mode migrated from `"gsd-auto"` key to shared `"gsd-mode"` key
- `chat` and `quick` subcommands registered in `commands.ts` (routing stubs)

Consumes:
- nothing (first slice)

### S02 → S03

Produces:
- Quick mode dispatch function that accepts a task description, executes through phases, writes summary to `.gsd/quick/`
- Quick mode can accept an optional task list file path to load tasks from
- `loadTaskList(path)` function for reading markdown task lists

Consumes:
- S01: always-on recall, status bar helper, command registration stubs

### S01 → S03

Produces:
- Always-on recall injection (chat mode uses same mechanism)
- Status bar helper (chat mode calls `setGSDStatus('chat')`)
- Command registration stub for `/gsd chat`

Consumes:
- nothing (first slice)
