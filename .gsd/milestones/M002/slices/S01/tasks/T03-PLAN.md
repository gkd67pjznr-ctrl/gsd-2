---
estimated_steps: 4
estimated_files: 1
---

# T03: Integration test proving end-to-end embed → store → query flow

**Slice:** S01 — Embedding Abstraction & Vector Index
**Milestone:** M002

## Description

Write an integration test that exercises the full S01→S02 boundary contract: a mock EmbeddingProvider produces vectors, those vectors are stored via VectorIndex.addCorrection(), and querySimilar() returns correctly ranked results. This proves the two modules compose correctly and validates the contract S02 will consume.

## Steps

1. Create test file with mock `EmbeddingProvider` that returns deterministic vectors based on input text (e.g., hash-based mapping to known vector directions)
2. Build test scenario: create 5+ `CorrectionEntry` objects with different categories, embed each via mock provider, store in `VectorIndex`, query with a vector similar to one category and assert correct ranking
3. Test edge cases: query empty index returns empty array, duplicate entries handled, removeByCategory then re-query confirms removal, createEmbeddingProvider(null/undefined) returns null
4. Run full test suite to confirm all 550+ existing assertions plus new integration assertions pass

## Must-Haves

- [ ] Mock EmbeddingProvider producing deterministic vectors
- [ ] End-to-end flow: embed → addCorrection → querySimilar with correct ranking
- [ ] Edge cases: empty index, duplicates, remove then query
- [ ] Factory null path exercised
- [ ] All 550+ existing M001 tests still pass

## Verification

- `npm test -- --grep "embedding-integration"` passes all assertions
- `npm test` passes — all existing 550+ assertions still green

## Observability Impact

- Signals added/changed: None — test-only task
- How a future agent inspects this: run the test file directly to verify the S01 contract
- Failure state exposed: None

## Inputs

- `src/resources/extensions/gsd/embedding.ts` — EmbeddingProvider, createEmbeddingProvider, EmbedResult
- `src/resources/extensions/gsd/vector-index.ts` — VectorIndex, ScoredCorrection
- `src/resources/extensions/gsd/correction-types.ts` — CorrectionEntry

## Expected Output

- `src/resources/extensions/gsd/tests/embedding-integration.test.ts` — integration test proving the full embed→store→query contract
