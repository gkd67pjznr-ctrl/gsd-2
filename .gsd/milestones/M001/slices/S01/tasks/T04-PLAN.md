---
estimated_steps: 5
estimated_files: 3
---

# T04: Add self-report instructions to dispatch prompt and wire integration points

**Slice:** S01 — Correction Capture Foundation
**Milestone:** M001

## Description

Complete the slice by wiring the correction system into the dispatch infrastructure. Add self-report instructions as a `{{corrections}}` template variable in the execute-task prompt, wire `detectCorrectionsFromSession()` calls into `auto.ts` at the post-completion and stuck-detection points, and add the `correction_capture` kill switch to `GSDPreferences`.

## Steps

1. Add `{{corrections}}` template variable to `execute-task.md`:
   - Place it after the main execution instructions (after step 10) as a clearly delimited section
   - Content: static self-report instructions telling the agent to log corrections when it catches its own mistakes — specify the JSONL format, required fields (`correction_from`, `correction_to`, `diagnosis_category`, `diagnosis_text`, `scope`, `phase`, `timestamp`, `session_id`, `source: 'self_report'`), the 14 valid categories, the file path (`.gsd/patterns/corrections.jsonl`), and that the agent should use `bash` to append a JSON line
   - Keep the instruction block concise (~200-300 tokens) — prominent, specific, actionable
   - Note: in S01 this is always the same static block. S03 will fill it with dynamic recall data.
2. Update the `execute-task` dispatch code in `auto.ts` to pass `corrections` in the `loadPrompt()` vars:
   - Build the corrections value as the static self-report instruction block
   - Guard with `correction_capture !== false` from `loadEffectiveGSDPreferences()` — if disabled, pass empty string for `{{corrections}}`
   - Import `loadEffectiveGSDPreferences` if not already imported
3. Wire `detectCorrectionsFromSession()` into `auto.ts`:
   - After `snapshotUnitMetrics()` in the post-completion path (where `saveActivityLog()` is called), call `detectCorrectionsFromSession()` with the current session entries from `ctx.sessionManager.getEntries()`, the `unitType`, and `unitId`
   - For each returned entry, call `writeCorrection(entry, { basePath })`
   - At the stuck detection point (where `retryCount > MAX_RETRIES`), emit a single correction entry with `diagnosis_category: 'process.implementation_bug'`, `source: 'programmatic'`, describing the stuck loop
   - All correction emission wrapped in try/catch — never block the dispatch loop
   - Guard all emission with `correction_capture !== false`
4. Add `correction_capture?: boolean` to `GSDPreferences` interface in `preferences.ts` — optional boolean, defaults to `true` when absent (undefined treated as enabled)
5. Run all three test suites to verify no regressions, then verify the prompt template contains the variable and the gitignore entry exists

## Must-Haves

- [ ] `{{corrections}}` variable in `execute-task.md` with specific, actionable self-report instructions
- [ ] `auto.ts` passes corrections value to `loadPrompt()` for execute-task dispatch
- [ ] `auto.ts` calls `detectCorrectionsFromSession()` after unit completion
- [ ] `auto.ts` emits correction at stuck detection point
- [ ] All correction emission is non-fatal (try/catch wrapped)
- [ ] `correction_capture` kill switch in `GSDPreferences`
- [ ] All existing tests still pass (no regressions)

## Verification

- `grep -q '{{corrections}}' src/resources/extensions/gsd/prompts/execute-task.md` exits 0
- `node --experimental-strip-types src/resources/extensions/gsd/tests/correction-types.test.ts` passes
- `node --experimental-strip-types src/resources/extensions/gsd/tests/corrections-io.test.ts` passes
- `node --experimental-strip-types src/resources/extensions/gsd/tests/correction-detector.test.ts` passes
- `grep -q 'correction_capture' src/resources/extensions/gsd/preferences.ts` exits 0
- `grep -q 'detectCorrectionsFromSession' src/resources/extensions/gsd/auto.ts` exits 0

## Observability Impact

- Signals added/changed: dispatch prompts now contain self-report instructions, so agents will produce `source: 'self_report'` corrections in `corrections.jsonl` during execution; programmatic corrections from `source: 'programmatic'` appear after unit completion and at stuck detection
- How a future agent inspects this: read `corrections.jsonl` to see both self-report and programmatic entries; check `GSDPreferences.correction_capture` to verify if capture is enabled; `grep` for `detectCorrectionsFromSession` in `auto.ts` to trace the integration
- Failure state exposed: correction emission failures are silently caught — if corrections aren't appearing, check: (1) `correction_capture` preference, (2) `isValidEntry()` validation on emitted entries, (3) file permissions on `.gsd/patterns/`

## Inputs

- `src/resources/extensions/gsd/correction-types.ts` — T01 output: `CorrectionEntry`, type constants
- `src/resources/extensions/gsd/corrections.ts` — T02 output: `writeCorrection()`
- `src/resources/extensions/gsd/correction-detector.ts` — T03 output: `detectCorrectionsFromSession()`
- `src/resources/extensions/gsd/auto.ts` — dispatch loop, stuck detection, post-completion hooks
- `src/resources/extensions/gsd/prompts/execute-task.md` — dispatch prompt template
- `src/resources/extensions/gsd/preferences.ts` — `GSDPreferences` interface, `loadEffectiveGSDPreferences()`

## Expected Output

- `src/resources/extensions/gsd/prompts/execute-task.md` — contains `{{corrections}}` with self-report instructions
- `src/resources/extensions/gsd/auto.ts` — wired with correction detection and emission at post-completion and stuck points
- `src/resources/extensions/gsd/preferences.ts` — `correction_capture` field added to `GSDPreferences`
