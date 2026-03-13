# M002: Knowledge Infrastructure — Semantic Recall via Vectra

**Vision:** Auto-mode dispatch prompts retrieve semantically relevant past corrections and preferences via vector similarity search, replacing category-only matching — while preserving zero-config graceful degradation.

## Success Criteria

- When an embedding model is configured, `buildRecallBlock()` returns corrections semantically similar to the current task context, not just category matches
- When no embedding model is configured, recall falls back to current category-based matching with no behavioral change
- Embedding happens asynchronously at correction write time — embedding failures never block correction capture
- Embedding API costs are tracked in the metrics ledger alongside LLM costs
- Vector index files live in `.gsd/patterns/vectors/` and respect the same rotation/retention lifecycle as corrections

## Key Risks / Unknowns

- Vectra library maturity (~351 stars) and whether its in-process brute-force search meets the <50ms latency target for dispatch-time queries
- Async embedding pipeline fitting into auto.ts dispatch loop without adding complexity or race conditions
- OpenAI embedding API availability/latency during auto-mode runs — must not degrade dispatch speed

## Proof Strategy

- Vectra viability → retire in S01 by building real embedding + query through Vectra with test assertions proving <50ms query time and correct similarity ranking
- Async pipeline safety → retire in S02 by wiring embedding into auto.ts correction capture path and proving embedding failure doesn't block dispatch

## Verification Classes

- Contract verification: unit tests for embedding abstraction, vector index operations, recall integration, cost tracking
- Integration verification: `buildRecallBlock()` with vector backend returns semantically relevant results through the real `{{corrections}}` template path in auto.ts
- Operational verification: none (no services — Vectra is in-process, file-backed)
- UAT / human verification: run auto-mode on a real task and inspect the dispatch prompt to see semantic recall in action

## Milestone Definition of Done

This milestone is complete only when all are true:

- All slices `[x]` in roadmap
- Semantic recall returns relevant corrections for a task context when embeddings exist
- Category-based recall works identically to M001 when no embedding model is configured
- Embedding failures are non-fatal and logged, never blocking correction capture
- Embedding costs appear in metrics ledger
- All existing 550 M001 test assertions still pass
- New test assertions cover embedding abstraction, vector index, semantic recall, graceful degradation, and cost tracking

## Requirement Coverage

- Covers: CR-1 (semantic recall), CR-2 (embedding model abstraction), CR-3 (graceful degradation), CR-4 (async embedding), CR-5 (vector index rotation), CR-6 (embedding cost tracking)
- Leaves for later: CR-7 (optional Qdrant backend — future milestone if correction corpora grow large)
- Existing requirements: R007 (live recall injection) is extended, not replaced — category-based recall remains as fallback
- Orphan risks: none

## Slices

- [x] **S01: Embedding Abstraction & Vector Index** `risk:high` `depends:[]`
  > After this: `embedText()` produces vectors via OpenAI or Ollama, `VectorIndex` wraps Vectra to store/query correction embeddings in `.gsd/patterns/vectors/`, and test assertions prove similarity search returns semantically relevant results ranked by cosine distance in <50ms
- [ ] **S02: Semantic Recall in Dispatch** `risk:medium` `depends:[S01]`
  > After this: `buildRecallBlock()` uses vector similarity when embeddings exist, falls back to category matching when they don't, embedding is triggered asynchronously from `writeCorrection()` in auto.ts, and dispatch prompts contain semantically relevant past corrections — proven by tests and a real auto-mode dispatch
- [ ] **S03: Cost Tracking & Index Lifecycle** `risk:low` `depends:[S01,S02]`
  > After this: embedding API costs appear in the metrics ledger and dashboard, vector indices rotate/clean up alongside correction JSONL rotation, and the complete pipeline (capture → embed → recall → track) is proven end-to-end with all existing tests still passing

## Boundary Map

### S01 → S02

Produces:
- `EmbeddingProvider` interface with `embed(text: string): Promise<number[]>` and factory function `createEmbeddingProvider(config): EmbeddingProvider | null`
- `VectorIndex` class wrapping Vectra's `LocalIndex` with `addCorrection(entry, vector)`, `querySimilar(text, limit): CorrectionEntry[]`, and `removeByCategory(category)`
- Vector storage at `.gsd/patterns/vectors/` as Vectra JSON files

Consumes:
- `CorrectionEntry` from `correction-types.ts`
- `readCorrections()` from `corrections.ts` for backfill scenarios

### S02 → S03

Produces:
- Async embedding trigger in `writeCorrection()` path (fire-and-forget with error capture)
- `buildRecallBlock()` extended with vector query path and fallback logic
- `embeddingResult` field on `WriteResult` indicating embed success/failure/skipped

Consumes:
- S01 `EmbeddingProvider` and `VectorIndex`
- Existing `buildRecallBlock()`, `writeCorrection()`, `buildCorrectionsVar()` in auto.ts

### S03

Produces:
- `EmbeddingCost` type and accumulator in `metrics.ts`
- `rotateVectorIndex()` aligned with `rotateCorrections()` lifecycle
- Dashboard embedding cost line in quality/metrics section

Consumes:
- S01 `VectorIndex` (for rotation)
- S02 async embedding path (for cost capture)
- Existing `UnitMetrics`, `formatCost()` in `metrics.ts`
