---
id: S02
parent: M002
milestone: M002
provides:
  - async buildRecallBlock with vector similarity query path and category-based fallback
  - fire-and-forget embedCorrection() wired at all 3 writeCorrection sites in auto.ts
  - buildCorrectionsVar wired with singleton provider/vectorIndex for semantic recall in dispatch
requires:
  - slice: S01
    provides: EmbeddingProvider interface, VectorIndex class, createEmbeddingProvider factory
affects:
  - S03
key_files:
  - src/resources/extensions/gsd/recall.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/tests/semantic-recall.test.ts
  - src/resources/extensions/gsd/tests/embed-trigger.test.ts
  - src/resources/extensions/gsd/tests/recall.test.ts
key_decisions:
  - D043: Embedding config via env vars (GSD_EMBEDDING_PROVIDER, GSD_EMBEDDING_MODEL, GSD_EMBEDDING_API_KEY)
  - D044: Serialize concurrent embeddings via promise chain (module-level _embedChain)
  - D045: Embed correction_to text for storage, task context for query
patterns_established:
  - Singleton promise pattern for lazy provider/index initialization
  - MockVectorIndex pattern for testing vector queries without Vectra dependency
  - Promise chain serialization for safe concurrent Vectra writes
observability_surfaces:
  - "{{corrections}} template variable shows vector-sourced vs category-sourced corrections"
  - "VectorIndex.getStats() itemCount confirms embeddings stored"
  - "_getEmbedChain() and _resetEmbeddingSingletons() exported for test introspection"
  - "embeddingResult field on write sites indicates embed success/failure/skipped"
drill_down_paths:
  - .gsd/milestones/M002/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M002/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M002/slices/S02/tasks/T03-SUMMARY.md
duration: ~32min
verification_result: passed
completed_at: 2026-03-12
---

# S02: Semantic Recall in Dispatch

**buildRecallBlock() uses vector similarity when embeddings exist, falls back to category matching when they don't, and writeCorrection() triggers async embedding — completing the semantic recall pipeline from capture to dispatch.**

## What Happened

Three tasks wired the S01 embedding/vector infrastructure into the auto.ts dispatch loop:

**T01** made `buildRecallBlock()` async with optional `provider`, `vectorIndex`, and `taskContext` params. When all present, it embeds the task context, queries the vector index for similar corrections, deduplicates against promoted preferences, and uses scored results for slot allocation. When absent, the original category-based sync logic runs unchanged. Extracted `getCategoryBasedCorrections()` helper to share logic cleanly.

**T02** added `embedCorrection()` as a fire-and-forget helper wired at all 3 `writeCorrection()` call sites (passive monitoring drift, session correction detection, stuck loop). Uses singleton promise pattern for lazy provider/index init from env vars, with promise-chain serialization for safe Vectra writes. Kill switch checked synchronously before entering chain.

**T03** connected `buildCorrectionsVar()` to `getEmbeddingSingletons()` so dispatch prompts use semantic recall when available. Added integration tests proving the full write→embed→recall pipeline end-to-end with a real VectorIndex (temp dir) and mock provider.

## Verification

- `npx tsx src/resources/extensions/gsd/tests/semantic-recall.test.ts` — 24 passed (vector path, fallback, kill switch, token budget, self-report, embed failure, empty index, dedup, async signature, write→embed→recall pipeline, category fallback)
- `npx vitest run src/resources/extensions/gsd/tests/embed-trigger.test.ts` — 9 passed (success path, null vector, provider throws, no provider, serialization, kill switch, env config, addCorrection failure, singleton reuse)
- `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` — 27 passed (all existing tests preserved)
- `npx tsc --noEmit` — no new type errors

## Requirements Advanced

- R007 (Live Recall Injection) — extended with vector similarity query path; `buildRecallBlock()` now returns semantically similar corrections when embedding provider configured, while preserving identical category-based behavior as fallback

## Requirements Validated

- No new requirements moved to validated status — R007 was already validated in M001/S03; this slice extends the implementation

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

None.

## Known Limitations

- Embedding cost tracking not yet implemented (S03)
- Vector index rotation not yet aligned with correction JSONL rotation (S03)
- semantic-recall.test.ts dynamic import of VectorIndex causes Vectra teardown warning under vitest — runs correctly under tsx
- embed-trigger.test.ts uses vitest (describe/it) while semantic-recall.test.ts and recall.test.ts use tsx runner pattern — inconsistent but functional

## Follow-ups

- S03: Add embedding cost tracking to metrics ledger
- S03: Align vector index rotation with correction JSONL rotation lifecycle

## Files Created/Modified

- `src/resources/extensions/gsd/recall.ts` — async buildRecallBlock with vector query path, getCategoryBasedCorrections helper
- `src/resources/extensions/gsd/auto.ts` — buildCorrectionsVar async with singleton provider/index, embedCorrection helper at 3 write sites
- `src/resources/extensions/gsd/tests/semantic-recall.test.ts` — 24 assertions covering vector recall, fallback, integration pipeline
- `src/resources/extensions/gsd/tests/embed-trigger.test.ts` — 9 assertions for fire-and-forget embedding trigger
- `src/resources/extensions/gsd/tests/recall.test.ts` — wrapped in async IIFE for async buildRecallBlock compat

## Forward Intelligence

### What the next slice should know
- `getEmbeddingSingletons()` returns `{ provider, vectorIndex }` — S03 can hook cost tracking into the provider wrapper or the `embedCorrection()` call
- The promise chain pattern (`_embedChain`) is the serialization point where S03 can intercept to record embedding costs

### What's fragile
- Vectra teardown in vitest environment — dynamic imports of Vectra in test files cause EnvironmentTeardownError; tsx runner works fine

### Authoritative diagnostics
- `VectorIndex.getStats()` — trusted signal for whether embeddings are being stored
- `_getEmbedChain()` — await to confirm all pending embeddings complete (test use)

### What assumptions changed
- No assumptions changed — S01 interfaces worked exactly as designed for S02 integration
