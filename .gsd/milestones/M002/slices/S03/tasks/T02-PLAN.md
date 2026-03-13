---
estimated_steps: 5
estimated_files: 6
---

# T02: Add embeddingCost to UnitMetrics, dashboard rendering, and vector rotation

**Slice:** S03 — Cost Tracking & Index Lifecycle
**Milestone:** M002

## Description

Wire embedding costs into the metrics ledger and dashboard display, and implement vector index rotation aligned with correction JSONL lifecycle.

## Steps

1. Extend `UnitMetrics` in `metrics.ts` with optional `embeddingCost?: number` and `embeddingTokens?: number` fields
2. In auto.ts, after calling `snapshotUnitMetrics()`, call `flushEmbeddingCosts()` and merge the returned `{ cost, tokens }` into the unit record before it's saved. Alternatively, modify the snapshot flow to include embedding costs inline.
3. Add embedding cost line to `dashboard-overlay.ts` after the Quality Gates section. Render only when any unit has `embeddingCost > 0`. Use `formatCost()` for display. Follow the Quality Gates conditional rendering pattern.
4. Add `rotateVectorIndex(indexPath: string)` to `vector-index.ts` — creates a temporary VectorIndex, initializes it, calls `listItems()` + bulk delete of items whose `timestamp` is older than retention cutoff. Simpler alternative: clear entire index when rotation happens (acceptable for small corpora). Call from wherever `rotateCorrections()` is invoked in auto.ts.
5. Create `tests/vector-rotation.test.ts` with assertions: rotation clears stale vectors, fresh vectors survive (or full clear if that's the chosen approach), no-op on missing index, silent on errors

## Must-Haves

- [ ] `UnitMetrics` has `embeddingCost` and `embeddingTokens` optional fields
- [ ] Embedding costs flow from accumulator into `UnitMetrics` at snapshot time
- [ ] Dashboard renders embedding cost line when data exists, hidden otherwise
- [ ] `rotateVectorIndex()` removes stale vectors when corrections rotate
- [ ] Vector rotation is silent on errors (D013 pattern)

## Verification

- `npx tsx src/resources/extensions/gsd/tests/vector-rotation.test.ts` — all assertions pass
- `npx tsc --noEmit` — no type errors
- Visual inspection of dashboard rendering logic (or unit test of `formatEmbeddingCostLine()` if extracted)

## Observability Impact

- Signals added/changed: `embeddingCost` and `embeddingTokens` persisted in metrics.json per unit; visible in dashboard
- How a future agent inspects this: Read `metrics.json`, look for `embeddingCost` on unit records; check dashboard for embedding line
- Failure state exposed: Missing `embeddingCost` field means no embeddings were configured (not an error)

## Inputs

- `src/resources/extensions/gsd/auto.ts` — `flushEmbeddingCosts()` from T01, `snapshotUnitMetrics()` call site
- `src/resources/extensions/gsd/metrics.ts` — `UnitMetrics` type, `formatCost()`
- `src/resources/extensions/gsd/dashboard-overlay.ts` — Quality Gates section pattern at line ~460
- `src/resources/extensions/gsd/vector-index.ts` — `VectorIndex` class, `removeByCategory()` pattern
- `src/resources/extensions/gsd/corrections.ts` — `rotateCorrections()` pattern

## Expected Output

- `src/resources/extensions/gsd/metrics.ts` — extended UnitMetrics
- `src/resources/extensions/gsd/auto.ts` — embedding cost merge at snapshot time, rotateVectorIndex call
- `src/resources/extensions/gsd/dashboard-overlay.ts` — embedding cost rendering section
- `src/resources/extensions/gsd/vector-index.ts` — `rotateVectorIndex()` function
- `src/resources/extensions/gsd/tests/vector-rotation.test.ts` — new test file with ~8 assertions
