---
estimated_steps: 3
estimated_files: 3
---

# T02: Implement loadTaskList and verify full test suite

**Slice:** S02 — Quick Mode
**Milestone:** M003

## Description

Create `loadTaskList(path)` — the S03 boundary contract. This function reads a markdown file with checkbox lines and returns structured tasks. Also run the full test suite to confirm no regressions.

## Steps

1. Create `src/resources/extensions/gsd/task-list.ts`:
   - Export `loadTaskList(path: string): {title: string, done: boolean}[]`
   - Read file with `readFileSync` in try/catch — return `[]` on missing file or read error
   - Split by newlines, match lines against `/^\s*-\s*\[([ xX])\]\s+(.+)$/`
   - Return `{title: match[2].trim(), done: match[1] !== ' '}` for each match
   - Skip non-matching lines silently

2. Write `src/resources/extensions/gsd/tests/load-task-list.test.ts`:
   - Valid file with mixed `[ ]` and `[x]` items → correct titles and done flags
   - Empty file → `[]`
   - Missing file → `[]`
   - Lines without checkboxes (headings, blank lines, prose) → skipped
   - `[X]` (uppercase) → treated as done
   - Indented checkboxes → still matched

3. Run full test suite: `npx tsx --test src/resources/extensions/gsd/tests/*.test.ts` — all tests pass including existing M001/M002/M003-S01 tests.

## Must-Haves

- [ ] `loadTaskList` reads markdown checkbox lines into `{title, done}[]`
- [ ] Missing/unreadable file returns empty array (non-throwing)
- [ ] Non-checkbox lines silently skipped
- [ ] All existing tests continue to pass

## Verification

- `npx tsx --test src/resources/extensions/gsd/tests/load-task-list.test.ts` — all assertions pass
- `npx tsx --test src/resources/extensions/gsd/tests/*.test.ts` — full suite green

## Observability Impact

- Signals added/changed: None
- How a future agent inspects this: import and call `loadTaskList()` with any path
- Failure state exposed: returns empty array on error (non-throwing, consistent with D013)

## Inputs

- T01 complete (quick mode working)
- S02-RESEARCH recommendation on `loadTaskList` interface

## Expected Output

- `src/resources/extensions/gsd/task-list.ts` — new module exporting `loadTaskList`
- `src/resources/extensions/gsd/tests/load-task-list.test.ts` — test file with assertions
