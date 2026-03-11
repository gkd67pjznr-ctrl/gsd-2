---
id: T04
parent: S01
milestone: M001
provides:
  - "{{corrections}} template variable in execute-task.md with static self-report instructions"
  - "Programmatic correction detection wired into auto.ts post-completion path"
  - "Stuck loop correction emission at retry exhaustion point"
  - "correction_capture kill switch in GSDPreferences interface"
key_files:
  - src/resources/extensions/gsd/prompts/execute-task.md
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/preferences.ts
key_decisions:
  - "Pi session entry transformation via transformSessionEntries() in auto.ts — bridges Pi format to detector's SessionEntry format, keeping detector independently testable"
  - "auto.ts correction guards use loadEffectiveGSDPreferences() (not direct file read) since auto.ts runs in real project context where process.cwd() is correct"
patterns_established:
  - "Non-fatal correction emission pattern: all correction detection and writing in auto.ts wrapped in try/catch, never blocks dispatch loop"
  - "Static self-report block pattern: SELF_REPORT_INSTRUCTIONS constant provides the default {{corrections}} content; S03 will replace with dynamic recall"
observability_surfaces:
  - "Self-report corrections appear in .gsd/patterns/corrections.jsonl with source:'self_report' — emitted by the executing agent during task runs"
  - "Programmatic corrections appear with source:'programmatic' — emitted after unit completion and at stuck detection"
  - "Kill switch: set correction_capture: false in preferences.md frontmatter to disable all correction capture"
duration: 1 context window
verification_result: passed
completed_at: 2026-03-11
blocker_discovered: false
---

# T04: Add self-report instructions to dispatch prompt and wire integration points

**Wired correction capture into auto-mode: self-report instructions in dispatch prompt, programmatic detection at post-completion, and stuck loop correction emission.**

## What Happened

1. Added `{{corrections}}` template variable to `execute-task.md` after step 10 (debugging discipline). The variable contains static self-report instructions telling the executing agent to append JSONL correction entries when it catches its own mistakes. Instructions specify the format, all 14 valid categories, required fields, file path, and that the agent should use `bash` to append.

2. Updated `buildExecuteTaskPrompt()` in `auto.ts` to pass `corrections: buildCorrectionsVar()` in the `loadPrompt()` vars. The `buildCorrectionsVar()` function checks `correction_capture` preference — returns the static self-report block if enabled (default), empty string if disabled.

3. Added `transformSessionEntries()` to convert Pi session entries (`{type:"message", message:{role, content}}` format) to the detector's `SessionEntry` format (`{type, tool, input, result}`). This bridges the gap between Pi's session manager and the independently-testable detector module.

4. Added `emitProgrammaticCorrections()` — called after `snapshotUnitMetrics()` + `saveActivityLog()` in the post-completion path where the previous unit is finalized. Transforms session entries, runs `detectCorrections()`, and writes any detected corrections via `writeCorrection()`. All guarded by `correction_capture !== false` and wrapped in try/catch.

5. Added `emitStuckCorrection()` — called at the stuck detection point when `retryCount > MAX_RETRIES`. Emits a single correction with `diagnosis_category: 'process.implementation_bug'` describing the stuck loop.

6. Added `correction_capture?: boolean` to `GSDPreferences` interface and wired it into `mergePreferences()`. Defaults to `true` when absent (undefined treated as enabled).

## Verification

- `grep -q '{{corrections}}' src/resources/extensions/gsd/prompts/execute-task.md` — PASS
- `node --experimental-strip-types src/resources/extensions/gsd/tests/correction-types.test.ts` — 82 passed, 0 failed
- `node --experimental-strip-types src/resources/extensions/gsd/tests/corrections-io.test.ts` — 26 passed, 0 failed
- `node --experimental-strip-types src/resources/extensions/gsd/tests/correction-detector.test.ts` — 25 passed, 0 failed
- `grep -q 'correction_capture' src/resources/extensions/gsd/preferences.ts` — PASS
- `grep -q 'detectCorrections' src/resources/extensions/gsd/auto.ts` — PASS
- `grep -q '.gsd/patterns/' src/resources/extensions/gsd/gitignore.ts` — PASS

All 5 slice-level verification checks pass (this is the final task of S01).

## Diagnostics

- Self-report corrections: read `.gsd/patterns/corrections.jsonl` and filter for `source: 'self_report'` entries
- Programmatic corrections: filter for `source: 'programmatic'` entries — appear after unit completion (retry/stuck/timeout/revert detection) and at stuck detection (explicit stuck loop entry)
- Kill switch: set `correction_capture: false` in `.gsd/preferences.md` frontmatter to disable all correction emission
- To verify integration is wired: `grep -c 'emitProgrammaticCorrections\|emitStuckCorrection' src/resources/extensions/gsd/auto.ts` should return 2+ matches

## Deviations

- Used `detectCorrections(session)` (the actual API from T03) instead of `detectCorrectionsFromSession()` referenced in the task plan. T03 deviated from the original plan by using a simpler `DetectionSession` object shape — this is documented in T03-SUMMARY.md.
- Added `transformSessionEntries()` bridge function not in the original plan. Pi session entries use a different format than the detector expects; the transformation was necessary and keeps the detector module independently testable.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/prompts/execute-task.md` — added `{{corrections}}` template variable with static self-report instructions
- `src/resources/extensions/gsd/auto.ts` — added imports for correction modules, `SELF_REPORT_INSTRUCTIONS` constant, `buildCorrectionsVar()`, `transformSessionEntries()`, `emitProgrammaticCorrections()`, `emitStuckCorrection()`, wired corrections into dispatch and post-completion paths
- `src/resources/extensions/gsd/preferences.ts` — added `correction_capture?: boolean` to `GSDPreferences` interface and `mergePreferences()`
- `.gsd/DECISIONS.md` — appended D017 (session entry transformation) and D018 (kill switch API choice)
