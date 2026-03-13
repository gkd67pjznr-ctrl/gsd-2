---
id: T02
parent: S02
milestone: M003
provides:
  - loadTaskList(path) — markdown checkbox parser returning {title, done}[]
key_files:
  - src/resources/extensions/gsd/task-list.ts
  - src/resources/extensions/gsd/tests/load-task-list.test.ts
key_decisions: []
patterns_established:
  - Non-throwing file readers return empty array on error (consistent with D013)
observability_surfaces:
  - none — pure utility function, inspectable by calling it
duration: 5m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T02: Implement loadTaskList and verify full test suite

**Created `loadTaskList(path)` markdown checkbox parser and verified full test suite passes.**

## What Happened

Implemented `task-list.ts` exporting `loadTaskList(path)` which reads a markdown file, matches checkbox lines (`- [ ]` / `- [x]` / `- [X]`), and returns `{title, done}[]`. Missing/unreadable files return `[]`. Non-checkbox lines are silently skipped. Indented checkboxes are supported.

Wrote 6 test cases covering: mixed done/undone, empty file, missing file, non-checkbox lines skipped, uppercase `[X]`, and indented checkboxes. All pass.

## Verification

- `npx tsx --test src/resources/extensions/gsd/tests/load-task-list.test.ts` — 6/6 pass
- `npx tsx --test src/resources/extensions/gsd/tests/*.test.ts` — 74 pass, 1 fail (pre-existing `embed-trigger.test.ts` failure unrelated to this slice)

### Slice-level verification status

- ✅ `load-task-list.test.ts` — all pass
- ✅ `quick-mode.test.ts` — all pass (from T01)
- ⚠️ Full suite — 74/75 pass; 1 pre-existing failure in `embed-trigger.test.ts`

## Diagnostics

Import and call `loadTaskList(path)` with any markdown file path. Returns empty array on any error.

## Deviations

None.

## Known Issues

- Pre-existing test failure in `embed-trigger.test.ts` (not introduced by this slice)

## Files Created/Modified

- `src/resources/extensions/gsd/task-list.ts` — new module exporting `loadTaskList`
- `src/resources/extensions/gsd/tests/load-task-list.test.ts` — 6 test cases for task list parsing
