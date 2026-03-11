---
estimated_steps: 4
estimated_files: 2
---

# T03: Implement programmatic correction detector from session traces

**Slice:** S01 — Correction Capture Foundation
**Milestone:** M001

## Description

Build the programmatic detection arm of D001: analyze activity log session data (the same JSONL format `extractTrace()` consumes) and produce `CorrectionEntry` objects for retries, stuck loops, timeout recoveries, and revert patterns. Reuse `extractTrace()` from `session-forensics.ts` — don't re-parse session data.

## Steps

1. Create `correction-detector.ts` with:
   - `detectCorrectionsFromSession(entries: unknown[], unitType: string, unitId: string, options?: { sessionId?: string, phase?: string }): CorrectionEntry[]` — takes raw session JSONL entries, calls `extractTrace(entries)`, analyzes the trace for correction signals, returns `CorrectionEntry[]`. Never throws — returns empty array on any error.
   - Detection signals (each produces one `CorrectionEntry` with appropriate `diagnosis_category` and `source: 'programmatic'`):
     - **Retry detection**: if `entries` contain multiple dispatch markers (session-start entries) for the same unit, emit `process.implementation_bug` — "Unit dispatched multiple times indicating retry"
     - **Stuck/error accumulation**: if `trace.errors.length` exceeds a threshold (≥3 errors in one session), emit `process.implementation_bug` — "Multiple tool errors in single session"
     - **Timeout recovery**: if entries contain timeout/recovery markers (identifiable by tool calls to recovery-related functions or specific patterns), emit `process.planning_error` — "Unit required timeout recovery"
     - **Revert pattern**: if `trace.filesWritten` contains duplicates (same file written multiple times = re-written), emit `code.wrong_pattern` — "File rewritten multiple times suggesting correction"
   - Helper `buildCorrectionEntry(fields)` that fills common fields (timestamp, session_id from options or generated, source: 'programmatic', scope: 'project') and validates via `isValidEntry()` before returning
2. Create fixture data in the test file (not separate fixture files) representing:
   - A clean session with normal tool calls and no errors
   - A retry session with duplicate dispatch markers
   - A session with 3+ tool errors
   - A session with timeout/recovery markers
   - A session where the same file is written 3+ times
3. Update `tests/correction-detector.test.ts` to exercise each detection signal with the fixture data:
   - Clean session → returns empty array
   - Retry fixture → returns entry with `process.implementation_bug` and `source: 'programmatic'`
   - Error accumulation fixture → returns entry with `process.implementation_bug`
   - Timeout fixture → returns entry with `process.planning_error`
   - Revert fixture → returns entry with `code.wrong_pattern`
   - All returned entries pass `isValidEntry()` — they are well-formed `CorrectionEntry` objects
4. Ensure detection is conservative — prefer false negatives over false positives. A session with 1 error or 1 file rewrite is normal; only flag clear patterns.

## Must-Haves

- [ ] `detectCorrectionsFromSession()` produces entries from session data via `extractTrace()`
- [ ] Retry detection works from duplicate dispatch markers
- [ ] Error accumulation detection works from `trace.errors` count
- [ ] Revert pattern detection works from duplicate `trace.filesWritten` entries
- [ ] Clean session produces empty array (no false positives)
- [ ] All returned entries pass `isValidEntry()` validation
- [ ] All detector tests pass

## Verification

- `node --experimental-strip-types src/resources/extensions/gsd/tests/correction-detector.test.ts` exits 0 with all assertions passing

## Observability Impact

- Signals added/changed: `detectCorrectionsFromSession()` produces structured `CorrectionEntry[]` — each entry includes `diagnosis_category` and `diagnosis_text` explaining what was detected and why
- How a future agent inspects this: call the function with session entries and inspect the returned array; `diagnosis_text` contains human-readable explanation of the detection signal
- Failure state exposed: returns empty array on any error (conservative) — no way to distinguish "nothing detected" from "detection failed" at this level, which is the right tradeoff for a non-critical observation system

## Inputs

- `src/resources/extensions/gsd/correction-types.ts` — T01 output: `CorrectionEntry`, `isValidEntry()`, `DiagnosisCategory`
- `src/resources/extensions/gsd/session-forensics.ts` — `extractTrace(entries)` reused for session parsing
- Real session JSONL format from `session-forensics.ts` comments — tool call/result entry shapes

## Expected Output

- `src/resources/extensions/gsd/correction-detector.ts` — working detector module
- `src/resources/extensions/gsd/tests/correction-detector.test.ts` — all assertions passing with fixture-based tests
