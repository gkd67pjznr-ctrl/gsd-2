---
estimated_steps: 3
estimated_files: 3
---

# T03: End-to-end pipeline verification and full regression check

**Slice:** S03 — Cost Tracking & Index Lifecycle
**Milestone:** M002

## Description

Run the complete test suite to verify zero regressions across all M001 and M002 tests. Add any missing integration assertions that prove the full capture→embed→track→rotate pipeline works end-to-end.

## Steps

1. Run all existing test files (M001 550 assertions + M002 S01 37 + S02 60 + S03 new) and fix any failures
2. Add integration assertions to `embedding-cost.test.ts` proving cost flows end-to-end: mock provider returns cost → embedCorrection() accumulates → flushEmbeddingCosts() returns correct totals
3. Run `npx tsc --noEmit` to confirm no type errors across the full codebase

## Must-Haves

- [ ] All existing M001 test assertions pass
- [ ] All M002 S01 and S02 test assertions pass
- [ ] All new S03 test assertions pass
- [ ] No TypeScript type errors

## Verification

- `npx vitest run` or equivalent full suite — all pass
- `npx tsx src/resources/extensions/gsd/tests/embedding-cost.test.ts` — all pass
- `npx tsx src/resources/extensions/gsd/tests/vector-rotation.test.ts` — all pass
- `npx tsc --noEmit` — clean

## Observability Impact

- None — this task is verification only

## Inputs

- All test files from M001 and M002
- T01 and T02 outputs (embedding-cost.test.ts, vector-rotation.test.ts, modified source files)

## Expected Output

- All tests green, no regressions
- Any fixes applied to source or test files if regressions found
- Confidence that M002 milestone is complete
