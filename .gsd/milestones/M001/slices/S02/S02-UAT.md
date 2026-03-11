# S02: Preference Engine — UAT

**Milestone:** M001
**Written:** 2026-03-11

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S02 implements data layer modules (preference promotion, observer engine) with no user-facing UI. All contracts are verifiable via test suites operating on fixture data in temp directories. The plan explicitly states "Real runtime required: no" and "Human/UAT required: no."

## Preconditions

- Node.js with `--experimental-strip-types` support available
- S01 modules present: `corrections.ts`, `correction-types.ts`, `correction-detector.ts`
- Working directory is the gsd2 project root

## Smoke Test

Run both test suites and verify zero failures:
```bash
node --experimental-strip-types src/resources/extensions/gsd/tests/preference-engine.test.ts
node --experimental-strip-types src/resources/extensions/gsd/tests/observer.test.ts
```
Expected: 53 passed + 40 passed = 93 total, 0 failed.

## Test Cases

### 1. Preference promotion at threshold

1. Write 3 corrections with the same category+scope to a temp corrections.jsonl
2. Call `checkAndPromote({ category, scope }, { cwd: tmpDir })`
3. **Expected:** Returns `{ promoted: true, count: 3, confidence: 0.6 }`. preferences.jsonl contains one entry with matching category, scope, source_count: 3.

### 2. Preference promotion below threshold

1. Write 2 corrections with the same category+scope
2. Call `checkAndPromote({ category, scope }, { cwd: tmpDir })`
3. **Expected:** Returns `{ promoted: false, reason: 'below_threshold', count: 2 }`

### 3. Preference upsert preserves timestamps

1. Write a preference with `created_at: T1`
2. Write another preference with same category+scope
3. **Expected:** preferences.jsonl has one entry with `created_at: T1` preserved and `updated_at` updated

### 4. Read preferences with scope filter

1. Write preferences with scope 'file', 'project', 'global'
2. Call `readPreferences({ scope: 'project' })`
3. **Expected:** Returns only the project-scoped preference

### 5. Read preferences with status filter

1. Write active and retired preferences
2. Call `readPreferences({ status: 'active' })`
3. **Expected:** Returns only entries where `retired_at` is null

### 6. Observer generates suggestions at threshold

1. Write 3+ corrections with same category across different scopes
2. Call `analyzePatterns({ cwd: tmpDir })`
3. **Expected:** suggestions.json contains a pending suggestion with correct category, scopes array, target_skill from CATEGORY_SKILL_MAP

### 7. Observer enforces watermark dedup

1. Write corrections, run analyzePatterns (generates suggestions)
2. Run analyzePatterns again without new corrections
3. **Expected:** No new suggestions generated (watermark filters old corrections)

### 8. Observer enforces cooldown guardrail

1. Generate a suggestion for a category
2. Mark it as refined (status: 'refined', refined_at within 7 days)
3. Write 3 more corrections for the same category, run analyzePatterns
4. **Expected:** No new suggestion; skipped_suggestions contains entry with reason 'cooldown_active'

### 9. Observer auto-dismisses expired suggestions

1. Create a suggestion with `created_at` > 30 days ago, status 'pending'
2. Run analyzePatterns
3. **Expected:** Suggestion status changed to 'dismissed', dismiss_reason: 'auto_expired'

### 10. Integration wiring in auto.ts

1. `grep -q "checkAndPromote" src/resources/extensions/gsd/auto.ts`
2. `grep -q "analyzePatterns" src/resources/extensions/gsd/auto.ts`
3. **Expected:** Both commands exit 0

## Edge Cases

### Invalid category input

1. Call `checkAndPromote({ category: 'invalid.category', scope: 'project' })`
2. **Expected:** Returns `{ promoted: false, reason: 'invalid_entry' }` — no throw

### Empty corrections file

1. Call `analyzePatterns` with no corrections.jsonl
2. **Expected:** Returns `{ analyzed: true, suggestions_written: 0 }` — no crash

### Missing preferences.jsonl

1. Call `readPreferences({})` with no preferences.jsonl on disk
2. **Expected:** Returns `[]` — safe empty default

## Failure Signals

- Test suite reports any failures (non-zero count)
- `checkAndPromote` or `analyzePatterns` throws instead of returning structured result
- preferences.jsonl contains malformed JSON lines
- suggestions.json missing metadata.last_analyzed_at watermark
- auto.ts grep for wiring returns non-zero exit code
- .tmp files left behind after writes (atomic rename failed)

## Requirements Proved By This UAT

- R004 (Preference Promotion) — 53 test assertions prove promotion at/below threshold, confidence formula, upsert semantics, atomic writes, structured failure reporting
- R005 (Preference Scope Hierarchy) — test assertions prove scope tagging and query-time scope filtering across file, project, global scopes
- R006 (Observer Engine with Bounded Guardrails) — 40 test assertions prove 4 of 6 guardrails (min corrections, cooldown, auto-dismiss, no-duplicate-pending), cross-scope grouping, three-layer dedup, and suggestion lifecycle

## Not Proven By This UAT

- R006 guardrails not yet testable at contract level: user confirmation (requires interactive runtime in S03 refinement workflow), permission checks (requires skill file write in S03), co-activation (requires agent composition data — no current consumer)
- Runtime integration: checkAndPromote and analyzePatterns are wired into auto.ts but not exercised in a live auto-mode run — live proof deferred to S03/S05 integration verification
- Performance under volume: tests use small fixture data; behavior with hundreds/thousands of corrections is untested

## Notes for Tester

- Both test suites are fully self-contained — they create temp directories, write fixture data, run assertions, and clean up. No external state needed.
- The observer's CATEGORY_SKILL_MAP maps only 3 categories to existing skills. This is intentional — unmapped categories produce `type: 'new_skill_needed'` suggestions.
- auto.ts standalone import fails on pre-existing state.js resolution. This is a known pre-existing issue — auto.ts runs within the full built project, not standalone.
