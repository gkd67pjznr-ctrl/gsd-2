---
estimated_steps: 4
estimated_files: 3
---

# T03: Wire async buildCorrectionsVar in auto.ts and verify full integration

**Slice:** S02 — Semantic Recall in Dispatch
**Milestone:** M002

## Description

Make `buildCorrectionsVar()` async in auto.ts so dispatch prompts use semantic recall when available. Add integration test proving the full write→embed→recall pipeline. Run full test suite to confirm zero regressions.

## Steps

1. Make `buildCorrectionsVar()` async — change to `async function buildCorrectionsVar(): Promise<string>`, call `await buildRecallBlock()` with the singleton provider and vectorIndex from T02
2. Update call site at line ~1598 (`corrections: buildCorrectionsVar()`) to `corrections: await buildCorrectionsVar()`
3. Add integration assertions to `semantic-recall.test.ts`: create a mock provider + real VectorIndex (temp dir), write a correction, embed it, then call `buildRecallBlock()` with provider+index and verify the correction appears in output ranked by similarity. Also test that without provider, output matches category-based logic exactly.
4. Run full test suite: `npx vitest run` — all M001 (550+), S01 (37), and new S02 tests pass. Fix any regressions from the async change.

## Must-Haves

- [ ] `buildCorrectionsVar()` is async, passes provider/vectorIndex to `buildRecallBlock()`
- [ ] Call site at line ~1598 awaits the result
- [ ] Integration test proves write→embed→recall pipeline end-to-end
- [ ] All existing tests pass (550+ M001, 37 S01, 22 recall)
- [ ] No type errors across the codebase

## Verification

- `npx vitest run` — full suite passes with zero failures
- `npx tsc --noEmit` — no type errors

## Observability Impact

- Signals added/changed: None beyond T01/T02 — this task wires existing pieces together
- How a future agent inspects this: inspect `{{corrections}}` in a real dispatch prompt; `VectorIndex.getStats()` confirms embeddings stored
- Failure state exposed: None new — relies on T01 fallback (embed failure → category logic) and T02 fire-and-forget

## Inputs

- T01 output — `buildRecallBlock()` is async with vector + fallback paths
- T02 output — singleton provider/index in auto.ts, `embedCorrection()` helper
- `src/resources/extensions/gsd/auto.ts` — `buildCorrectionsVar()` and call site

## Expected Output

- `src/resources/extensions/gsd/auto.ts` — `buildCorrectionsVar()` is async, wired with provider/index
- `src/resources/extensions/gsd/tests/semantic-recall.test.ts` — additional integration assertions (~5) proving full pipeline
- Full test suite green
