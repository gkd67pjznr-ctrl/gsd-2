# S01: Embedding Abstraction & Vector Index — UAT

**Milestone:** M002
**Written:** 2026-03-12

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S01 produces standalone modules with no runtime integration — correctness is fully provable via unit and integration tests with deterministic fixture vectors

## Preconditions

- Node.js 20+ installed
- `npm install` completed (vectra dependency present)

## Smoke Test

Run `npx tsx --test src/resources/extensions/gsd/tests/embedding.test.ts src/resources/extensions/gsd/tests/vector-index.test.ts src/resources/extensions/gsd/tests/embedding-integration.test.ts` — all 37 assertions pass.

## Test Cases

### 1. EmbeddingProvider factory returns null when unconfigured

1. Call `createEmbeddingProvider(undefined)`
2. Call `createEmbeddingProvider({ provider: '', model: '' })`
3. **Expected:** Both return `null`

### 2. OpenAI provider returns vector on success

1. Create `OpenAIEmbeddingProvider` with mock fetch returning `{ data: [{ embedding: [0.1, 0.2] }] }`
2. Call `embed("test text")`
3. **Expected:** `EmbedResult` with `vector: [0.1, 0.2]`, no error

### 3. VectorIndex stores and retrieves by cosine similarity

1. Create VectorIndex, initialize
2. Add 3 corrections with orthogonal unit vectors (axis-0, axis-1, axis-2)
3. Query with axis-0 vector, limit 3
4. **Expected:** First result has score ~1.0 and matches axis-0 correction; orthogonal results have score ~0.0

### 4. VectorIndex querySimilar under 50ms

1. Add 50 corrections to index
2. Time `querySimilar()` call
3. **Expected:** Completes in <50ms

### 5. End-to-end embed → store → query

1. Create MockEmbeddingProvider mapping categories to orthogonal vectors
2. Embed 5 corrections, store via `addCorrection()`
3. Query with a category's vector
4. **Expected:** Top result matches that category with score 1.0

## Edge Cases

### Empty index query

1. Initialize fresh VectorIndex
2. Call `querySimilar()` on empty index
3. **Expected:** Returns empty array, no error

### Corrupt index directory

1. Write invalid data to index path
2. Call `querySimilar()`
3. **Expected:** Returns empty array, never throws

### removeByCategory then re-query

1. Add corrections in categories A and B
2. Remove category A
3. Query for category A vector
4. **Expected:** No category A results; category B results still present

## Failure Signals

- Any test assertion failure in the 37-test suite
- `querySimilar()` exceeding 50ms on 50 items
- Any method throwing instead of returning structured error/empty result
- `createEmbeddingProvider()` returning a provider when config is missing

## Requirements Proved By This UAT

- CR-2 (Embedding model abstraction) — EmbeddingProvider interface with two implementations and factory proven by 16 provider tests
- CR-3 (Graceful degradation) — factory returns null when unconfigured, VectorIndex handles missing/corrupt index without throwing, proven by factory null tests and corrupt index tests

## Not Proven By This UAT

- CR-1 (Semantic recall) — requires S02 integration with `buildRecallBlock()`
- CR-4 (Async embedding) — requires S02 wiring into `writeCorrection()`
- CR-5 (Vector index rotation) — requires S03 lifecycle management
- CR-6 (Embedding cost tracking) — requires S03 metrics integration
- Real API provider behavior — providers tested via mock fetch only (deliberate per D041)

## Notes for Tester

All tests use deterministic fixture vectors — no API keys or network access needed. The 2 pre-existing test failures (initResources, npm pack) are unrelated to S01.
