# S03: Cost Tracking & Index Lifecycle — UAT

**Milestone:** M002
**Written:** 2026-03-12

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All outputs are file-backed (metrics.json, dashboard text, vector index files) and testable with mock providers — no live runtime or human experience needed

## Preconditions

- S01 and S02 complete (embedding abstraction and semantic recall wired)
- All 46 GSD test files passing
- `tsc --noEmit` clean

## Smoke Test

Run `npx tsx src/resources/extensions/gsd/tests/embedding-cost.test.ts` — 11 assertions pass confirming cost flows from provider through accumulator to flush output.

## Test Cases

### 1. OpenAI embedding returns cost data

1. Create OpenAI provider with mock fetch returning `usage.total_tokens: 100`
2. Call `embed("test text")`
3. **Expected:** `result.tokensUsed === 100`, `result.cost === 100 * EMBEDDING_COST_PER_TOKEN`

### 2. Ollama embedding returns zero cost

1. Create Ollama provider with mock fetch
2. Call `embed("test text")`
3. **Expected:** `result.tokensUsed === 0`, `result.cost === 0`

### 3. Cost accumulator sums and flushes

1. Call `_addEmbeddingCost({ cost: 0.001, tokensUsed: 50 })` three times
2. Call `flushEmbeddingCosts()`
3. **Expected:** Returns `{ cost: 0.003, tokens: 150 }`, subsequent flush returns zeroes

### 4. UnitMetrics includes embedding fields

1. Run a unit that triggers embeddings (via mock)
2. Call `snapshotUnitMetrics()`
3. **Expected:** metrics.json unit record contains `embeddingCost` and `embeddingTokens` when cost > 0

### 5. Vector rotation clears index

1. Create a Vectra index with items
2. Call `rotateVectorIndex(indexPath)`
3. **Expected:** Index has 0 items after rotation

### 6. Dashboard shows embedding costs conditionally

1. Render dashboard with `embeddingCost: 0.005, embeddingTokens: 250`
2. **Expected:** Output contains "Embedding Costs" section with formatted values
3. Render dashboard with no embedding cost data
4. **Expected:** No "Embedding Costs" section in output

## Edge Cases

### Cost fields undefined on embed error

1. Provider returns error result
2. **Expected:** `tokensUsed` and `cost` are `undefined`, not 0

### Rotation on missing index directory

1. Call `rotateVectorIndex('/nonexistent/path')`
2. **Expected:** Returns silently (D013), no throw

### Rotation idempotency

1. Call `rotateVectorIndex()` twice on same index
2. **Expected:** Second call succeeds with `cleared: 0`

## Failure Signals

- `embedding-cost.test.ts` or `vector-rotation.test.ts` failures
- `embeddingCost` missing from metrics.json after embedding-enabled run
- Dashboard silently hiding costs when they should display
- `rotateVectorIndex` throwing instead of returning silently

## Requirements Proved By This UAT

- CR-5 (vector index rotation) — rotation clears vectors on correction JSONL rotation, idempotent, silent on errors
- CR-6 (embedding cost tracking) — costs parsed from OpenAI response, accumulated per-unit, surfaced in metrics.json and dashboard

## Not Proven By This UAT

- Real OpenAI/Ollama API integration (mock providers only)
- Cost accuracy under production token counts (unit-tested with small numbers)
- Dashboard visual rendering (logic tested, not TUI pixel output)
- Vectra performance at scale (small test corpora only)

## Notes for Tester

All tests use mock providers and temp directories — no API keys or external services needed. The `embed-trigger.test.ts` ERR_MODULE_NOT_FOUND is pre-existing and unrelated to S03.
