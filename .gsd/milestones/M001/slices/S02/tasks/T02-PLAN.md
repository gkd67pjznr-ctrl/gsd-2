---
estimated_steps: 4
estimated_files: 2
---

# T02: Build preference promotion module (pattern-preferences.ts)

**Slice:** S02 — Preference Engine
**Milestone:** M001

## Description

Implement the preference I/O layer and promotion logic that transforms repeated corrections into durable preferences. This is the core of R004 (Preference Promotion) and R005 (Preference Scope Hierarchy). The module provides `checkAndPromote()`, `writePreference()`, and `readPreferences()` — all non-throwing, all accepting cwd for test isolation. Makes the preference-engine test suite pass.

## Steps

1. Create `pattern-preferences.ts` with these exports:
   - `writePreference(preference, options?)` — upsert by category+scope using tmp+rename. Read existing preferences.jsonl, find match by category+scope, merge (preserving created_at/retired_at from existing), write to .tmp, rename. New entries get created_at, updated_at, retired_at:null. Returns `WritePreferenceResult`.
   - `readPreferences(filters?, options?)` — read `.gsd/patterns/preferences.jsonl`, parse lines, apply scope and status filters ('active' excludes retired_at, 'retired' includes only retired_at). Returns `PreferenceEntry[]`. Returns `[]` on any error.
   - `checkAndPromote(entry, options?)` — validate entry has diagnosis_category and scope, count matching corrections using `readCorrections()` from corrections.ts, check threshold (≥3), compute confidence = count/(count+2), build preference object, upsert via `writePreference()`. Returns `PromoteResult` with reason codes for all failure paths.
   - Internal `countMatchingCorrections(cwd, category, scope)` — reads all corrections (active+archive) via `readCorrections()`, counts entries matching both category and scope, tracks latest timestamp and correction_to text.

2. Ensure non-throwing I/O (D013): wrap all public functions in try/catch, return structured results on failure. Use `reason: 'error'` for unexpected failures. Use `reason: 'invalid_entry'` when entry lacks required fields. Use `reason: 'below_threshold'` when count < 3.

3. Implement kill switch: `checkAndPromote()` reads `correction_capture` from preferences.md directly (cwd-relative, matching D016 pattern from corrections.ts). If disabled, return `{ promoted: false, reason: 'capture_disabled' }`.

4. Run test suite and fix any assertion failures. Minor test adjustments are acceptable if the implementation reveals a cleaner API shape, but the core behavioral assertions must not change.

## Must-Haves

- [ ] `checkAndPromote()` returns `{ promoted: true, count, confidence }` when ≥3 corrections match category+scope
- [ ] `checkAndPromote()` returns `{ promoted: false, reason: 'below_threshold', count }` when <3 corrections match
- [ ] `checkAndPromote()` returns `{ promoted: false, reason: 'invalid_entry' }` for entries missing category or scope
- [ ] Confidence formula: count/(count+2) — 3→0.6, 5→~0.714
- [ ] `writePreference()` uses tmp+rename atomic writes
- [ ] `writePreference()` upserts: updates existing entry by category+scope, preserves created_at
- [ ] `readPreferences()` supports scope and status filtering
- [ ] `readPreferences()` returns `[]` on missing file or errors
- [ ] All functions accept optional cwd for test isolation
- [ ] All functions never throw (D013)

## Verification

- `node --experimental-strip-types src/resources/extensions/gsd/tests/preference-engine.test.ts` — all ≥30 assertions pass, 0 failures

## Observability Impact

- Signals added/changed: `PromoteResult` with reason codes on every promotion attempt; `WritePreferenceResult` on every write; preferences.jsonl as human-readable inspection surface
- How a future agent inspects this: Read `.gsd/patterns/preferences.jsonl` for raw preference state; call `readPreferences({ status: 'active' })` programmatically; check `PromoteResult.reason` for diagnostic cause
- Failure state exposed: `reason: 'invalid_entry'` (bad input), `reason: 'below_threshold'` + count (not enough corrections yet), `reason: 'capture_disabled'` (kill switch), `reason: 'error'` (unexpected I/O failure)

## Inputs

- `src/resources/extensions/gsd/preference-types.ts` — type definitions from T01
- `src/resources/extensions/gsd/corrections.ts` — `readCorrections()` for counting matching corrections
- `src/resources/extensions/gsd/correction-types.ts` — `CorrectionEntry`, `DiagnosisCategory`, `CorrectionScope`
- `src/resources/extensions/gsd/tests/preference-engine.test.ts` — test suite defining expected behavior (from T01)
- gsdup `write-preference.cjs` — reference design for `countMatchingCorrections()`, `upsertPreference()`, `checkAndPromote()`

## Expected Output

- `src/resources/extensions/gsd/pattern-preferences.ts` — complete preference promotion module with 3 public functions
- preference-engine.test.ts passes with all ≥30 assertions
