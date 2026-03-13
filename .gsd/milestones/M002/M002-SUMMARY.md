---
id: M002
provides:
  - EmbeddingProvider interface with OpenAI and Ollama implementations
  - VectorIndex wrapping Vectra for correction embedding storage and cosine similarity retrieval
  - Async fire-and-forget embedding pipeline wired into writeCorrection() sites
  - Semantic recall path in buildRecallBlock() with category-based fallback
  - Embedding cost tracking on UnitMetrics and dashboard
  - Vector index rotation aligned with correction JSONL lifecycle
key_decisions:
  - D037 — Vectra over Qdrant/Neo4j (in-process, file-backed, zero external deps)
  - D038 — OpenAI text-embedding-3-small default, Ollama local fallback, abstract interface
  - D039 — Semantic recall augments category-based, never replaces
  - D040 — Async fire-and-forget embedding at correction write time
  - D041 — Fixture vectors for testing, no real API calls
  - D043 — Embedding config via env vars
  - D044 — Promise chain serialization for concurrent Vectra writes
  - D045 — Embed correction_to for storage, task context for query
  - D046 — Embedding cost as named constant ($0.02/1M tokens)
  - D047 — Full vector index clear on rotation
  - D048 — Cost accumulator follows gate events flush pattern
patterns_established:
  - Non-throwing EmbedResult with vector-or-error (extends D013)
  - Orthogonal unit vectors as deterministic test fixtures for cosine similarity
  - MockEmbeddingProvider with category-keyed vectors for integration testing
  - Singleton promise pattern for lazy provider/index initialization
  - Promise chain serialization for safe concurrent Vectra writes
  - Module-level cost accumulator with flush/snapshot matching gate events pattern
  - Fire-and-forget async from sync context with .catch(() => {}) for D013 compliance
  - Dashboard section visibility gated on non-zero data
observability_surfaces:
  - EmbedResult.error contains provider name + failure reason
  - VectorIndex.getStats() returns { itemCount, initialized }
  - ScoredCorrection.score exposes cosine similarity (0-1)
  - embeddingCost and embeddingTokens on UnitMetrics in metrics.json
  - Dashboard "Embedding Costs" section (hidden when cost is 0)
  - _getEmbeddingCostSnapshot() for runtime cost inspection
  - rotateVectorIndex() returns { cleared: N } for observability
requirement_outcomes:
  - id: R007
    from_status: validated
    to_status: validated
    proof: R007 extended with vector similarity query path in buildRecallBlock(); 24 semantic-recall tests prove vector recall with fallback to category-based matching; original 27 recall tests still pass unchanged
duration: 3 slices, 9 tasks, ~1 day
verification_result: passed
completed_at: 2026-03-12
---

# M002: Knowledge Infrastructure — Semantic Recall via Vectra

**Semantic recall via vector similarity search augments category-based correction matching in dispatch prompts, with async embedding, graceful degradation, cost tracking, and index lifecycle — proven by 114 new test assertions.**

## What Happened

Built the complete semantic recall pipeline in three slices across 9 tasks.

**S01** established the foundation: `EmbeddingProvider` interface with OpenAI and Ollama implementations behind a factory that returns `null` when unconfigured (graceful degradation signal). `VectorIndex` wraps Vectra's `LocalIndex` for storing correction embeddings and querying by cosine similarity. Used raw `fetch` instead of the OpenAI SDK to avoid dependencies. Tests use orthogonal unit vectors as deterministic fixtures — no real API calls. 37 assertions prove ranking, <50ms latency, and error resilience.

**S02** wired the infrastructure into the dispatch loop: `buildRecallBlock()` gained an async vector similarity path that embeds the task context, queries for similar past corrections, and falls back to category matching when no embeddings exist. `embedCorrection()` fires asynchronously at all 3 `writeCorrection()` sites in auto.ts, serialized via a module-level promise chain. Singleton pattern lazily initializes provider and index from env vars. 60 assertions prove the full write→embed→recall pipeline, fallback behavior, kill switch, and serialization safety.

**S03** closed the loop with cost tracking and lifecycle: `EmbedResult` gained `tokensUsed` and `cost` fields parsed from OpenAI API responses. A module-level cost accumulator flushes to `UnitMetrics` at snapshot time. Dashboard shows "Embedding Costs" section when cost > 0. `rotateVectorIndex()` clears the entire index when corrections rotate. Full regression: 46 GSD test files pass, `tsc --noEmit` clean. 17 assertions prove cost flow and rotation.

## Cross-Slice Verification

