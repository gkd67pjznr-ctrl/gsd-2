---
estimated_steps: 5
estimated_files: 3
---

# T01: Create test suites for recall, retire, and promote modules

**Slice:** S03 — Learning Loop Closure
**Milestone:** M001

## Description

Write three test suites that define the objective stopping conditions for T02, T03, and T04. Tests follow the established assert/assertEq + temp directory pattern from S01/S02. Each test suite imports from a module that doesn't exist yet — tests will fail on import, confirming structural validity. When T02/T03 implement the modules, these tests become the acceptance criteria.

## Steps

1. Create `recall.test.ts` — import `buildRecallBlock` from `../recall.ts`. Write fixtures for synthetic corrections and preferences. Test cases: (a) empty state returns self-report instructions only, (b) preferences-only recall shows preferences in `<system-reminder>` block, (c) corrections-only recall shows corrections, (d) mixed slot allocation — preferences first then corrections fill remaining up to 10, (e) token budget enforcement — create 20 verbose entries, verify output stays under 3000 tokens using the same `words / 0.75` estimator, (f) dedup — corrections matching a promoted preference's category:scope are excluded, (g) kill switch — when correction_capture is false in preferences.md, returns empty string, (h) self-report instructions appear at the end of every non-empty recall block.
2. Create `retire.test.ts` — import `retireByCategory` from `../retire.ts`. Test cases: (a) retire corrections in active file — matching entries get `retired_at`/`retired_by`, non-matching entries unchanged, (b) retire corrections in archive files — finds and processes `corrections-*.jsonl`, (c) retire preferences — matching entries in preferences.jsonl get retired, (d) update suggestion status — matching suggestion in suggestions.json becomes `status: 'refined'` with `refined_at`, (e) idempotent re-retirement — already-retired entries not double-stamped, (f) malformed lines preserved unchanged, (g) no-op on missing files — returns without error.
3. Create `promote-preference.test.ts` — import `promoteToUserLevel` from `../promote-preference.ts`. Test cases: (a) first project creates new entry with source_projects=[projectId], (b) second project adds to source_projects, (c) third project triggers promotion (sets promoted_at), (d) re-promotion is idempotent — promoted_at not overwritten, (e) confidence takes max of existing and incoming, (f) GSD_HOME env var redirects file location for test isolation, (g) missing required fields returns `{ promoted: false, reason: 'missing_fields' }`.
4. Verify all three files parse without syntax errors (import will fail on non-existent modules, which is expected).
5. Count total assertions across all three files — target 40+.

## Must-Haves

- [ ] `recall.test.ts` exists with assertions for: empty state, preferences-only, corrections-only, mixed slot allocation, token budget (20 entries under 3K), dedup, kill switch, self-report preservation
- [ ] `retire.test.ts` exists with assertions for: active file retirement, archive file retirement, preference retirement, suggestion status update, idempotency, malformed line preservation, missing file handling
- [ ] `promote-preference.test.ts` exists with assertions for: first/second/third project progression, idempotent re-promotion, confidence merging, GSD_HOME redirect, missing fields error
- [ ] All test files follow established assert/assertEq + temp directory pattern
- [ ] Total assertion count across all three files is 40+

## Verification

- All three test files exist at the expected paths
- `npx tsx --eval "import('./src/resources/extensions/gsd/tests/recall.test.ts')" 2>&1 | grep -q "recall"` — confirms test file references the module (will fail on import, expected)
- Count assertions: `grep -c "assert\|assertEq" src/resources/extensions/gsd/tests/recall.test.ts src/resources/extensions/gsd/tests/retire.test.ts src/resources/extensions/gsd/tests/promote-preference.test.ts`

## Observability Impact

- Signals added/changed: None — tests are verification artifacts
- How a future agent inspects this: Read test files to understand the contract each module must satisfy
- Failure state exposed: Test output shows PASS/FAIL per assertion with descriptive messages

## Inputs

- `src/resources/extensions/gsd/tests/preference-engine.test.ts` — pattern for assert/assertEq helpers, temp directory setup, fixture creation
- `src/resources/extensions/gsd/tests/corrections-io.test.ts` — pattern for JSONL file creation in temp dirs
- S02 Summary forward intelligence — `readPreferences({ status: 'active' })` returns `PreferenceEntry[]`; PreferenceEntry has `retired_at` and `retired_by` fields; SuggestionsDocument structure
- S03 Research — gsdup reference implementations for recall (slot-based, 10 max), retire (atomic JSONL rewrite), promote (source_projects tracking)

## Expected Output

- `src/resources/extensions/gsd/tests/recall.test.ts` — 15+ assertions covering recall assembly contract
- `src/resources/extensions/gsd/tests/retire.test.ts` — 15+ assertions covering retirement contract
- `src/resources/extensions/gsd/tests/promote-preference.test.ts` — 10+ assertions covering cross-project promotion contract
