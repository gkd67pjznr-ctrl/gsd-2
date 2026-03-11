---
id: T03
parent: S03
milestone: M001
provides:
  - retireByCategory() function for non-destructive retirement of corrections and preferences
  - promoteToUserLevel() function for cross-project preference promotion with 3-project threshold
  - readUserPreferences() for inspecting user-level preferences state
key_files:
  - src/resources/extensions/gsd/retire.ts
  - src/resources/extensions/gsd/promote-preference.ts
key_decisions:
  - Extracted retireJsonlFile() helper to DRY the JSONL retirement logic across corrections and preferences files
patterns_established:
  - GSD_HOME env var for redirecting user-level preferences location (testability pattern)
  - Atomic tmp+rename writes for both JSONL mutation and JSON document updates
observability_surfaces:
  - retired_at/retired_by fields on JSONL entries in corrections and preferences files
  - promoted_at and source_projects fields in ~/.gsd/preferences.json
  - promoteToUserLevel() returns structured { promoted, projectCount, reason } result
duration: ~12m
verification_result: passed
completed_at: 2026-03-11
blocker_discovered: false
---

# T03: Implement retire.ts and promote-preference.ts

**Created retirement and cross-project promotion modules — 50 test assertions pass across both suites**

## What Happened

Built two modules following the reference CJS implementations and the test contracts from T01:

**retire.ts** — `retireByCategory(category, suggestionId, options?)` processes three file types:
1. Corrections JSONL (active + all `corrections-*.jsonl` archives): marks entries where `diagnosis_category` matches with `retired_at`/`retired_by`
2. Preferences JSONL: marks entries where `category` matches with `retired_at`/`retired_by`
3. Suggestions JSON: updates matching suggestion status to `refined` with `refined_at`

Extracted a shared `retireJsonlFile()` helper that handles the common JSONL mutation pattern (parse lines, match field, skip already-retired, preserve malformed lines, atomic write). This avoids the duplication present in the reference CJS implementation.

**promote-preference.ts** — `promoteToUserLevel(preference, options?)` implements cross-project tracking:
- Finds or creates entry by category+scope in `~/.gsd/preferences.json`
- Tracks `source_projects` array (deduped)
- Takes max confidence across contributions
- Sets `promoted_at` exactly once when 3+ projects contribute
- Uses `GSD_HOME` env var for test isolation
- Input validation returns `{ promoted: false, reason: 'missing_fields' }` for missing required fields

Both modules follow the non-throwing contract — entire function bodies wrapped in try/catch.

## Verification

- `npx tsx src/resources/extensions/gsd/tests/retire.test.ts` — 21 passed, 0 failed ✓
- `npx tsx src/resources/extensions/gsd/tests/promote-preference.test.ts` — 29 passed, 0 failed ✓

Slice-level verification status:
- ✅ recall.test.ts — 22 passed (from T02)
- ✅ retire.test.ts — 21 passed
- ✅ promote-preference.test.ts — 29 passed
- ❌ `grep -q "buildRecallBlock" auto.ts` — expected, wiring is T04 scope
- ✅ Token budget assertion passes (from T02)

## Diagnostics

- **Retirement state**: grep for `retired_at` in `.gsd/patterns/corrections.jsonl` or `preferences.jsonl` to see which entries have been retired
- **Promotion state**: read `~/.gsd/preferences.json` (or `$GSD_HOME/preferences.json`) — `source_projects` array shows contributing projects, `promoted_at` shows when promoted
- **Failure inspection**: `retireByCategory()` silently no-ops on error; `promoteToUserLevel()` returns `{ promoted: false, reason: 'error' }` on failure

## Deviations

None. Implementation matches the task plan exactly.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/retire.ts` — retirement module with `retireByCategory()` export and internal `retireJsonlFile()`/`updateSuggestionStatus()` helpers
- `src/resources/extensions/gsd/promote-preference.ts` — cross-project promotion module with `promoteToUserLevel()` and `readUserPreferences()` exports
