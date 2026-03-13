---
estimated_steps: 5
estimated_files: 4
---

# T01: Extend EmbedResult with cost fields and add embedding cost accumulator

**Slice:** S03 — Cost Tracking & Index Lifecycle
**Milestone:** M002

## Description

Add cost-tracking fields to `EmbedResult`, update both embedding providers to populate them, and create a module-level cost accumulator in auto.ts that sums embedding costs per unit and can be flushed/reset at snapshot time.

## Steps

1. Extend `EmbedResult` in `embedding.ts` with optional `tokensUsed?: number` and `cost?: number` fields
2. Add `EMBEDDING_COST_PER_TOKEN` constant (text-embedding-3-small: $0.02/1M = 0.00000002). Update `OpenAIEmbeddingProvider.embed()` to parse `usage.total_tokens` from response JSON and compute `cost = tokens * rate`. Update `OllamaEmbeddingProvider.embed()` to return `cost: 0, tokensUsed: 0` on success
3. Create `tests/embedding-cost.test.ts` with assertions: OpenAI cost computation, Ollama zero cost, accumulator sum/flush/reset semantics
4. Add module-level `_embeddingCostAccumulator` and `_embeddingTokenAccumulator` in auto.ts with exported `_addEmbeddingCost(cost, tokens)`, `flushEmbeddingCosts(): { cost: number, tokens: number }` (returns and resets), and `_getEmbeddingCostSnapshot()` (for test inspection without resetting)
5. Update `embedCorrection()` in auto.ts to call `_addEmbeddingCost()` when embed result has cost data

## Must-Haves

- [ ] `EmbedResult` has optional `tokensUsed` and `cost` fields (backward compatible)
- [ ] OpenAI provider parses `usage.total_tokens` and computes cost
- [ ] Ollama provider returns `cost: 0, tokensUsed: 0`
- [ ] Cost accumulator sums across multiple embeddings and resets on flush
- [ ] `embedCorrection()` feeds cost data to accumulator
- [ ] Existing embedding tests still pass

## Verification

- `npx tsx src/resources/extensions/gsd/tests/embedding-cost.test.ts` — all assertions pass
- `npx vitest run src/resources/extensions/gsd/tests/embedding.test.ts` — existing tests unaffected
- `npx tsc --noEmit` — no type errors

## Observability Impact

- Signals added/changed: `EmbedResult.cost` and `EmbedResult.tokensUsed` on every embed call; `_getEmbeddingCostSnapshot()` for runtime inspection
- How a future agent inspects this: Call `_getEmbeddingCostSnapshot()` to see accumulated costs; check `EmbedResult` from any `embed()` call
- Failure state exposed: Cost fields are undefined on error (not 0) — distinguishes "free" from "failed"

## Inputs

- `src/resources/extensions/gsd/embedding.ts` — current EmbedResult type and provider implementations
- `src/resources/extensions/gsd/auto.ts` — `embedCorrection()` at line ~158, `_embedChain` serialization pattern

## Expected Output

- `src/resources/extensions/gsd/embedding.ts` — extended EmbedResult, updated providers with cost parsing
- `src/resources/extensions/gsd/auto.ts` — cost accumulator functions, updated embedCorrection()
- `src/resources/extensions/gsd/tests/embedding-cost.test.ts` — new test file with ~12 assertions
