# S03: Learning Loop Closure — UAT

**Milestone:** M001
**Written:** 2026-03-11

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S03's plan explicitly states "Real runtime required: no — synthetic test data proves token budget and recall assembly; runtime proof deferred to actual auto-mode runs." All three modules are pure functions with deterministic I/O. The 165 test assertions with synthetic data prove the contracts exhaustively without requiring a running system.

## Preconditions

- Node.js 18+ with `npx tsx` available
- Project checked out at gsd2 root
- S01 and S02 modules in place (corrections.ts, pattern-preferences.ts, observer.ts)

## Smoke Test

Run `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` — all 22 assertions pass, confirming recall assembly works end-to-end with synthetic data.

## Test Cases

### 1. Recall Block Assembly

1. Run `npx tsx src/resources/extensions/gsd/tests/recall.test.ts`
2. **Expected:** 22 passed, 0 failed. Covers empty state, preferences-only, corrections-only, mixed slot allocation, token budget, dedup, kill switch, self-report preservation.

### 2. Correction and Preference Retirement

1. Run `npx tsx src/resources/extensions/gsd/tests/retire.test.ts`
2. **Expected:** 21 passed, 0 failed. Covers active file retirement, archive file retirement, preference retirement, suggestion status update, idempotency, malformed line preservation, missing file handling.

### 3. Cross-Project Preference Promotion

1. Run `npx tsx src/resources/extensions/gsd/tests/promote-preference.test.ts`
2. **Expected:** 29 passed, 0 failed. Covers first/second/third project tracking, promotion threshold, idempotency, confidence merging, GSD_HOME redirect, input validation.

### 4. Integration Wiring

1. Run `grep -q "buildRecallBlock" src/resources/extensions/gsd/auto.ts && echo PASS`
2. Run `grep -q "promoteToUserLevel" src/resources/extensions/gsd/pattern-preferences.ts && echo PASS`
3. **Expected:** Both print PASS, confirming modules are wired into the execution loop.

### 5. Regression — S02 Modules Still Pass

1. Run `npx tsx src/resources/extensions/gsd/tests/preference-engine.test.ts`
2. Run `npx tsx src/resources/extensions/gsd/tests/observer.test.ts`
3. **Expected:** 53 + 40 = 93 assertions pass with 0 failures.

## Edge Cases

### Token Budget with Dense Data

1. The recall test creates 20 entries each with ~50 words (~1000 words total, ~1333 estimated tokens)
2. **Expected:** buildRecallBlock() output stays under 3000 estimated tokens, with entries truncated if budget exceeded

### Kill Switch Disables Recall

1. Set `correction_capture: false` in preferences.md frontmatter
2. Call `buildRecallBlock()`
3. **Expected:** Returns empty string, no `<system-reminder>` block generated

### Malformed JSONL Preservation

1. Retirement processes a file containing malformed lines (not valid JSON)
2. **Expected:** Malformed lines are preserved unchanged in output; only valid entries matching the category are modified

## Failure Signals

- Any test assertion failure in the 3 test suites
- `buildRecallBlock` or `promoteToUserLevel` not found in auto.ts / pattern-preferences.ts grep checks
- S02 regression — preference-engine or observer tests failing after S03 changes
- Token budget test showing output exceeding 3000 estimated tokens

## Requirements Proved By This UAT

- R007 (Live Recall Injection) — 22 assertions prove recall assembly with token budget, slot allocation, deduplication, kill switch, and self-report preservation. Contract fully validated.
- R008 (Skill Refinement Workflow) — 21 assertions prove retirement of corrections (active + archive), preferences, and suggestion status updates. Retirement side of refinement fully validated. Collaborative review flow exists via S02 observer suggestions.
- R009 (Cross-Project Preference Promotion) — 29 assertions prove cross-project tracking, 3-project promotion threshold, upsert semantics, confidence merging, and GSD_HOME redirect. Contract fully validated.

## Not Proven By This UAT

- Runtime behavior with real correction data from actual auto-mode runs (deferred to integration testing or M001 final integration)
- User-level preference recall — promoteToUserLevel() writes to ~/.gsd/preferences.json but nothing reads it back into buildRecallBlock() yet
- Retirement triggered from user-facing commands — retireByCategory() exists but has no CLI surface
- R006 (Observer guardrails) — user confirmation and permission check guardrails remain partial (S02 noted this)

## Notes for Tester

All tests use temp directories and clean up after themselves. No real `.gsd/patterns/` or `~/.gsd/preferences.json` files are modified. The GSD_HOME env var redirect ensures test isolation for cross-project promotion tests.
