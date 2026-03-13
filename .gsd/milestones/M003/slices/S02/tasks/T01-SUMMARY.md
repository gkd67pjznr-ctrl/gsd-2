---
id: T01
parent: S02
milestone: M003
provides:
  - quick mode dispatch (startQuick, checkQuickEnd, isQuickPending)
  - quick-task.md prompt template
  - transformSessionEntries exported from auto.ts
key_files:
  - src/resources/extensions/gsd/quick.ts
  - src/resources/extensions/gsd/prompts/quick-task.md
  - src/resources/extensions/gsd/commands.ts
  - src/resources/extensions/gsd/index.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/tests/quick-mode.test.ts
key_decisions:
  - Added outputDir as a third template variable in quick-task.md so the prompt can instruct the agent where to write its summary
patterns_established:
  - Quick mode follows the same correction-capture pattern as auto-mode (transformSessionEntries + detectCorrections + writeCorrection + checkAndPromote)
observability_surfaces:
  - getGSDMode() returns 'quick' during execution, 'idle' after
  - status bar key "gsd-mode" shows "quick" during execution
duration: 1 session
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T01: Implement quick mode dispatch and prompt template

**Built quick mode: `/gsd quick --fix the login button` parses description, creates output dir, sets status to "quick", loads prompt with quality instructions, dispatches via pi.sendMessage, and captures corrections on agent_end.**

## What Happened

Created `quick.ts` with `startQuick()` (parses args, creates `.gsd/quick/<timestamp>/` dir, sets status, loads prompt, sends message), `checkQuickEnd()` (captures corrections from session, resets status to idle in try/finally), and `isQuickPending()`. Created `quick-task.md` prompt template with `{{description}}`, `{{quality}}`, and `{{outputDir}}` variables. Replaced the stub in `commands.ts` with real dispatch. Added quick mode handling in `index.ts` agent_end hook before the auto-mode check. Exported `transformSessionEntries` from `auto.ts`. Wrote comprehensive tests covering arg parsing, prompt loading, status transitions, error recovery, and the export.

## Verification

- `npx tsx --test src/resources/extensions/gsd/tests/quick-mode.test.ts` — 27 assertions passed
- `grep 'export function transformSessionEntries' src/resources/extensions/gsd/auto.ts` — confirmed export
- Full test suite: 68/69 passed (1 pre-existing failure in embed-trigger.test.ts, unrelated)

## Diagnostics

- `getGSDMode()` returns current mode — "quick" during execution, "idle" after
- Status bar key "gsd-mode" visible in UI
- `.gsd/quick/<timestamp>/` directory created per session

## Deviations

- Added `{{outputDir}}` as a third template variable (not in original plan) — needed so the prompt can tell the agent where to write summary.md

## Known Issues

None

## Files Created/Modified

- `src/resources/extensions/gsd/quick.ts` — new module with startQuick, checkQuickEnd, isQuickPending
- `src/resources/extensions/gsd/prompts/quick-task.md` — new prompt template
- `src/resources/extensions/gsd/commands.ts` — replaced quick stub with real dispatch, added import
- `src/resources/extensions/gsd/index.ts` — added quick mode agent_end handling, imported checkQuickEnd and getGSDMode
- `src/resources/extensions/gsd/auto.ts` — exported transformSessionEntries (was private)
- `src/resources/extensions/gsd/tests/quick-mode.test.ts` — comprehensive test file (27 assertions)
