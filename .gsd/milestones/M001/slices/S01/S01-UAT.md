# S01: Correction Capture Foundation — UAT

**Milestone:** M001
**Written:** 2026-03-11

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S01 is a foundation slice delivering type contracts, I/O functions, and detection logic. All interfaces are exercised via unit tests with fixture data. Real runtime verification (corrections from actual auto-mode runs) is deferred to S02/S03 integration — this is documented in the slice plan's proof level: "contract + integration (fixture-based)".

## Preconditions

- Node.js with `--experimental-strip-types` support (Node 25.8.0+)
- Working directory is the gsd2 project root

## Smoke Test

Run all three test suites:
```bash
node --experimental-strip-types src/resources/extensions/gsd/tests/correction-types.test.ts
node --experimental-strip-types src/resources/extensions/gsd/tests/corrections-io.test.ts
node --experimental-strip-types src/resources/extensions/gsd/tests/correction-detector.test.ts
```
All must pass (133 total assertions).

## Test Cases

### 1. Taxonomy contract integrity

1. Run `node --experimental-strip-types src/resources/extensions/gsd/tests/correction-types.test.ts`
2. **Expected:** 82 assertions pass. All 14 categories validated, type guards reject invalid entries, word count enforcement works.

### 2. JSONL write/read/rotate lifecycle

1. Run `node --experimental-strip-types src/resources/extensions/gsd/tests/corrections-io.test.ts`
2. **Expected:** 26 assertions pass. Valid entries written, invalid entries rejected with reason, field truncation works, rotation creates dated archives, retention cleanup removes old archives, kill switch disables capture.

### 3. Programmatic detection from fixture sessions

1. Run `node --experimental-strip-types src/resources/extensions/gsd/tests/correction-detector.test.ts`
2. **Expected:** 25 assertions pass. Retry detection, stuck loop detection, timeout detection, and revert detection all produce correct entries. Clean sessions produce empty array. Conservative thresholds prevent false positives from single retries/rewrites.

### 4. Dispatch prompt integration

1. Run `grep '{{corrections}}' src/resources/extensions/gsd/prompts/execute-task.md`
2. **Expected:** Template variable present in the dispatch prompt with self-report instructions.

### 5. Gitignore baseline

1. Run `grep '.gsd/patterns/' src/resources/extensions/gsd/gitignore.ts`
2. **Expected:** Pattern present in BASELINE_PATTERNS array.

### 6. Kill switch in preferences

1. Run `grep 'correction_capture' src/resources/extensions/gsd/preferences.ts`
2. **Expected:** Field present in GSDPreferences interface and mergePreferences function.

### 7. Auto.ts wiring

1. Run `grep -c 'emitProgrammaticCorrections\|emitStuckCorrection' src/resources/extensions/gsd/auto.ts`
2. **Expected:** At least 2 matches — both functions called in auto-mode dispatch loop.

## Edge Cases

### Invalid correction entries never persist

1. Call `writeCorrection()` with missing required fields or invalid category
2. **Expected:** Returns `{ written: false, reason: 'invalid_entry' }`, no line appended to JSONL file

### Kill switch prevents all capture

1. Set `correction_capture: false` in preferences.md frontmatter
2. Call `writeCorrection()` with a valid entry
3. **Expected:** Returns `{ written: false, reason: 'capture_disabled' }`

### I/O errors never throw

1. Call `readCorrections()` on a nonexistent directory
2. **Expected:** Returns empty array `[]`, no exception

### Clean session produces no corrections

1. Call `detectCorrections()` with session entries containing no error patterns
2. **Expected:** Returns empty array `[]`

## Failure Signals

- Any test suite reporting failures (non-zero exit code)
- `{{corrections}}` variable missing from execute-task.md
- `.gsd/patterns/` missing from gitignore.ts baseline
- `correction_capture` missing from preferences.ts
- `emitProgrammaticCorrections` or `emitStuckCorrection` missing from auto.ts
- TypeScript import errors in any of the new modules

## Requirements Proved By This UAT

- R002 (Diagnosis Taxonomy) — 82 test assertions prove all 14 categories are valid, validators work correctly, type guards enforce category membership. Contract-level proof: the taxonomy is correctly defined and enforceable.
- R003 (Correction Storage and Rotation) — 26 test assertions prove the write/read/rotate lifecycle works correctly with validation, truncation, rotation at threshold, archive collision handling, and retention cleanup. Contract-level proof: storage mechanics are correct.

## Not Proven By This UAT

- R001 (Correction Capture) at runtime level — corrections are captured from fixture data, not from actual auto-mode runs. The programmatic detection and self-report instructions are wired, but runtime proof requires a real auto-mode session that triggers retry/stuck/timeout patterns and produces entries in `.gsd/patterns/corrections.jsonl`. This will be verified in S02/S03 integration.
- Self-report reliability — whether executing agents actually follow the self-report instructions and produce valid JSONL entries. This is a known risk (listed in M001 roadmap) that can only be tested with real agent runs.
- Integration correctness of `transformSessionEntries()` — the bridge function in auto.ts is tested implicitly via the auto.ts syntax check, but not with real Pi session data.

## Notes for Tester

- All tests use temporary directories and clean up after themselves — no side effects on the project.
- The `corrections.jsonl` file does not exist yet in `.gsd/patterns/` — it will only be created when a real auto-mode run triggers correction capture.
- The self-report instructions tell the agent to use `bash` to append JSONL. Whether agents reliably do this is an open question deferred to runtime testing.
