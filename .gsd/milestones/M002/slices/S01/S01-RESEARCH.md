# S01: Embedding Abstraction & Vector Index — Research

**Date:** 2026-03-12

## Summary

S01 delivers three components: an `EmbeddingProvider` abstraction (OpenAI + Ollama), a `VectorIndex` wrapper around Vectra's `LocalIndex`, and test assertions proving similarity search works with <50ms query time. The research confirms Vectra is viable — 1ms query times in local testing, simple JSON-file storage, pure JS with no native deps. Two gotchas emerged: (1) Vectra's metadata filtering in `queryItems()` appears non-functional, so post-query filtering is needed; (2) Vectra v0.12.3 pulls 11 deps (axios, cheerio, gpt-tokenizer) which is heavier than expected for a "simple" vector DB — acceptable but worth noting.

The critical design decision is keeping `buildRecallBlock()` synchronous. Vectra's `queryItems()` is async (returns Promise), so S01 must either make the recall path async or pre-load the index into memory. Recommendation: keep S01 focused on the abstraction + index layer only. The sync→async refactor of `buildRecallBlock()` belongs in S02 when it's wired into auto.ts.

## Recommendation

**Three modules, strict separation:**

1. **`embedding.ts`** — `EmbeddingProvider` interface with `embed(text: string): Promise<number[]>`, factory `createEmbeddingProvider(config): EmbeddingProvider | null`. OpenAI provider uses `text-embedding-3-small` (1536 dims). Ollama provider hits local HTTP endpoint. Factory returns null when no model configured (graceful degradation trigger).

2. **`vector-index.ts`** — `VectorIndex` class wrapping Vectra `LocalIndex`. Methods: `initialize()`, `addCorrection(entry: CorrectionEntry, vector: number[])`, `querySimilar(vector: number[], limit: number): ScoredCorrection[]`, `removeByCategory(category: string)`, `getStats()`. Storage at `.gsd/patterns/vectors/`. Post-query metadata filtering (Vectra's built-in filter doesn't work reliably).

3. **Tests** — Unit tests with fixture vectors (no real API calls). Prove: correct similarity ranking, <50ms query time, metadata round-trip, removeByCategory works, graceful handling of missing/corrupt index.

**Do not touch** `recall.ts`, `auto.ts`, or `corrections.ts` in S01. Those are S02 concerns.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| In-process vector search | **Vectra** `LocalIndex` (npm `vectra`) | File-backed JSON, pure JS, 1ms query times proven locally, Pinecone-like API |
| OpenAI embeddings | **OpenAI SDK** (npm `openai`) | Standard client, gsd-pi likely already has it as a transitive dep |
| Cosine similarity | **Vectra internal** | Built into `queryItems()` — no need to implement |
| Embedding dimension reduction | **OpenAI API `dimensions` param** | `text-embedding-3-small` supports arbitrary dim reduction at API level |

## Existing Code and Patterns

- `src/resources/extensions/gsd/correction-types.ts` — `CorrectionEntry` interface with all fields. `VectorIndex.addCorrection()` stores the entry as Vectra metadata, embedding as vector. Key fields for recall: `correction_to`, `diagnosis_category`, `scope`.
- `src/resources/extensions/gsd/corrections.ts` — `WriteResult` pattern (`{written: boolean, reason?: string}`). Embedding module should follow same non-throwing structured result pattern per D013.
- `src/resources/extensions/gsd/recall.ts` — `buildRecallBlock()` is **synchronous**, called from `buildCorrectionsVar()` in auto.ts. Currently reads corrections/preferences via sync file I/O. S02 must make this async to use Vectra queries; S01 should not change this.
- `src/resources/extensions/gsd/pattern-preferences.ts` — `readPreferences()` used by recall. Vector index is a parallel path, not a replacement for preferences.
- `src/resources/extensions/gsd/metrics.ts` — Cost tracking lives here. S03 adds embedding costs; S01 should define the cost info shape in `EmbeddingResult` but not wire metrics.

## Constraints

