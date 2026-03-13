---
id: S01
parent: M002
milestone: M002
provides:
  - EmbeddingProvider interface with OpenAI and Ollama implementations
  - createEmbeddingProvider factory (returns null when unconfigured)
  - VectorIndex class wrapping Vectra LocalIndex
  - ScoredCorrection, EmbedResult, VectorIndexStats types
requires: []
affects:
  - S02
key_files:
  - src/resources/extensions/gsd/embedding.ts
  - src/resources/extensions/gsd/vector-index.ts
  - src/resources/extensions/gsd/tests/embedding.test.ts
  - src/resources/extensions/gsd/tests/vector-index.test.ts
  - src/resources/extensions/gsd/tests/embedding-integration.test.ts
key_decisions:
  - D041 — Fixture vectors for testing, no real API calls
  - D042 — Minimal metadata (5 fields) in Vectra items
  - Raw fetch instead of openai SDK for embedding providers
  - Post-query JS filtering since Vectra metadata filter is unreliable
patterns_established:
  - Non-throwing embed() returns EmbedResult with vector or error (extends D013)
  - Non-throwing VectorIndex methods return empty arrays/defaults on error
  - Orthogonal unit vectors as deterministic test fixtures for cosine similarity
  - MockEmbeddingProvider with category-keyed vectors for integration testing
observability_surfaces:
  - EmbedResult.error contains provider name + failure reason
  - VectorIndex.getStats() returns { itemCount, initialized }
  - ScoredCorrection.score exposes cosine similarity (0-1)
drill_down_paths:
  - .gsd/milestones/M002/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M002/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M002/slices/S01/tasks/T03-SUMMARY.md
duration: 3 tasks
verification_result: passed
completed_at: 2026-03-12
---

# S01: Embedding Abstraction & Vector Index

**EmbeddingProvider abstraction with OpenAI/Ollama implementations and VectorIndex wrapping Vectra for correction embedding storage and cosine similarity retrieval, proven by 37 test assertions including ranking and <50ms latency.**

## What Happened

Built the embedding and vector search foundation for semantic recall in three tasks:

**T01** created the `EmbeddingProvider` interface with `embed(text): Promise<EmbedResult>`, plus `OpenAIEmbeddingProvider` (POST to `/v1/embeddings`) and `OllamaEmbeddingProvider` (POST to `/api/embeddings`). The `createEmbeddingProvider(config)` factory returns `null` when no model is configured, enabling graceful degradation. Used raw `fetch` instead of the `openai` SDK to avoid a new dependency. 16 tests cover all factory paths and error handling.

**T02** created `VectorIndex` wrapping Vectra's `LocalIndex` with `initialize()`, `addCorrection(entry, vector)`, `querySimilar(vector, limit)`, `removeByCategory(category)`, and `getStats()`. Only 5 essential metadata fields are stored per vector. Post-query JS filtering handles category removal since Vectra's built-in metadata filter is unreliable. 11 tests prove cosine ranking, <50ms latency on 50 items, and graceful handling of corrupt/missing indices.

**T03** created an integration test with a deterministic `MockEmbeddingProvider` mapping category keywords to orthogonal unit vectors. 10 tests prove the full embed→store→query pipeline including edge cases (empty index, duplicates, removeByCategory + re-query).

## Verification

- `embedding.test.ts` — 16/16 passed (factory paths, provider success/error, non-throwing)
- `vector-index.test.ts` — 11/11 passed (ranking, latency <50ms, removeByCategory, corrupt index)
- `embedding-integration.test.ts` — 10/10 passed (end-to-end pipeline, edge cases)
- Full test suite — 71/73 passed (2 pre-existing failures in initResources and npm pack, unrelated to S01)
- S01 total: 37 new test assertions, all passing

## Requirements Advanced

- CR-2 (Embedding model abstraction) — `EmbeddingProvider` interface with OpenAI/Ollama implementations and graceful degradation factory
- CR-3 (Graceful degradation) — `createEmbeddingProvider()` returns null when unconfigured; VectorIndex handles missing/corrupt index without throwing

## Requirements Validated

- None fully validated by S01 alone — these modules are standalone; integration into recall and dispatch happens in S02

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

None.

## Known Limitations

- No real API calls tested — provider implementations verified via mock fetch only (deliberate per D041)
- VectorIndex uses Vectra's brute-force search — performance untested beyond 50 items (sufficient for correction corpora)
- Modules are standalone — not yet wired into recall.ts, auto.ts, or corrections.ts (S02 scope)

## Follow-ups

- S02: Wire embedding into `writeCorrection()` and `buildRecallBlock()` with fallback logic
- S03: Add cost tracking for embedding API calls and vector index rotation

## Files Created/Modified

- `src/resources/extensions/gsd/embedding.ts` — EmbeddingProvider interface, OpenAI/Ollama providers, factory
- `src/resources/extensions/gsd/vector-index.ts` — VectorIndex class wrapping Vectra
- `src/resources/extensions/gsd/tests/embedding.test.ts` — 16 provider tests
- `src/resources/extensions/gsd/tests/vector-index.test.ts` — 11 vector index tests
- `src/resources/extensions/gsd/tests/embedding-integration.test.ts` — 10 integration tests
- `package.json` — vectra dependency added

## Forward Intelligence

### What the next slice should know
- `EmbeddingProvider.embed()` returns `EmbedResult { vector: number[] | null, error?: string }` — always check `vector !== null` before storing
- `VectorIndex.querySimilar()` returns `ScoredCorrection[]` sorted by descending similarity score — the `score` field is cosine similarity (0-1)
- `createEmbeddingProvider()` returns `null` when no embedding config exists — this is the graceful degradation signal for S02's fallback logic

### What's fragile
- Vectra's metadata filter is unreliable — `removeByCategory()` uses `listItems()` + JS filter + individual `deleteItem()` calls, which could be slow at scale
- Raw fetch in providers has no retry logic — transient API failures return error immediately

### Authoritative diagnostics
- `VectorIndex.getStats()` — returns `{ itemCount, initialized }` for health checks
- `EmbedResult.error` — formatted as `"{provider}: {reason}"` with HTTP status for API failures

### What assumptions changed
- Vectra works well for <50 items with <50ms query time — original concern about maturity was unfounded for this scale