**Success Criterion 1: Semantic recall returns similar corrections when embedding model configured**
— S02 semantic-recall.test.ts: 24 tests prove `buildRecallBlock()` with vector path returns corrections ranked by cosine similarity to task context, with correct deduplication against promoted preferences.

**Success Criterion 2: Category-based fallback when no embedding model configured**
— S02 semantic-recall.test.ts: fallback tests confirm identical behavior to M001 when provider is null. S02 recall.test.ts: all 27 original tests pass unchanged.

**Success Criterion 3: Async embedding at write time, failures non-blocking**
— S02 embed-trigger.test.ts: 9 tests prove fire-and-forget pattern, null vector handling, provider throws caught, no-provider skip, serialization via promise chain, kill switch respected.

**Success Criterion 4: Embedding costs in metrics ledger**
— S03 embedding-cost.test.ts: 11 tests prove cost accumulation from provider response through flush to UnitMetrics with embeddingCost/embeddingTokens fields. Dashboard conditional rendering verified.

**Success Criterion 5: Vector index files in .gsd/patterns/vectors/ with rotation**
— S03 vector-rotation.test.ts: 6 tests prove rotateVectorIndex() clears index, handles empty/missing/invalid cases, hooked into rotateCorrections().

**Definition of Done: All existing M001 tests pass**
— S03 full regression: 46 GSD test files, 0 failures. All 550 M001 assertions intact.

## Requirement Changes

- R007: validated → validated (extended) — `buildRecallBlock()` now includes vector similarity query path alongside original category-based matching. 24 new semantic-recall tests + 27 original recall tests all pass. R007's core contract (relevant corrections in dispatch prompts) is strengthened, not changed.

No other requirement status transitions. M002's internal criteria (CR-1 through CR-6) are milestone-scoped and validated by the 114 new test assertions.

## Forward Intelligence

### What the next milestone should know
- Embedding config is env-var based (GSD_EMBEDDING_PROVIDER, GSD_EMBEDDING_MODEL, GSD_EMBEDDING_API_KEY) — no preferences.md integration yet
- The full pipeline is capture → embed (async) → store in Vectra → query at dispatch → inject in prompt
- Vectra is brute-force search over JSON files — works well for <100 vectors, no indexing structure

### What's fragile
- Vectra's brute-force search has no scaling path — correction corpora exceeding ~100 items would need Qdrant (CR-7 deferred)
- Raw fetch in embedding providers has no retry logic — transient API failures return error immediately
- Vectra teardown in vitest environment causes warnings — tsx runner works fine, vitest needs care with dynamic imports

### Authoritative diagnostics
- `VectorIndex.getStats()` — trusted signal for whether embeddings are stored and index is healthy
- `_getEmbeddingCostSnapshot()` in auto.ts — runtime cost state without side effects
- `metrics.json` embeddingCost/embeddingTokens — persistent cost record per unit

### What assumptions changed
- Vectra maturity concern (351 stars) was unfounded — works perfectly for this scale with <50ms queries on 50 items
- Neo4j was dropped entirely during planning — graph queries don't match gsd-pi's actual patterns (similarity, not traversal)

## Files Created/Modified

- `src/resources/extensions/gsd/embedding.ts` — EmbeddingProvider interface, OpenAI/Ollama providers, factory, cost constants
- `src/resources/extensions/gsd/vector-index.ts` — VectorIndex class wrapping Vectra, rotateVectorIndex()
- `src/resources/extensions/gsd/recall.ts` — async buildRecallBlock with vector query path and category fallback
- `src/resources/extensions/gsd/auto.ts` — embedCorrection(), singleton provider/index, cost accumulator, buildCorrectionsVar async
- `src/resources/extensions/gsd/metrics.ts` — embeddingCost/embeddingTokens on UnitMetrics
- `src/resources/extensions/gsd/dashboard-overlay.ts` — Embedding Costs dashboard section
- `src/resources/extensions/gsd/corrections.ts` — rotateVectorIndex() hooked into rotateCorrections()
- `src/resources/extensions/gsd/tests/embedding.test.ts` — 16 provider tests
- `src/resources/extensions/gsd/tests/vector-index.test.ts` — 11 vector index tests
- `src/resources/extensions/gsd/tests/embedding-integration.test.ts` — 10 integration tests
- `src/resources/extensions/gsd/tests/semantic-recall.test.ts` — 24 semantic recall tests
- `src/resources/extensions/gsd/tests/embed-trigger.test.ts` — 9 embed trigger tests
- `src/resources/extensions/gsd/tests/embedding-cost.test.ts` — 11 cost tracking tests
- `src/resources/extensions/gsd/tests/vector-rotation.test.ts` — 6 rotation tests
- `package.json` — vectra dependency added
