---
estimated_steps: 5
estimated_files: 3
---

# T02: Implement correction JSONL I/O with write, read, and rotate

**Slice:** S01 — Correction Capture Foundation
**Milestone:** M001

## Description

Build the persistence layer for corrections: validated JSONL append, filtered read across active + archive files, and rotation with dated archives and retention cleanup. Update gitignore baseline to include `.gsd/patterns/`. All I/O is non-fatal — errors are caught and returned as structured results, never thrown.

## Steps

1. Create `corrections.ts` with:
   - `writeCorrection(entry: unknown, options?: { basePath?: string }): WriteResult` — validates via `isValidEntry()`, truncates `correction_from`/`correction_to` to 200 chars, strips invalid `quality_level`, creates `.gsd/patterns/` directory, checks line count for rotation, appends JSON line with `appendFileSync`. Returns `{ written: true }` or `{ written: false, reason: 'invalid_entry' | 'capture_disabled' | 'error' }`. Check `correction_capture` preference via `loadEffectiveGSDPreferences()` for kill switch. Entire function wrapped in try/catch — never throws.
   - `readCorrections(filters?: { status?: 'active' | 'retired' }, options?: { basePath?: string }): CorrectionEntry[]` — reads `corrections.jsonl` + `corrections-*.jsonl` archive files from `.gsd/patterns/`. Parses each line, filters by retired_at presence for status filter. Returns sorted by timestamp descending. Returns empty array on any error.
   - `rotateCorrections(options?: { basePath?: string, threshold?: number, retentionDays?: number }): void` — reads line count from active file, if ≥ threshold (default 1000) renames to `corrections-YYYY-MM-DD.jsonl` (with `-N` suffix for same-day collisions). Then cleans up archive files older than retentionDays (default 90). Silent on all errors.
   - Export `WriteResult` type: `{ written: boolean; reason?: string }`
2. Add `.gsd/patterns/` to `BASELINE_PATTERNS` array in `gitignore.ts`, in the GSD runtime section alongside other `.gsd/` entries
3. Update `tests/corrections-io.test.ts` to use temp directories (`mkdtempSync`) and exercise:
   - Write a valid entry → file created, content is valid JSON, entry round-trips through read
   - Write invalid entry → returns `{ written: false, reason: 'invalid_entry' }`
   - Field truncation → write entry with 300-char `correction_from`, read back shows 200 chars
   - Read with no file → returns empty array
   - Read with status filter → `'active'` excludes retired entries, `'retired'` includes only retired
   - Rotation at threshold → write entries exceeding threshold, verify archive file created and active file reset
   - Archive cleanup by retention → create old archive file, run rotation, verify old archive deleted
   - Kill switch → set up preferences with `correction_capture: false`, verify write returns `{ written: false, reason: 'capture_disabled' }`
4. Ensure all imports use `.js` extension (not `.ts`) per project convention for test files
5. Run the test suite and verify all assertions pass

## Must-Haves

- [ ] `writeCorrection()` validates, truncates, rotates, appends — never throws
- [ ] `readCorrections()` reads active + archives with status filter — returns empty on error
- [ ] `rotateCorrections()` creates dated archives with collision handling and retention cleanup
- [ ] `.gsd/patterns/` in gitignore `BASELINE_PATTERNS`
- [ ] All I/O tests pass

## Verification

- `node --experimental-strip-types src/resources/extensions/gsd/tests/corrections-io.test.ts` exits 0 with all assertions passing
- `grep -q '.gsd/patterns/' src/resources/extensions/gsd/gitignore.ts` exits 0

## Observability Impact

- Signals added/changed: `WriteResult` return type provides structured feedback on every write attempt — `reason` field tells callers exactly why a write failed
- How a future agent inspects this: call `readCorrections()` to query all stored corrections; read `corrections.jsonl` directly for raw inspection; check `WriteResult.reason` for write failures
- Failure state exposed: `reason: 'invalid_entry'` for validation failures, `reason: 'capture_disabled'` for kill switch, `reason: 'error'` for I/O failures

## Inputs

- `src/resources/extensions/gsd/correction-types.ts` — T01 output: `CorrectionEntry`, `isValidEntry()`, `VALID_CATEGORIES`, field constants
- gsdup `write-correction.cjs` — reference implementation for validation, truncation, rotation, archive cleanup patterns
- `src/resources/extensions/gsd/activity-log.ts` — JSONL append pattern with `appendFileSync`, error silencing
- `src/resources/extensions/gsd/preferences.ts` — `loadEffectiveGSDPreferences()` for kill switch check, `GSDPreferences` interface

## Expected Output

- `src/resources/extensions/gsd/corrections.ts` — working JSONL I/O module with write/read/rotate
- `src/resources/extensions/gsd/tests/corrections-io.test.ts` — all assertions passing
- `src/resources/extensions/gsd/gitignore.ts` — `.gsd/patterns/` added to `BASELINE_PATTERNS`
