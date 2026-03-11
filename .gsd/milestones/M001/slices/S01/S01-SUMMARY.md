---
id: S01
parent: M001
milestone: M001
provides:
  - CorrectionEntry interface with 14-category taxonomy (7 code + 7 process)
  - writeCorrection() — validated JSONL append with truncation, rotation, kill switch; never throws
  - readCorrections() — filtered read across active + archive files with status filter
  - rotateCorrections() — dated archive creation with collision handling and retention cleanup
  - detectCorrections() — programmatic detection from session tool call entries (retry, stuck, timeout, revert)
  - Self-report instructions in execute-task.md dispatch prompt via {{corrections}} template variable
  - correction_capture kill switch in GSDPreferences
  - .gsd/patterns/ gitignore entry
requires:
  - slice: none
    provides: first slice — no upstream dependencies
affects:
  - S02 (consumes corrections.ts, correction-types.ts for preference promotion)
  - S03 (consumes corrections.ts for recall injection, replaces static {{corrections}} with dynamic recall)
  - S05 (consumes correction-types.ts for passive monitoring observations, corrections.ts for writeCorrection)
key_files:
  - src/resources/extensions/gsd/correction-types.ts
  - src/resources/extensions/gsd/corrections.ts
  - src/resources/extensions/gsd/correction-detector.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/preferences.ts
  - src/resources/extensions/gsd/prompts/execute-task.md
  - src/resources/extensions/gsd/gitignore.ts
  - src/resources/extensions/gsd/tests/correction-types.test.ts
  - src/resources/extensions/gsd/tests/corrections-io.test.ts
  - src/resources/extensions/gsd/tests/correction-detector.test.ts
key_decisions:
  - D013: Correction I/O never throws — returns structured WriteResult with reason
  - D014: Programmatic detection prefers false negatives over false positives (conservative thresholds)
  - D015: Self-report via {{corrections}} template variable; S03 replaces with dynamic recall
  - D016: Kill switch in corrections.ts reads preferences.md directly (cwd-relative for testability)
  - D017: transformSessionEntries() bridges Pi session format to detector format
  - D018: auto.ts correction guards use loadEffectiveGSDPreferences() (runs in real project context)
patterns_established:
  - Non-throwing I/O pattern: all public functions return structured results or safe defaults, never throw
  - cwd-based path resolution: all I/O functions accept optional cwd for test isolation
  - makeValidEntry() test helper with override spread for correction test reuse
  - Non-fatal correction emission in auto.ts: all detection and writing wrapped in try/catch
  - Static self-report block as default {{corrections}} content until S03 upgrades to dynamic recall
observability_surfaces:
  - WriteResult.reason provides exact failure cause: 'invalid_entry', 'capture_disabled', or 'error'
  - readCorrections({ status }) enables querying correction state by active/retired status
  - corrections.jsonl is human-readable JSONL for raw inspection
  - detectCorrections() returns entries with diagnosis_category and diagnosis_text
  - Self-report corrections have source:'self_report'; programmatic have source:'programmatic'
  - Kill switch: set correction_capture: false in preferences.md to disable all capture
drill_down_paths:
  - .gsd/milestones/M001/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S01/tasks/T03-SUMMARY.md
  - .gsd/milestones/M001/slices/S01/tasks/T04-SUMMARY.md
duration: 4 context windows
verification_result: passed
completed_at: 2026-03-11
---

# S01: Correction Capture Foundation

**Auto-mode runs can now capture structured corrections from both programmatic detection (retries, stuck loops, timeouts, reverts) and self-report instructions in dispatch prompts, persisted as validated JSONL with a 14-category diagnosis taxonomy.**

## What Happened

Built the correction capture system in four tasks across the full stack — types, persistence, detection, and integration.

**T01** established the schema contract: `CorrectionEntry` interface with 14 diagnosis categories (7 code, 7 process), `VALID_CATEGORIES` runtime set, `isValidCategory()` and `isValidEntry()` type guards, and `REQUIRED_FIELDS` constant. Created test scaffolds for all three test suites.

**T02** built the JSONL persistence layer: `writeCorrection()` validates entries, truncates long fields, checks the kill switch, and appends JSONL — never throws. `readCorrections()` reads active + archive files with status filtering. `rotateCorrections()` creates dated archives with collision handling and cleans up by retention days. Added `.gsd/patterns/` to gitignore baseline.

**T03** built programmatic correction detection: `detectCorrections()` analyzes session tool call entries for four signals — retry (same command ≥3 times with failures), stuck loop (file oscillation), timeout (timeout markers in results), and revert (file written ≥3 times). Conservative thresholds prefer false negatives over false positives.

**T04** wired everything into auto-mode: added `{{corrections}}` template variable with static self-report instructions to `execute-task.md`, added `buildCorrectionsVar()` and `transformSessionEntries()` to `auto.ts`, called `emitProgrammaticCorrections()` at post-completion and `emitStuckCorrection()` at stuck detection, and added `correction_capture` kill switch to `GSDPreferences`.

## Verification

- `correction-types.test.ts` — 82 passed, 0 failed (taxonomy, validators, edge cases)
- `corrections-io.test.ts` — 26 passed, 0 failed (write/read/rotate lifecycle, kill switch, retention)
- `correction-detector.test.ts` — 25 passed, 0 failed (4 detection signals, conservative thresholds, clean session)
- `{{corrections}}` present in `execute-task.md` dispatch prompt
- `.gsd/patterns/` present in `gitignore.ts` baseline patterns
- `correction_capture` wired in `preferences.ts` interface and merge function
- `detectCorrections` imported and called in `auto.ts` at post-completion and stuck detection

