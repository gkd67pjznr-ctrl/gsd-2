---
id: T03
parent: S01
milestone: M002
provides:
  - Integration test proving end-to-end embed → store → query flow
key_files:
  - src/resources/extensions/gsd/tests/embedding-integration.test.ts
key_decisions:
  - Used node:test + node:assert to match existing test conventions (not vitest)
patterns_established:
  - MockEmbeddingProvider with category-keyed orthogonal unit vectors for deterministic integration testing
  - makeEntry() helper for concise CorrectionEntry construction in tests
observability_surfaces:
  - none — test-only task
duration: 1 step
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T03: Integration test proving end-to-end embed → store → query flow

**Built 10-assertion integration test proving EmbeddingProvider → VectorIndex compose correctly: embed text, store corrections, query by similarity with correct ranking, plus edge cases.**

## What Happened

Created `embedding-integration.test.ts` with a deterministic `MockEmbeddingProvider` that maps category keywords to orthogonal unit vectors. Tests exercise the full contract: embed 5 corrections across different categories, store via `addCorrection()`, query via `querySimilar()` and assert correct ranking (score=1.0 for exact match). Edge cases cover empty index queries, duplicate entries, removeByCategory + re-query, and factory null paths.

## Verification

- `npx tsx --test src/resources/extensions/gsd/tests/embedding-integration.test.ts` — 10/10 passed
- `npx tsx --test src/resources/extensions/gsd/tests/*.test.ts` — 62/62 passed (embedding: 16, vector-index: 11, integration: 10, plus others)
- Slice verification: `npx tsx --test ...embedding*.test.ts ...vector-index.test.ts` — all pass
- 2 pre-existing failures in unrelated tests (initResources, npm pack) — not caused by this task

## Diagnostics

None — test-only task. Run the test file directly to verify the S01 contract.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/tests/embedding-integration.test.ts` — 10-test integration suite proving embed → store → query contract
