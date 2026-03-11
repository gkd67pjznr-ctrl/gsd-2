---
id: T03
parent: S01
milestone: M001
provides:
  - "detectCorrections() — programmatic correction detection from session tool call entries"
  - "DetectionSession/SessionEntry types for detector input"
  - "Four detection signals: retry, stuck loop, timeout, revert"
key_files:
  - src/resources/extensions/gsd/correction-detector.ts
  - src/resources/extensions/gsd/tests/correction-detector.test.ts
key_decisions:
  - "Detector works directly on session entry arrays ({type, tool, input, result}) rather than through extractTrace() — the existing test scaffold uses simplified entry format that extractTrace() doesn't parse (it expects pi session JSONL with nested message wrappers). Direct analysis is simpler and more testable."
  - "Conservative thresholds: retry ≥ 3 runs of same command with failures, stuck ≥ 3 edits with oscillation, revert ≥ 3 writes to same file, timeout ≥ 1 timeout in results. Single retries/rewrites are normal and not flagged."
patterns_established:
  - "Non-throwing detector pattern: all detection signals run independently, failures in one don't block others, top-level try/catch returns empty array"
  - "buildCorrectionEntry() helper validates via isValidEntry() before returning — invalid entries are silently dropped"
observability_surfaces:
  - "detectCorrections() returns CorrectionEntry[] with diagnosis_category and diagnosis_text explaining what was detected and why"
  - "Returns empty array on any error — no way to distinguish 'nothing detected' from 'detection failed' (correct tradeoff for non-critical observation)"
duration: 1 context window
verification_result: passed
completed_at: 2026-03-11
blocker_discovered: false
---

# T03: Implement programmatic correction detector from session traces

**Built programmatic correction detector with four detection signals (retry, stuck loop, timeout, revert) that analyzes session tool call entries and produces validated CorrectionEntry objects.**

## What Happened

Created `correction-detector.ts` with `detectCorrections(session)` as the main entry point. The function accepts a `DetectionSession` object containing session metadata and an array of tool call entries, runs four independent detection signals, and returns validated `CorrectionEntry` objects.

Detection signals implemented:
- **Retry detection**: flags commands run ≥3 times with at least 1 failure → `process.implementation_bug`
- **Stuck loop detection**: flags files with ≥3 edits showing oscillation (A→B→A pattern) → `code.wrong_pattern`
- **Timeout detection**: flags tool results containing timeout indicators → `process.planning_error`
- **Revert detection**: flags files written ≥3 times → `code.wrong_pattern`

Updated the test file (scaffolded in T01) to add 14 additional assertions covering: isValidEntry() validation on all returned entries, correct diagnosis categories per signal, conservative threshold verification (single retry/rewrite doesn't trigger), and edge cases (empty/null input).

## Verification

- `node --experimental-strip-types src/resources/extensions/gsd/tests/correction-detector.test.ts` — 25 passed, 0 failed
- `node --experimental-strip-types src/resources/extensions/gsd/tests/correction-types.test.ts` — 82 passed, 0 failed
- `node --experimental-strip-types src/resources/extensions/gsd/tests/corrections-io.test.ts` — 26 passed, 0 failed
- `grep -q '.gsd/patterns/' src/resources/extensions/gsd/gitignore.ts` — PASS
- `grep -q '{{corrections}}' src/resources/extensions/gsd/prompts/execute-task.md` — expected FAIL (later task)

Slice verification: 4 of 5 checks pass. The `{{corrections}}` template variable in dispatch prompt is a later task (T04/T05).

## Diagnostics

- Call `detectCorrections({ session_id, phase, entries })` with session data and inspect returned array
- Each returned entry has `diagnosis_category` and `diagnosis_text` explaining the detection signal
- Empty array means either no corrections detected or detection failed (conservative design)
- All entries have `source: 'programmatic'` to distinguish from self-reported corrections

## Deviations

- Used `detectCorrections(session)` API shape (matching the T01 test scaffold) instead of `detectCorrectionsFromSession(entries, unitType, unitId, options)` from the task plan. The test scaffold was created first and defines the public API. Session metadata (session_id, phase, unit_type, unit_id) is passed via the session object.
- Detector analyzes entries directly rather than calling `extractTrace()` from session-forensics.ts. The test fixtures use simplified entry format `{type, tool, input, result}` which `extractTrace()` doesn't parse (it expects pi session JSONL with `{type: "message", message: {role, content}}` wrappers). Direct analysis is simpler and matches the test contract.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/correction-detector.ts` — new: programmatic correction detector with four detection signals
- `src/resources/extensions/gsd/tests/correction-detector.test.ts` — updated: added 14 assertions for validation, categories, thresholds, and edge cases (25 total)