- **Vectra `queryItems()` is async** — returns `Promise<QueryResult[]>`. Any consumer must be async. S01 tests use async/await naturally; the sync→async conversion of `buildRecallBlock()` is S02's problem.
- **No real API calls in S01 tests** — Tests use pre-computed fixture vectors. The `EmbeddingProvider` interface is tested via a mock/stub. Real OpenAI/Ollama integration is verified manually or in S02 integration tests.
- **Vectra metadata filtering is unreliable** — `queryItems(vector, topK, filter)` returned 0 results even with matching metadata in local testing. Use `queryItems(vector, topK)` + post-query JS filter. Metadata is still stored for `removeByCategory` via `listItemsByMetadata()` which works correctly.
- **Non-throwing contract (D013)** — All embedding and vector operations return structured results, never throw. `EmbedResult: { vector: number[] | null, error?: string }`.
- **Kill switch respected** — If `correction_capture` is false, no embedding or vector operations should occur. S01 modules should accept a config/options param; the kill switch check itself stays in the caller (S02).
- **550 existing test assertions must pass** — S01 adds new modules with new tests. No changes to existing modules.

## Common Pitfalls

- **Testing with real embeddings** — Slow, costly, flaky. Use deterministic fixture vectors (e.g., `[1,0,0,...0]` vs `[0,1,0,...0]`) to prove ranking logic without API calls.
- **Vectra index not created before use** — Must call `isIndexCreated()` + `createIndex()` before any insert/query. Wrap in `initialize()` method.
- **Storing entire CorrectionEntry as Vectra metadata** — Vectra metadata is JSON and stored in-memory. Store only the fields needed for recall display (`correction_to`, `diagnosis_category`, `scope`, `timestamp`, `correction_from`) plus a stable ID for deletion.
- **Dimension mismatch** — OpenAI `text-embedding-3-small` defaults to 1536 dims; Ollama `nomic-embed-text` produces 768. The `VectorIndex` must either enforce a fixed dimension or store dimension in index metadata. Recommendation: use 1536 default, support `dimensions` config, validate on insert.
- **Over-abstracting the provider** — Keep it simple: `embed(text: string): Promise<number[]>`. Don't add batch methods, caching, or retry logic in S01. Those are S02/S03 concerns if needed.

## Open Risks

- **Vectra dependency weight** — 11 transitive deps including axios and cheerio. If this becomes a concern, the core LocalIndex is ~500 lines and could be vendored. Acceptable for now.
- **Vectra project activity** — Low star count (~351), last npm publish was recent (v0.12.3). Risk is low because the core is simple, but monitor for breaking changes.
- **Dimension configuration complexity** — Supporting both 1536 (OpenAI) and 768 (Ollama) dims means the index is tied to the embedding model. Switching models requires re-embedding all vectors. Document this as a known constraint; don't try to solve it in S01.
- **Async test infrastructure** — Existing gsd tests may not have patterns for async test setup/teardown with temp directories for Vectra indices. May need test helpers for creating/cleaning temp vector dirs.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Vector databases | `eyadsibai/ltk@vector-databases` (47 installs) | available — generic, not Vectra-specific; low value |
| OpenAI embeddings | `yoanbernabeu/grepai-skills@grepai-embeddings-openai` (149 installs) | available — may have useful patterns |

No skills recommended for installation. The work is straightforward TypeScript wrapping of well-documented APIs (Vectra LocalIndex, OpenAI embeddings.create). Existing codebase patterns (D013 non-throwing, WriteResult structs) are more relevant than external skills.

## Sources

- Vectra LocalIndex API: `insertItem({vector, metadata})`, `queryItems(vector, topK)`, `deleteItem(id)`, `listItemsByMetadata(filter)`, `isIndexCreated()`, `createIndex()`, `getIndexStats()` (source: local npm testing + [GitHub Stevenic/vectra](https://github.com/Stevenic/vectra))
- Vectra query performance: 1ms for 2-item index with 10-dim vectors (source: local testing — scale testing with 100+ items and 1536 dims needed in S01)
- Vectra metadata filter bug: `queryItems(vector, topK, filter)` returns 0 results even with matching metadata; `listItemsByMetadata(filter)` works (source: local testing)
- OpenAI text-embedding-3-small: 1536 dims default, supports `dimensions` param for reduction, $0.02/M tokens (source: [OpenAI docs](https://platform.openai.com/docs/guides/embeddings))
- Existing codebase: recall.ts is sync (blocks async Vectra usage), corrections.ts WriteResult pattern, D013 non-throwing contract
