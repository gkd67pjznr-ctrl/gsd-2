---
id: T01
parent: S03
milestone: M001
provides:
  - Test suites defining acceptance criteria for recall, retire, and promote modules
  - 72 assertions across 3 test files covering all S03 must-haves
key_files:
  - src/resources/extensions/gsd/tests/recall.test.ts
  - src/resources/extensions/gsd/tests/retire.test.ts
  - src/resources/extensions/gsd/tests/promote-preference.test.ts
key_decisions: []
patterns_established:
  - Test-first approach continued from S01/S02 — test files import from modules that don't exist yet, fail on import (confirming structural validity), and become acceptance criteria when implementations land
observability_surfaces:
  - none — tests are verification artifacts
duration: 20m
verification_result: passed
completed_at: 2026-03-11
blocker_discovered: false
---

# T01: Created test suites for recall, retire, and promote modules

**Three test files with 72 assertions defining the acceptance contract for S03's three new modules**

## What Happened

Created three test suites following the established assert/assertEq + temp directory pattern from S01/S02:

1. **`recall.test.ts`** (22 assertions) — Tests `buildRecallBlock()` from `../recall.ts`. Covers: empty state returns self-report only, preferences-only recall shows `<system-reminder>` block, corrections-only recall, mixed slot allocation (preferences first, corrections fill remaining, max 10 entries), token budget enforcement (20 verbose entries stay under 3K tokens using `words/0.75` estimator), deduplication (corrections matching promoted preference category:scope excluded), kill switch (correction_capture: false returns empty string), self-report instructions preserved at end of non-empty recall block.

2. **`retire.test.ts`** (21 assertions) — Tests `retireByCategory()` from `../retire.ts`. Covers: retire corrections in active file (matching entries get retired_at/retired_by, non-matching unchanged), retire corrections in archive files (finds corrections-*.jsonl), retire preferences in preferences.jsonl, update suggestion status to 'refined' with refined_at, idempotent re-retirement (already-retired entries not double-stamped), malformed JSONL lines preserved unchanged, no-op on missing files (returns without error).

3. **`promote-preference.test.ts`** (29 assertions) — Tests `promoteToUserLevel()` from `../promote-preference.ts`. Covers: first project creates new entry with source_projects=[projectId], second project adds to source_projects, third project triggers promotion (sets promoted_at), re-promotion idempotent (promoted_at not overwritten by 4th project), confidence takes max of existing and incoming, GSD_HOME env var redirects file location for test isolation, missing required fields (category, scope, projectId) returns `{ promoted: false, reason: 'missing_fields' }`.

All three files fail on import with `ERR_MODULE_NOT_FOUND` — confirming they're structurally valid TypeScript that will become executable when T02/T03 create the modules.

## Verification

- All three test files exist at expected paths: ✅
- `npx tsx --eval "import('./src/resources/extensions/gsd/tests/recall.test.ts')"` — fails with `ERR_MODULE_NOT_FOUND: Cannot find module 'recall.ts'` (expected): ✅
- `npx tsx --eval "import('./src/resources/extensions/gsd/tests/retire.test.ts')"` — fails with `ERR_MODULE_NOT_FOUND: Cannot find module 'retire.ts'` (expected): ✅
- `npx tsx --eval "import('./src/resources/extensions/gsd/tests/promote-preference.test.ts')"` — fails with `ERR_MODULE_NOT_FOUND: Cannot find module 'promote-preference.ts'` (expected): ✅
- Assertion count: 22 + 21 + 29 = 72 total (target was 40+): ✅

### Slice-level verification checks (T01 — first task, partial expected):
- `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` — ❌ (expected: module not found until T02)
- `npx tsx src/resources/extensions/gsd/tests/retire.test.ts` — ❌ (expected: module not found until T03)
- `npx tsx src/resources/extensions/gsd/tests/promote-preference.test.ts` — ❌ (expected: module not found until T03)
- `grep -q "buildRecallBlock" src/resources/extensions/gsd/auto.ts` — ❌ (expected: T04 wires this)

## Diagnostics

Read the test files to understand the contract each module must satisfy. Each test section is labeled with `console.log` headers describing the scenario being tested.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/tests/recall.test.ts` — 22 assertions testing buildRecallBlock() contract
- `src/resources/extensions/gsd/tests/retire.test.ts` — 21 assertions testing retireByCategory() contract
- `src/resources/extensions/gsd/tests/promote-preference.test.ts` — 29 assertions testing promoteToUserLevel() contract
