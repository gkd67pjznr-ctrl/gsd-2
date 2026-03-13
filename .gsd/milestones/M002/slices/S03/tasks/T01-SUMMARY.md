---
id: T01
parent: S03
milestone: M002
provides:
  - EmbedResult cost fields (tokensUsed, cost)
  - EMBEDDING_COST_PER_TOKEN constant
  - Embedding cost accumulator (add/flush/snapshot)
key_files:
  - src/resources/extensions/gsd/embedding.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/tests/embedding-cost.test.ts
key_decisions:
  - Cost fields are undefined on error (not 0) to distinguish free from failed
patterns_established:
  - Module-level accumulator with flush/snapshot pattern for cost tracking
observability_surfaces:
  - _getEmbeddingCostSnapshot() for runtime cost inspection
  - EmbedResult.cost and EmbedResult.tokensUsed on every embed call
duration: 5min
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T01: Extend EmbedResult with cost fields and add embedding cost accumulator

**Added cost tracking fields to EmbedResult, updated both providers, and created a module-level cost accumulator in auto.ts.**

## What Happened

Extended `EmbedResult` with optional `tokensUsed` and `cost` fields. Added `EMBEDDING_COST_PER_TOKEN` constant for text-embedding-3-small ($0.02/1M tokens). Updated OpenAI provider to parse `usage.total_tokens` from API response and compute cost. Updated Ollama provider to return `cost: 0, tokensUsed: 0`. Created cost accumulator in auto.ts with `_addEmbeddingCost()`, `flushEmbeddingCosts()`, and `_getEmbeddingCostSnapshot()`. Updated `embedCorrection()` to feed cost data to the accumulator.

## Verification

- `npx tsx src/resources/extensions/gsd/tests/embedding-cost.test.ts` — 11 passed, 0 failed
- `npx tsx src/resources/extensions/gsd/tests/embedding.test.ts` — 16 passed, 0 failed (existing tests unaffected)
- `npx tsc --noEmit` — no type errors

### Slice-level checks
- ✅ embedding-cost.test.ts — all pass
- ⏳ vector-rotation.test.ts — not yet created (future task)
- ✅ embedding.test.ts — all pass
- ⏳ semantic-recall.test.ts — not run (unrelated to this task)
- ✅ tsc --noEmit — clean

## Diagnostics

Call `_getEmbeddingCostSnapshot()` to inspect accumulated embedding costs at runtime. Check `EmbedResult` from any `embed()` call for per-call cost data. Cost fields are `undefined` on error results (not 0).

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/embedding.ts` — Extended EmbedResult, added EMBEDDING_COST_PER_TOKEN, updated providers
- `src/resources/extensions/gsd/auto.ts` — Added cost accumulator functions, updated embedCorrection()
- `src/resources/extensions/gsd/tests/embedding-cost.test.ts` — New test file with 11 assertions
