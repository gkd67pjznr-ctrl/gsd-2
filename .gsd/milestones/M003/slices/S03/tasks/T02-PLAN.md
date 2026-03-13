---
estimated_steps: 3
estimated_files: 3
---

# T02: Wire quick mode to discover and load chat task lists

**Slice:** S03 — Chat Mode with Quick Handoff
**Milestone:** M003

## Description

Complete the chat-to-quick handoff by wiring bare `/gsd quick` (no `--` description) to discover the most recent task list from `.gsd/conversations/` and dispatch it as a quick mode task.

## Steps

1. In `quick.ts` `startQuick()`, after `parseQuickDescription()` returns empty string: instead of showing the usage notification, call `findRecentTaskList()` from `chat.ts`. If a task list path is found, call `loadTaskList(path)` from `task-list.ts`, format undone task items into a description string (e.g. "Execute task list from chat:\n- Task 1\n- Task 2"), and proceed with the normal quick dispatch flow using that description. If no task list found, show the existing usage notification.
2. Add assertions to `chat-handoff.test.ts`: bare `/gsd quick` (empty description) triggers `findRecentTaskList()` call; when task list exists, items are formatted into the quick prompt description; when no task list exists, shows usage notification.
3. Run full test suite to confirm no regressions.

## Must-Haves

- [ ] Bare `/gsd quick` discovers most recent chat task list via `findRecentTaskList()`
- [ ] Task list items formatted into quick mode description
- [ ] Falls back to usage notification when no task list exists
- [ ] All existing tests continue to pass

## Verification

- `npx tsx --test src/resources/extensions/gsd/tests/chat-handoff.test.ts` — new assertions pass
- `npx tsx --test src/resources/extensions/gsd/tests/*.test.ts` — full suite passes

## Observability Impact

- Signals added/changed: None — uses existing quick mode observability
- How a future agent inspects this: check quick mode prompt content for "Execute task list from chat" prefix
- Failure state exposed: None new — inherits quick mode's try/finally status reset

## Inputs

- `src/resources/extensions/gsd/chat.ts` — `findRecentTaskList()` from T01
- `src/resources/extensions/gsd/task-list.ts` — `loadTaskList()` from S02
- `src/resources/extensions/gsd/quick.ts` — existing startQuick to modify

## Expected Output

- `src/resources/extensions/gsd/quick.ts` — modified to handle bare invocation with task list discovery
- `src/resources/extensions/gsd/tests/chat-handoff.test.ts` — additional assertions for quick mode integration