Total: 133 test assertions passing across 3 test suites; 5 slice-level grep checks passing.

## Requirements Advanced

- R001 (Correction Capture) — both programmatic detection (retries, stuck, timeouts, reverts) and self-report instructions are implemented and wired into auto-mode
- R002 (Diagnosis Taxonomy) — full 14-category taxonomy implemented with runtime validation; all categories covered in tests
- R003 (Correction Storage and Rotation) — JSONL append-only storage with configurable rotation threshold and retention days; archive collision handling

## Requirements Validated

- R002 (Diagnosis Taxonomy) — 82 test assertions prove all 14 categories are valid, validators reject invalid categories, and entries enforce category membership. This is a contract-level proof.
- R003 (Correction Storage and Rotation) — 26 test assertions prove write/read/rotate lifecycle works: valid entries append, invalid entries reject, rotation fires at threshold, archives clean up by retention. Contract-level proof.

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

- **Detector API shape**: Used `detectCorrections(session)` with a `DetectionSession` object instead of `detectCorrectionsFromSession(entries, unitType, unitId, options)` from the original plan. The T01 test scaffold defined the actual API, and the simpler object shape is cleaner.
- **Direct entry analysis**: Detector analyzes session entries directly instead of calling `extractTrace()` from session-forensics.ts. Test fixtures use simplified entry format that `extractTrace()` doesn't parse. Direct analysis is simpler and testable.
- **Kill switch dual approach**: `corrections.ts` reads preferences.md directly (D016) for cwd-relative testability; `auto.ts` uses `loadEffectiveGSDPreferences()` (D018) since it runs in real project context. Two different approaches for the same preference due to testing constraints.
- **Import extensions**: Used `.ts` imports (not `.js`) to match project convention — Node 25.8.0 with `--experimental-strip-types` resolves `.ts` directly.

## Known Limitations

- **No runtime proof yet**: All verification is fixture-based (contract + integration). Real auto-mode runs producing corrections are deferred to later slices. R001 is advanced but not yet validated at the runtime level.
- **Self-report block is static**: The `{{corrections}}` variable currently injects a fixed instruction block. S03 will replace this with dynamic recall data including relevant past corrections.
- **Detector doesn't use extractTrace()**: The bridge was intentionally skipped for testability. If Pi session format changes, `transformSessionEntries()` in auto.ts is the single point of adaptation.

## Follow-ups

- S02 will consume `readCorrections()` and `CorrectionEntry` for preference promotion
- S03 will replace static self-report instructions with dynamic recall injection via `{{corrections}}`
- S05 will reuse `writeCorrection()` for passive monitoring observations
- Real runtime verification of correction capture should happen during S02/S03 integration testing

## Files Created/Modified

- `src/resources/extensions/gsd/correction-types.ts` — type definitions, 14-category taxonomy, validation helpers
- `src/resources/extensions/gsd/corrections.ts` — JSONL I/O: write/read/rotate with non-throwing error handling
- `src/resources/extensions/gsd/correction-detector.ts` — programmatic detector with 4 signals (retry, stuck, timeout, revert)
- `src/resources/extensions/gsd/tests/correction-types.test.ts` — 82 assertions for taxonomy and validators
- `src/resources/extensions/gsd/tests/corrections-io.test.ts` — 26 assertions for I/O lifecycle
- `src/resources/extensions/gsd/tests/correction-detector.test.ts` — 25 assertions for detection signals
- `src/resources/extensions/gsd/prompts/execute-task.md` — added `{{corrections}}` template variable with self-report instructions
- `src/resources/extensions/gsd/auto.ts` — wired correction detection at post-completion and stuck detection, added self-report block to dispatch
- `src/resources/extensions/gsd/preferences.ts` — added `correction_capture` kill switch to GSDPreferences
- `src/resources/extensions/gsd/gitignore.ts` — added `.gsd/patterns/` to baseline patterns

## Forward Intelligence

### What the next slice should know
- `readCorrections()` returns entries sorted by timestamp descending. It reads both active file and archives. Status filter: `'active'` excludes retired entries, `'retired'` includes only retired.
- `CorrectionEntry.source` is `'programmatic' | 'self_report'`. S02 preference promotion should handle both sources.
- `WriteResult` from `writeCorrection()` has `{ written: boolean, reason?: string }`. Reason values: `'invalid_entry'`, `'capture_disabled'`, `'error'`.
- The `{{corrections}}` template variable in `execute-task.md` currently gets static self-report instructions. S03 replaces this with dynamic recall. The variable is already there — just change what `buildCorrectionsVar()` returns.

### What's fragile
- `transformSessionEntries()` in auto.ts assumes Pi session entries have `content` arrays with `tool_use`/`tool_result` items inside `message` objects. If Pi SDK changes its session entry format, this function breaks silently (returns empty entries → no corrections detected, not a crash).
- Kill switch reads from two different places (D016/D018). If the preference key name changes, both must update.

### Authoritative diagnostics
- Run the 3 test suites to verify the correction system contract — 133 assertions cover the full surface
- Check `.gsd/patterns/corrections.jsonl` for raw correction data (doesn't exist yet until first real run)
- `readCorrections({ status: 'active' }, { cwd: '.' })` to query corrections programmatically

### What assumptions changed
- Originally planned to use `extractTrace()` from session-forensics.ts for detection — switched to direct entry analysis because the test fixtures use a simpler format and `extractTrace()` expects full Pi session JSONL with nested message wrappers
- Originally planned a single API signature `detectCorrectionsFromSession(entries, unitType, unitId, options)` — landed on `detectCorrections(session: DetectionSession)` which is cleaner and matches the test scaffold
