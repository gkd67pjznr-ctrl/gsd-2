---
id: S03
parent: M002
milestone: M002
provides:
  - Embedding cost tracking on EmbedResult (tokensUsed, cost fields)
  - EMBEDDING_COST_PER_TOKEN constant for OpenAI text-embedding-3-small
  - Module-level embedding cost accumulator (add/flush/snapshot) in auto.ts
  - embeddingCost and embeddingTokens fields on UnitMetrics
  - Dashboard "Embedding Costs" section (visible only when cost > 0)
  - rotateVectorIndex() for vector index lifecycle management
requires:
  - slice: S01
    provides: EmbeddingProvider interface, VectorIndex class, EmbedResult type
  - slice: S02
    provides: embedCorrection() async pipeline, _embedChain serialization, getEmbeddingSingletons()
affects: []
key_files:
  - src/resources/extensions/gsd/embedding.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/metrics.ts
  - src/resources/extensions/gsd/dashboard-overlay.ts
  - src/resources/extensions/gsd/vector-index.ts
  - src/resources/extensions/gsd/corrections.ts
  - src/resources/extensions/gsd/tests/embedding-cost.test.ts
  - src/resources/extensions/gsd/tests/vector-rotation.test.ts
key_decisions:
  - D046: Embedding cost as named constant ($0.02/1M tokens), not config
  - D047: Full vector index clear on rotation (not selective by timestamp)
  - D048: Embedding cost accumulator follows gate events flush pattern from S04
patterns_established:
  - Module-level cost accumulator with flush/snapshot matching gate events pattern
  - Fire-and-forget async from sync context with .catch(() => {}) for D013 compliance
  - Dashboard section visibility gated on non-zero data
observability_surfaces:
  - embeddingCost and embeddingTokens on UnitMetrics in metrics.json
  - Dashboard "Embedding Costs" section (hidden when cost is 0/undefined)
  - _getEmbeddingCostSnapshot() for runtime cost inspection
  - rotateVectorIndex() returns { cleared: N } for observability
drill_down_paths:
  - .gsd/milestones/M002/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M002/slices/S03/tasks/T02-SUMMARY.md
  - .gsd/milestones/M002/slices/S03/tasks/T03-SUMMARY.md
duration: 23min
verification_result: passed
completed_at: 2026-03-12
---

# S03: Cost Tracking & Index Lifecycle

**Embedding API costs flow through the metrics ledger and dashboard, vector indices rotate alongside correction JSONL, completing the capture→embed→recall→track pipeline.**

## What Happened

Extended `EmbedResult` with optional `tokensUsed` and `cost` fields. OpenAI provider parses `usage.total_tokens` from API response and computes cost via `EMBEDDING_COST_PER_TOKEN` ($0.02/1M tokens). Ollama provider returns `cost: 0, tokensUsed: 0`. Created a module-level cost accumulator in auto.ts (`_addEmbeddingCost`, `flushEmbeddingCosts`, `_getEmbeddingCostSnapshot`) wired into `embedCorrection()`.

Extended `UnitMetrics` with `embeddingCost` and `embeddingTokens` fields, flushed at snapshot time. Added "Embedding Costs" dashboard section after Quality Gates, visible only when cost > 0.

Implemented `rotateVectorIndex()` in vector-index.ts using full-clear approach (list all items, delete all). Hooked into `rotateCorrections()` as fire-and-forget async per D013 pattern.

Full regression: 46 GSD test files pass, `tsc --noEmit` clean, all M001+M002 assertions intact.

## Verification

- `embedding-cost.test.ts` — 11 passed: cost accumulation, flush/reset, OpenAI token parsing, Ollama zero cost, snapshot reads
- `vector-rotation.test.ts` — 6 passed: clear, empty, missing, invalid path, idempotency
- `embedding.test.ts` — 16 passed: existing tests unaffected by EmbedResult extension
- `semantic-recall.test.ts` — 24 passed: existing S02 tests unaffected
- `tsc --noEmit` — clean
- Full 46-file GSD test suite — 0 failures

## Requirements Advanced

- CR-6 (embedding cost tracking) — embedding costs now flow from provider response through accumulator to UnitMetrics and dashboard display

## Requirements Validated

- CR-5 (vector index rotation) — `rotateVectorIndex()` proven to clear indices when corrections rotate, with 6 test assertions covering normal, empty, missing, and idempotent cases
- CR-6 (embedding cost tracking) — 11 test assertions prove cost flows through embed→accumulate→snapshot→metrics.json, dashboard rendering conditional on non-zero cost

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- Plan suggested selective vector deletion by timestamp; chose full clear (D047) — simpler and acceptable for small corpora
- `rotateVectorIndex` hooked into `corrections.ts` directly rather than called from auto.ts — cleaner encapsulation

## Known Limitations

- `embed-trigger.test.ts` has a pre-existing ERR_MODULE_NOT_FOUND (not S03-related)
- EMBEDDING_COST_PER_TOKEN is a single constant — multiple embedding model pricing would need extension (D046 revisit flag)

## Follow-ups

- none — S03 is the final M002 slice

## Files Created/Modified

- `src/resources/extensions/gsd/embedding.ts` — Extended EmbedResult, added EMBEDDING_COST_PER_TOKEN, updated both providers
- `src/resources/extensions/gsd/auto.ts` — Added cost accumulator, wired flushEmbeddingCosts into snapshot
- `src/resources/extensions/gsd/metrics.ts` — Extended UnitMetrics with embeddingCost/embeddingTokens
- `src/resources/extensions/gsd/dashboard-overlay.ts` — Added Embedding Costs section
- `src/resources/extensions/gsd/vector-index.ts` — Added rotateVectorIndex()
- `src/resources/extensions/gsd/corrections.ts` — Hooked vector rotation into rotateCorrections()
- `src/resources/extensions/gsd/tests/embedding-cost.test.ts` — New: 11 assertions
- `src/resources/extensions/gsd/tests/vector-rotation.test.ts` — New: 6 assertions

## Forward Intelligence

### What the next slice should know
- M002 is complete. The full pipeline (capture → embed → recall → track) is proven. Next milestone can build on this foundation.

### What's fragile
- Vectra's brute-force search is fine for <100 vectors but has no indexing — large corpora would need Qdrant (CR-7 deferred)

### Authoritative diagnostics
- `_getEmbeddingCostSnapshot()` in auto.ts — trustworthy runtime cost state without side effects
- `metrics.json` embeddingCost/embeddingTokens fields — persistent cost record per unit

### What assumptions changed
- None — S03 executed cleanly as planned
