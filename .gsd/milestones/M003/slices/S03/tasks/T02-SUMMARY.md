---
id: T02
parent: S03
milestone: M003
provides:
  - Bare `/gsd quick` discovers and loads chat task lists from `.gsd/conversations/`
key_files:
  - src/resources/extensions/gsd/quick.ts
  - src/resources/extensions/gsd/tests/chat-handoff.test.ts
key_decisions:
  - Only undone tasks (unchecked checkboxes) are included in the quick mode description
patterns_established:
  - Task list handoff uses "Execute task list from chat:\n- ..." prefix format
observability_surfaces:
  - Quick mode prompt content contains "Execute task list from chat" prefix when sourced from chat
duration: 1 step
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T02: Wire quick mode to discover and load chat task lists

**Bare `/gsd quick` now discovers the most recent chat task list and dispatches undone items as a quick mode task.**

## What Happened

Modified `startQuick()` in `quick.ts` to handle the empty-description case: when no `--` description is provided, it calls `findRecentTaskList()` from `chat.ts` to locate the most recent `tasks.md` in `.gsd/conversations/`. If found, it loads the task list via `loadTaskList()`, filters to undone items, and formats them into a description string prefixed with "Execute task list from chat:". If no task list exists, the existing usage notification is shown.

Added 7 new assertions to `chat-handoff.test.ts` covering: message dispatch with task list, correct formatting of undone items, exclusion of done items, and fallback to usage notification when no task list exists.

## Verification

- `npx tsx src/resources/extensions/gsd/tests/chat-handoff.test.ts` — 14 passed, 0 failed
- `npx tsx --test src/resources/extensions/gsd/tests/*.test.ts` — 76/77 pass (1 pre-existing failure: embed-trigger.test.ts missing vitest dependency, unrelated)

## Diagnostics

- Check quick mode prompt content for "Execute task list from chat" prefix to confirm chat handoff was used
- Inherits existing quick mode observability (status, output dir, corrections)

## Deviations

None.

## Known Issues

- Pre-existing: `embed-trigger.test.ts` fails due to missing vitest package (not related to this task)

## Files Created/Modified

- `src/resources/extensions/gsd/quick.ts` — Added chat task list discovery on bare `/gsd quick` invocation
- `src/resources/extensions/gsd/tests/chat-handoff.test.ts` — Added 7 assertions for quick mode + chat task list integration
