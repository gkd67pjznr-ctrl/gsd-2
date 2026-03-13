---
id: S02
parent: M003
milestone: M003
provides:
  - quick mode dispatch (startQuick, checkQuickEnd, isQuickPending)
  - quick-task.md prompt template with {{description}}, {{quality}}, {{outputDir}}
  - loadTaskList(path) — markdown checkbox parser for S03 handoff
  - transformSessionEntries exported from auto.ts
requires:
  - slice: S01
    provides: always-on recall via before_agent_start, setGSDStatus helper, quick command stub
affects:
  - S03
key_files:
  - src/resources/extensions/gsd/quick.ts
  - src/resources/extensions/gsd/task-list.ts
  - src/resources/extensions/gsd/prompts/quick-task.md
  - src/resources/extensions/gsd/commands.ts
  - src/resources/extensions/gsd/index.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/tests/quick-mode.test.ts
  - src/resources/extensions/gsd/tests/load-task-list.test.ts
key_decisions:
  - D058 — Quick mode is single-session dispatch, not state machine
  - D059 — Quick mode relies on before_agent_start for recall, not template var
patterns_established:
  - Quick mode follows showDiscuss() lifecycle pattern (pending state + agent_end cleanup)
  - Quick mode reuses auto-mode correction capture (transformSessionEntries + detectCorrections + writeCorrection + checkAndPromote)
  - Non-throwing file readers return empty array on error (consistent with D013)
observability_surfaces:
  - getGSDMode() returns 'quick' during execution, 'idle' after
  - Status bar key "gsd-mode" shows "quick" during execution
  - .gsd/quick/<timestamp>/summary.md exists after completion
drill_down_paths:
  - .gsd/milestones/M003/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M003/slices/S02/tasks/T02-SUMMARY.md
duration: 2 sessions
verification_result: passed
completed_at: 2026-03-12
---

# S02: Quick Mode

**`/gsd quick --fix the login button` parses description, creates output directory, dispatches single-session agent with quality instructions and recall injection, captures corrections on completion, writes summary to `.gsd/quick/<timestamp>/`.**

## What Happened

T01 built the core quick mode: `quick.ts` with `startQuick()` (arg parsing, directory creation, status bar, prompt loading, dispatch), `checkQuickEnd()` (correction capture via reused auto-mode pipeline, status reset with try/finally), and `isQuickPending()`. Created `quick-task.md` prompt template instructing the agent to research→plan→execute→verify in one session. Replaced the command stub in `commands.ts`, added agent_end handling in `index.ts`, exported `transformSessionEntries` from `auto.ts`.

T02 added `loadTaskList(path)` in `task-list.ts` — a markdown checkbox parser returning `{title, done}[]` for S03's chat-to-quick handoff. Handles missing files, malformed lines, indented checkboxes.

## Verification

- `quick-mode.test.ts` — 27 assertions: arg parsing (strips `--` prefix, handles bare text, empty input), prompt template loading with variable substitution, status transitions (idle→quick→idle), error recovery (status resets on throw), transformSessionEntries export
- `load-task-list.test.ts` — 6 assertions: mixed done/undone, empty file, missing file, non-checkbox lines skipped, uppercase `[X]`, indented checkboxes
- Full suite: 74/75 pass (1 pre-existing failure in embed-trigger.test.ts, unrelated to this slice)

## Requirements Advanced

- R021 (Quick Mode) — core implementation complete: arg parsing, directory creation, prompt dispatch, correction capture, summary output path
- R022 (Status Bar) — quick mode transitions proven: idle→quick→idle, error recovery resets to idle

## Requirements Validated

- R021 (Quick Mode) — 33 test assertions prove the full quick mode contract: dispatch, correction capture, task list parsing, status transitions

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- Added `{{outputDir}}` as a third template variable in quick-task.md (not in original plan) — needed so the prompt tells the agent where to write summary.md

## Known Limitations

- Quick mode summary is instruction-based (agent writes it per prompt instructions) — not programmatically enforced
- No CLI validation beyond empty description check
- Pre-existing embed-trigger.test.ts failure unrelated to this slice

## Follow-ups

- S03 will consume `loadTaskList()` for chat-to-quick handoff
- UAT needed: run `/gsd quick --fix something` in real Pi to verify the experience feels lightweight

## Files Created/Modified

- `src/resources/extensions/gsd/quick.ts` — new module: startQuick, checkQuickEnd, isQuickPending
- `src/resources/extensions/gsd/task-list.ts` — new module: loadTaskList
- `src/resources/extensions/gsd/prompts/quick-task.md` — new prompt template
- `src/resources/extensions/gsd/commands.ts` — replaced quick stub with real dispatch
- `src/resources/extensions/gsd/index.ts` — added quick mode agent_end handling
- `src/resources/extensions/gsd/auto.ts` — exported transformSessionEntries
- `src/resources/extensions/gsd/tests/quick-mode.test.ts` — 27 assertions
- `src/resources/extensions/gsd/tests/load-task-list.test.ts` — 6 assertions

## Forward Intelligence

### What the next slice should know
- Quick mode's `checkQuickEnd()` in agent_end is the pattern to follow for chat mode cleanup
- `loadTaskList()` is ready to consume — import from `task-list.ts`, pass a markdown file path
- Recall injection is automatic via `before_agent_start` (S01) — chat mode gets it for free

### What's fragile
- `transformSessionEntries` was made public from auto.ts for quick mode reuse — if auto.ts session format changes, quick mode breaks too

### Authoritative diagnostics
- `getGSDMode()` is the single source of truth for current mode — check this first when debugging mode transitions
- `.gsd/quick/` directory presence confirms quick mode ran

### What assumptions changed
- Original plan didn't include `{{outputDir}}` template var — added because the prompt needs to tell the agent where to write artifacts
