# S03: Cost Tracking & Index Lifecycle

**Goal:** Embedding API costs appear in the metrics ledger and dashboard, vector indices rotate alongside correction JSONL rotation, and the complete capture→embed→recall→track pipeline is proven end-to-end.
**Demo:** After auto-mode runs with embeddings configured, `metrics.json` contains `embeddingCost` and `embeddingTokens` on unit records, the dashboard shows an embedding cost line, and `rotateVectorIndex()` clears stale vectors when corrections rotate.

## Must-Haves

- `EmbedResult` extended with optional `tokensUsed` and `cost` fields (backward compatible)
- OpenAI provider parses `usage.total_tokens` from response and computes cost via `EMBEDDING_COST_PER_TOKEN` constant
- Ollama provider returns `cost: 0` (local, free)
- Module-level embedding cost accumulator in auto.ts, flushed and reset at `snapshotUnitMetrics()` time
- `UnitMetrics` extended with optional `embeddingCost` and `embeddingTokens` fields
- Dashboard shows embedding cost line when > 0, hidden when 0/undefined
- `rotateVectorIndex()` clears vector index when `rotateCorrections()` archives the active file
- All existing M001+M002 test assertions still pass

## Proof Level

- This slice proves: integration
- Real runtime required: no (mock providers, temp dirs)
- Human/UAT required: no

## Verification

- `npx tsx src/resources/extensions/gsd/tests/embedding-cost.test.ts` — cost accumulation, flush/reset, OpenAI token parsing, Ollama zero cost
- `npx tsx src/resources/extensions/gsd/tests/vector-rotation.test.ts` — rotation clears index, no-op when no index, coordination with correction rotation
- `npx vitest run src/resources/extensions/gsd/tests/embedding.test.ts` — existing tests still pass with extended EmbedResult
- `npx tsx src/resources/extensions/gsd/tests/semantic-recall.test.ts` — existing 24 assertions pass
- `npx tsc --noEmit` — no type errors

## Observability / Diagnostics

- Runtime signals: `embeddingCost` and `embeddingTokens` on `UnitMetrics` in metrics.json
- Inspection surfaces: Dashboard overlay embedding cost line; `metrics.json` on disk
- Failure visibility: Cost accumulator returns 0 on failures (never blocks); `rotateVectorIndex()` is silent on errors (D013)
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: S01 `EmbeddingProvider`, `VectorIndex`, `EmbedResult`; S02 `embedCorrection()`, `_embedChain`, `getEmbeddingSingletons()`; existing `UnitMetrics`, `snapshotUnitMetrics()`, `rotateCorrections()`, dashboard Quality Gates pattern
- New wiring introduced in this slice: cost capture in `embedCorrection()` → accumulator → `UnitMetrics`; `rotateVectorIndex()` called alongside `rotateCorrections()`; dashboard embedding cost rendering
- What remains before the milestone is truly usable end-to-end: nothing — S03 is the final slice

## Tasks

- [x] **T01: Extend EmbedResult with cost fields and add embedding cost accumulator** `est:30m`
  - Why: Cost data must flow from provider response through to accumulation before it can reach metrics/dashboard
  - Files: `embedding.ts`, `auto.ts`, `tests/embedding-cost.test.ts`, `tests/embedding.test.ts`
  - Do: Add `tokensUsed?` and `cost?` to `EmbedResult`. Update OpenAI provider to parse `usage.total_tokens` and compute cost. Ollama returns `cost: 0`. Add `EMBEDDING_COST_PER_TOKEN` constant. Add module-level accumulator in auto.ts with `flushEmbeddingCosts()` and `resetEmbeddingCosts()`. Create test file with failing assertions.
  - Verify: `npx tsx src/resources/extensions/gsd/tests/embedding-cost.test.ts` passes; existing embedding tests pass
  - Done when: EmbedResult carries cost data, accumulator sums and resets correctly

- [x] **T02: Add embeddingCost to UnitMetrics and dashboard, plus vector rotation** `est:35m`
  - Why: Cost data must surface in metrics.json and dashboard; vector indices must rotate with corrections
  - Files: `metrics.ts`, `dashboard-overlay.ts`, `vector-index.ts`, `corrections.ts`, `auto.ts`, `tests/vector-rotation.test.ts`
  - Do: Extend `UnitMetrics` with `embeddingCost?` and `embeddingTokens?`. Wire `flushEmbeddingCosts()` into `snapshotUnitMetrics()`. Add dashboard embedding cost line after Quality Gates section. Add `rotateVectorIndex()` to vector-index.ts. Call from same location as `rotateCorrections()`. Create vector-rotation test.
  - Verify: `npx tsx src/resources/extensions/gsd/tests/vector-rotation.test.ts` passes; `npx tsc --noEmit` clean
  - Done when: metrics.json has embedding fields, dashboard renders cost line, vector rotation works

- [x] **T03: End-to-end verification and full regression check** `est:20m`
  - Why: Final slice must prove complete pipeline and confirm zero regressions across all M001+M002 tests
  - Files: `tests/embedding-cost.test.ts`, `tests/vector-rotation.test.ts`
  - Do: Run full test suite. Fix any regressions. Add integration assertions proving cost flows through embed→accumulate→snapshot→metrics.json. Verify dashboard rendering logic with embeddingCost data.
  - Verify: All test files pass; `npx tsc --noEmit` clean; full vitest suite passes
  - Done when: All existing tests pass, all new S03 tests pass, no type errors

## Files Likely Touched

- `src/resources/extensions/gsd/embedding.ts`
- `src/resources/extensions/gsd/auto.ts`
- `src/resources/extensions/gsd/metrics.ts`
- `src/resources/extensions/gsd/dashboard-overlay.ts`
- `src/resources/extensions/gsd/vector-index.ts`
- `src/resources/extensions/gsd/corrections.ts`
- `src/resources/extensions/gsd/tests/embedding-cost.test.ts`
- `src/resources/extensions/gsd/tests/vector-rotation.test.ts`
- `src/resources/extensions/gsd/tests/embedding.test.ts`
