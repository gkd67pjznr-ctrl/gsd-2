# S01: Embedding Abstraction & Vector Index

**Goal:** `embedText()` produces vectors via OpenAI or Ollama, `VectorIndex` wraps Vectra to store/query correction embeddings in `.gsd/patterns/vectors/`, and test assertions prove similarity search returns semantically relevant results ranked by cosine distance in <50ms.
**Demo:** Run `npm test -- --grep "embedding|vector-index"` — all assertions pass including similarity ranking and latency checks.

## Must-Haves

- `EmbeddingProvider` interface with `embed(text: string): Promise<number[]>` and factory `createEmbeddingProvider(config): EmbeddingProvider | null`
- OpenAI provider using `text-embedding-3-small` (1536 dims)
- Ollama provider hitting local HTTP endpoint
- Factory returns `null` when no embedding model configured (graceful degradation)
- `VectorIndex` class wrapping Vectra `LocalIndex` with `initialize()`, `addCorrection()`, `querySimilar()`, `removeByCategory()`, `getStats()`
- Vector storage at `.gsd/patterns/vectors/`
- Post-query metadata filtering (Vectra's built-in filter is unreliable)
- All operations return structured results, never throw (D013)
- `EmbedResult: { vector: number[] | null, error?: string }`
- `ScoredCorrection` type for query results with score
- Test assertions proving: correct similarity ranking, <50ms query time, metadata round-trip, removeByCategory, graceful handling of missing/corrupt index
- No changes to existing modules (recall.ts, auto.ts, corrections.ts)
- 550 existing M001 test assertions still pass

## Proof Level

- This slice proves: contract (embedding abstraction + vector index operations with fixture vectors)
- Real runtime required: no (fixture vectors, mock providers, no real API calls)
- Human/UAT required: no

## Verification

- `npm test -- --grep "embedding"` — all embedding provider tests pass
- `npm test -- --grep "vector-index"` — all vector index tests pass including similarity ranking and <50ms latency
- `npm test` — all 550+ existing assertions still pass

## Observability / Diagnostics

- Runtime signals: `EmbedResult` structured return with `error` field; `VectorIndex.getStats()` returns item count and index state
- Inspection surfaces: `.gsd/patterns/vectors/` directory contains Vectra JSON files inspectable with any text editor
- Failure visibility: all operations return structured results with error reasons — never throw
- Redaction constraints: API keys never logged; only model name and dimension count appear in diagnostics

## Integration Closure

- Upstream surfaces consumed: `CorrectionEntry` from `correction-types.ts`, `readCorrections()` from `corrections.ts` (for backfill scenarios in S02)
- New wiring introduced in this slice: none — S01 creates standalone modules with no integration into auto.ts or recall.ts
- What remains before the milestone is truly usable end-to-end: S02 wires embedding into `writeCorrection()` and `buildRecallBlock()`, S03 adds cost tracking and index lifecycle

## Tasks

- [x] **T01: Create EmbeddingProvider interface and implementations** `est:1h`
  - Why: The embedding abstraction is the foundation — providers produce vectors that feed into the vector index
  - Files: `src/resources/extensions/gsd/embedding.ts`, `src/resources/extensions/gsd/tests/embedding.test.ts`
  - Do: Define `EmbeddingProvider` interface with `embed(text)`, `EmbedResult` type, `EmbeddingConfig` type. Implement `OpenAIEmbeddingProvider` (uses openai SDK `embeddings.create`), `OllamaEmbeddingProvider` (HTTP POST to `/api/embeddings`), and `createEmbeddingProvider(config)` factory returning null when unconfigured. All non-throwing per D013. Tests use mock/stub providers — no real API calls.
  - Verify: `npm test -- --grep "embedding"` passes all assertions
  - Done when: `createEmbeddingProvider()` returns correct provider type or null, `embed()` returns `EmbedResult` with vector or error, tests cover OpenAI/Ollama/null factory paths and error handling

- [x] **T02: Create VectorIndex wrapping Vectra LocalIndex** `est:1.5h`
  - Why: The vector index is the core data structure — stores correction embeddings and retrieves similar ones by cosine distance
  - Files: `src/resources/extensions/gsd/vector-index.ts`, `src/resources/extensions/gsd/tests/vector-index.test.ts`
  - Do: Install vectra. Implement `VectorIndex` class with `initialize()` (creates index if needed), `addCorrection(entry, vector)` (stores correction metadata + vector), `querySimilar(vector, limit)` returning `ScoredCorrection[]` sorted by similarity, `removeByCategory(category)`, `getStats()`. Use post-query JS filtering since Vectra's metadata filter is unreliable. Store only essential metadata fields (correction_to, diagnosis_category, scope, timestamp, correction_from). Tests use fixture vectors (orthogonal unit vectors) to prove ranking without API calls. Include <50ms latency assertion.
  - Verify: `npm test -- --grep "vector-index"` passes all assertions including similarity ranking and latency
  - Done when: VectorIndex creates/reads Vectra index at configurable path, inserts corrections, returns ranked results by cosine similarity, removes by category, handles missing/corrupt index gracefully, all under 50ms query time

- [x] **T03: Integration test proving end-to-end embed → store → query flow** `est:45m`
  - Why: Proves the two modules work together as the S01→S02 boundary contract — a mock provider embeds text, vectors go into the index, similar queries return correct ranked results
  - Files: `src/resources/extensions/gsd/tests/embedding-integration.test.ts`
  - Do: Write integration test that creates a mock `EmbeddingProvider` returning deterministic vectors, feeds `CorrectionEntry` objects through `addCorrection()`, then queries with a similar vector and asserts correct ranking. Test edge cases: empty index query, duplicate entries, removeByCategory then re-query. Verify the full contract that S02 will consume.
  - Verify: `npm test -- --grep "embedding-integration"` passes; `npm test` passes all 550+ existing assertions
  - Done when: Integration test proves embed→store→query pipeline works end-to-end with mock provider, edge cases handled, all existing tests still pass

## Files Likely Touched

- `src/resources/extensions/gsd/embedding.ts`
- `src/resources/extensions/gsd/vector-index.ts`
- `src/resources/extensions/gsd/tests/embedding.test.ts`
- `src/resources/extensions/gsd/tests/vector-index.test.ts`
- `src/resources/extensions/gsd/tests/embedding-integration.test.ts`
- `package.json` (vectra dependency)
