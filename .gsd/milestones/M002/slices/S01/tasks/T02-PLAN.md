---
estimated_steps: 5
estimated_files: 3
---

# T02: Create VectorIndex wrapping Vectra LocalIndex

**Slice:** S01 — Embedding Abstraction & Vector Index
**Milestone:** M002

## Description

Implement `VectorIndex` class wrapping Vectra's `LocalIndex` for storing and querying correction embeddings. Install vectra as a dependency. Uses post-query JS filtering since Vectra's metadata filter is unreliable. Tests use deterministic fixture vectors to prove similarity ranking and <50ms query latency.

## Steps

1. Install vectra: `npm install vectra`
2. Define types: `ScoredCorrection` (CorrectionEntry fields + score), `VectorIndexStats` (itemCount, initialized)
3. Implement `VectorIndex` class: constructor takes index path, `initialize()` creates Vectra LocalIndex if not exists, `addCorrection(entry, vector)` inserts with metadata subset (correction_to, diagnosis_category, scope, timestamp, correction_from), `querySimilar(vector, limit)` queries then post-filters and maps to `ScoredCorrection[]`, `removeByCategory(category)` uses `listItemsByMetadata` + delete, `getStats()` returns index stats
4. All methods non-throwing — return structured results or empty arrays on error (D013)
5. Write tests with fixture vectors: orthogonal unit vectors ([1,0,0...], [0,1,0...]) to prove cosine ranking is correct, add multiple corrections and verify ranked retrieval, removeByCategory removes correct items, missing index initializes cleanly, <50ms latency assertion on querySimilar

## Must-Haves

- [ ] Vectra installed as dependency
- [ ] `VectorIndex` class with `initialize()`, `addCorrection()`, `querySimilar()`, `removeByCategory()`, `getStats()`
- [ ] `ScoredCorrection` type with score field
- [ ] Post-query JS filtering (not Vectra's broken metadata filter)
- [ ] Only essential metadata stored (not full CorrectionEntry)
- [ ] Non-throwing contract (D013)
- [ ] Tests prove similarity ranking with fixture vectors
- [ ] Tests prove <50ms query latency
- [ ] Tests prove removeByCategory and missing/corrupt index handling

## Verification

- `npm test -- --grep "vector-index"` passes all assertions
- Latency assertion: querySimilar completes in <50ms
- No existing tests broken

## Observability Impact

- Signals added/changed: `getStats()` returns item count and initialized state for index health checks
- How a future agent inspects this: call `getStats()` or inspect `.gsd/patterns/vectors/` directory contents
- Failure state exposed: methods return empty arrays or default stats on error, never throw

## Inputs

- `src/resources/extensions/gsd/correction-types.ts` — `CorrectionEntry` type
- D013 (non-throwing), D037 (Vectra choice), research findings on Vectra metadata filter bug

## Expected Output

- `src/resources/extensions/gsd/vector-index.ts` — complete VectorIndex module
- `src/resources/extensions/gsd/tests/vector-index.test.ts` — test suite with fixture vectors
- `package.json` — vectra added to dependencies
