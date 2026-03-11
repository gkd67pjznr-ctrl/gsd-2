---
id: T02
parent: S01
milestone: M001
provides:
  - writeCorrection() — validated JSONL append with truncation, rotation, and kill switch
  - readCorrections() — filtered read across active + archive files with status filter
  - rotateCorrections() — dated archive creation with collision handling and retention cleanup
  - WriteResult type for structured write feedback
key_files:
  - src/resources/extensions/gsd/corrections.ts
  - src/resources/extensions/gsd/tests/corrections-io.test.ts
  - src/resources/extensions/gsd/gitignore.ts
key_decisions:
  - Read correction_capture kill switch directly from preferences.md frontmatter instead of using loadEffectiveGSDPreferences() — the preferences module caches PROJECT_PREFERENCES_PATH at import time using process.cwd(), so it can't be redirected per-call via a cwd option. Direct file read with cwd-relative path is both testable and correct.
patterns_established:
  - Non-throwing I/O pattern: all public functions wrapped in try/catch, returning structured results (WriteResult) or safe defaults ([]) instead of throwing
  - cwd-based path resolution: all functions accept optional cwd for testability, defaulting to process.cwd()
  - Archive rotation with collision handling: YYYY-MM-DD naming with -N suffix for same-day rotations
observability_surfaces:
  - WriteResult.reason provides exact failure cause: 'invalid_entry', 'capture_disabled', or 'error'
  - readCorrections() returns queryable correction state for any future module
  - corrections.jsonl is human-readable JSONL for raw inspection
duration: 1 context window
verification_result: passed
completed_at: 2026-03-11
blocker_discovered: false
---

# T02: Implement correction JSONL I/O with write, read, and rotate

**Built the complete JSONL persistence layer for corrections: validated append, filtered read across active + archive files, rotation with dated archives, retention cleanup, and kill switch support.**

## What Happened

Created `corrections.ts` with three public functions:

1. **writeCorrection()** — validates entry via `isValidEntry()`, checks the `correction_capture` kill switch from preferences, truncates `correction_from`/`correction_to` to 200 chars, strips invalid `quality_level`, creates `.gsd/patterns/` directory, checks line count for rotation, and appends JSON line. Returns `{ written: true }` or `{ written: false, reason }`. Never throws.

2. **readCorrections()** — reads `corrections.jsonl` + all `corrections-*.jsonl` archive files. Parses each line, applies optional status filter ('active' excludes retired entries, 'retired' includes only retired). Returns sorted by timestamp descending. Returns `[]` on any error.

3. **rotateCorrections()** — checks line count against threshold, renames active file to `corrections-YYYY-MM-DD.jsonl` (with `-N` suffix for same-day collisions), then cleans up archives older than retentionDays. Silent on all errors.

Added `.gsd/patterns/` to `BASELINE_PATTERNS` in `gitignore.ts`.

Updated the test file with kill switch and standalone rotation tests (26 total assertions).

## Verification

- `node --experimental-strip-types src/resources/extensions/gsd/tests/corrections-io.test.ts` — 26 passed, 0 failed ✓
- `grep -q '.gsd/patterns/' src/resources/extensions/gsd/gitignore.ts` — exits 0 ✓
- `node --experimental-strip-types src/resources/extensions/gsd/tests/correction-types.test.ts` — 82 passed (T01 still passing) ✓

### Slice-level verification status (intermediate task):
- ✅ correction-types.test.ts — passes
- ✅ corrections-io.test.ts — passes
- ❌ correction-detector.test.ts — import fails (correction-detector.ts not yet created, future task)
- ❌ `{{corrections}}` in dispatch prompt — not yet added (future task)
- ✅ `.gsd/patterns/` in gitignore — present

## Diagnostics

- Call `writeCorrection(entry, { cwd })` and inspect `WriteResult.reason` for failure cause
- Call `readCorrections({ status: 'active' }, { cwd })` to query all non-retired corrections
- Read `.gsd/patterns/corrections.jsonl` directly for raw JSONL inspection
- Check archive files: `ls .gsd/patterns/corrections-*.jsonl`
- Kill switch: set `correction_capture: false` in `.gsd/preferences.md` frontmatter to disable capture

## Deviations

- Used direct frontmatter parsing for the kill switch instead of `loadEffectiveGSDPreferences()` — the preferences module caches `PROJECT_PREFERENCES_PATH` at module load time using `process.cwd()`, making it impossible to redirect per-call via a cwd option. Direct file read is both testable and functionally equivalent.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/corrections.ts` — JSONL I/O module with write/read/rotate functions
- `src/resources/extensions/gsd/tests/corrections-io.test.ts` — updated with kill switch and rotation tests (26 assertions)
- `src/resources/extensions/gsd/gitignore.ts` — added `.gsd/patterns/` to BASELINE_PATTERNS
