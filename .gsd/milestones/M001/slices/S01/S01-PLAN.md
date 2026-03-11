# S01: Correction Capture Foundation

**Goal:** Auto-mode runs produce structured correction entries in `.gsd/patterns/corrections.jsonl` from both programmatic detection (retries, stuck, timeouts) and self-report instructions in dispatch prompts.
**Demo:** After an auto-mode run that includes a retry or stuck detection, `corrections.jsonl` contains valid entries with diagnosis categories from the 14-category taxonomy. The dispatch prompt includes self-report instructions telling the agent to log soft corrections.

## Must-Haves

- `CorrectionEntry` interface with 14-category taxonomy, scope enum, source union type (R001, R002)
- `writeCorrection()` appends validated, truncated JSONL entries; never throws (R001)
- `readCorrections()` reads active file + archives with status filter (R003)
- `rotateCorrections()` renames to dated archive at threshold, cleans up by retention (R003)
- `detectCorrectionsFromSession()` produces entries from activity log traces: retries, stuck loops, timeout recoveries (R001)
- Self-report instructions injected into `execute-task.md` dispatch prompt via `{{corrections}}` variable (R001)
- `.gsd/patterns/` added to gitignore baseline patterns (R003)
- All correction I/O is non-fatal — errors silenced, auto-mode never blocked (R001)
- Tests cover: valid/invalid entries, all 14 categories, rotation, archive cleanup, detection from fixture data (R001, R002, R003)

## Proof Level

- This slice proves: contract + integration (fixture-based)
- Real runtime required: no — programmatic detection is tested with fixture data matching real session JSONL format; integration with `auto.ts` is wired but verified in later slices with real runs
- Human/UAT required: no

## Verification

- `node --experimental-strip-types src/resources/extensions/gsd/tests/correction-types.test.ts` — validates taxonomy constants and type guards
- `node --experimental-strip-types src/resources/extensions/gsd/tests/corrections-io.test.ts` — validates write/read/rotate lifecycle, field truncation, validation rejection, rotation at threshold, archive cleanup by retention
- `node --experimental-strip-types src/resources/extensions/gsd/tests/correction-detector.test.ts` — validates detection from fixture session data: retry detection, stuck loop detection, timeout recovery detection, no false positives from clean sessions
- `grep -q '{{corrections}}' src/resources/extensions/gsd/prompts/execute-task.md` — confirms template variable exists in dispatch prompt
- `grep -q '.gsd/patterns/' src/resources/extensions/gsd/gitignore.ts` — confirms gitignore baseline updated

## Observability / Diagnostics

- Runtime signals: `writeCorrection()` returns `{ written: boolean, reason?: string }` — callers can log the reason on failure without throwing
- Inspection surfaces: `readCorrections()` with status filter lets any future module query correction state; `corrections.jsonl` is human-readable JSONL
- Failure visibility: validation failures return `reason: 'invalid_entry'`; capture-disabled returns `reason: 'capture_disabled'`; I/O errors return `reason: 'error'`
- Redaction constraints: correction entries may contain file paths and code patterns but never secrets; `diagnosis_text` capped at 100 words

## Integration Closure

- Upstream surfaces consumed: `session-forensics.ts` → `extractTrace()` for programmatic detection; `gitignore.ts` → `BASELINE_PATTERNS` for pattern registration; `prompt-loader.ts` → `loadPrompt()` for template variable support; `preferences.ts` → `GSDPreferences` for kill switch
- New wiring introduced in this slice: `{{corrections}}` template variable in `execute-task.md`; `.gsd/patterns/` gitignore entry; three new modules (`correction-types.ts`, `corrections.ts`, `correction-detector.ts`) exporting public APIs consumed by S02/S03/S05
- What remains before the milestone is truly usable end-to-end: S02 (preference promotion from corrections), S03 (recall injection filling `{{corrections}}` with past correction data), S04 (quality gating), S05 (tech debt + passive monitoring), and integration of `detectCorrectionsFromSession()` calls into `auto.ts` dispatch loop (wired in S01 T04 but verified with real runs in later slices)

## Tasks

- [x] **T01: Create correction type definitions and test scaffold** `est:30m`
  - Why: establishes the schema contract (R001, R002) that all other tasks and downstream slices depend on; creates test files that initially fail
  - Files: `src/resources/extensions/gsd/correction-types.ts`, `src/resources/extensions/gsd/tests/correction-types.test.ts`, `src/resources/extensions/gsd/tests/corrections-io.test.ts`, `src/resources/extensions/gsd/tests/correction-detector.test.ts`
  - Do: Define `CorrectionEntry` interface, `DiagnosisCategory` union (14 categories), `CorrectionScope` enum, `CorrectionSource` union, validation function `isValidCategory()`, and field constants. Create all three test files with real assertions that import from the modules — they will fail until T02/T03 implement the runtime code. The type test file should pass after this task.
  - Verify: `node --experimental-strip-types src/resources/extensions/gsd/tests/correction-types.test.ts` passes; the other two test files exist with real assertions (expected to fail)
  - Done when: `correction-types.ts` exports are importable; type test passes; I/O and detector test files exist with meaningful assertions

- [x] **T02: Implement correction JSONL I/O with write, read, and rotate** `est:45m`
  - Why: delivers the core persistence layer (R001, R003) — validated write, filtered read, rotation with archive cleanup
  - Files: `src/resources/extensions/gsd/corrections.ts`, `src/resources/extensions/gsd/tests/corrections-io.test.ts`, `src/resources/extensions/gsd/gitignore.ts`
  - Do: Implement `writeCorrection(entry, options)` with validation, field truncation, directory creation, rotation check, `appendFileSync` append. Implement `readCorrections(filters, options)` reading active + archive files with status filter. Implement `rotateCorrections(threshold, options)` with dated archive rename and retention cleanup. Add `.gsd/patterns/` to `BASELINE_PATTERNS` in `gitignore.ts`. All I/O non-fatal with try/catch. Update the I/O test file to make all assertions pass.
  - Verify: `node --experimental-strip-types src/resources/extensions/gsd/tests/corrections-io.test.ts` passes; `grep -q '.gsd/patterns/' src/resources/extensions/gsd/gitignore.ts` succeeds
  - Done when: write/read/rotate functions work with temp directories; gitignore updated; all I/O tests pass

- [x] **T03: Implement programmatic correction detector from session traces** `est:45m`
  - Why: delivers the programmatic detection arm of D001 (R001) — converts activity log patterns into structured corrections
  - Files: `src/resources/extensions/gsd/correction-detector.ts`, `src/resources/extensions/gsd/tests/correction-detector.test.ts`
  - Do: Implement `detectCorrectionsFromSession(sessionData, unitType, unitId, options)` that takes raw session JSONL entries (same format `extractTrace()` consumes), calls `extractTrace()`, and produces `CorrectionEntry[]` for: (1) retries — same unit dispatched twice detected via duplicate dispatch markers, (2) stuck loops — excessive tool errors or repetitive file writes, (3) timeout recoveries — presence of timeout/recovery markers, (4) revert patterns — file written then re-written with different content. Each detected correction gets an appropriate `diagnosis_category`. Return empty array for clean sessions (no false positives). Update detector test file with fixture data to make all assertions pass.
  - Verify: `node --experimental-strip-types src/resources/extensions/gsd/tests/correction-detector.test.ts` passes
  - Done when: detector produces correct entries from fixture data representing retry, stuck, timeout, and revert scenarios; produces empty array from clean session fixture

- [x] **T04: Add self-report instructions to dispatch prompt and wire integration points** `est:30m`
  - Why: delivers the self-report arm of D001 (R001) and wires the correction system into the dispatch and auto-mode infrastructure
  - Files: `src/resources/extensions/gsd/prompts/execute-task.md`, `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/preferences.ts`
  - Do: (1) Add `{{corrections}}` template variable to `execute-task.md` with static self-report instructions telling the agent to append structured JSONL to `.gsd/patterns/corrections.jsonl` when it catches its own mistakes — specify format, required fields, categories. (2) Update `auto.ts` dispatch code to pass `corrections: "<self-report block>"` in the `loadPrompt()` vars for `execute-task`. (3) Add `correction_capture?: boolean` to `GSDPreferences` interface for kill switch. (4) Add `detectCorrectionsFromSession()` call after `snapshotUnitMetrics()` in the post-completion hook and at the stuck detection point, guarded by `correction_capture !== false`.
  - Verify: `grep -q '{{corrections}}' src/resources/extensions/gsd/prompts/execute-task.md`; all three test suites still pass; TypeScript in `auto.ts` has no syntax errors (`node --experimental-strip-types -e "import './src/resources/extensions/gsd/auto.ts'"` or equivalent syntax check)
  - Done when: dispatch prompt includes self-report instructions; auto.ts emits corrections at retry/stuck/timeout points; kill switch available in preferences

## Files Likely Touched

- `src/resources/extensions/gsd/correction-types.ts` (new)
- `src/resources/extensions/gsd/corrections.ts` (new)
- `src/resources/extensions/gsd/correction-detector.ts` (new)
- `src/resources/extensions/gsd/tests/correction-types.test.ts` (new)
- `src/resources/extensions/gsd/tests/corrections-io.test.ts` (new)
- `src/resources/extensions/gsd/tests/correction-detector.test.ts` (new)
- `src/resources/extensions/gsd/prompts/execute-task.md` (modified)
- `src/resources/extensions/gsd/auto.ts` (modified)
- `src/resources/extensions/gsd/preferences.ts` (modified)
- `src/resources/extensions/gsd/gitignore.ts` (modified)
