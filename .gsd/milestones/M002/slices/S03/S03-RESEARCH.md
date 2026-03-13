# S03: Cost Tracking & Index Lifecycle — Research

**Date:** 2026-03-12

## Summary

S03 closes the M002 milestone with two concrete deliverables: (1) embedding API cost tracking in the metrics ledger + dashboard, and (2) vector index rotation aligned with correction JSONL lifecycle. Both are low-risk extensions of existing patterns — metrics.ts already tracks costs per unit, dashboard-overlay.ts already renders quality gate sections, and corrections.ts already has `rotateCorrections()` with `cleanupArchives()`.

The key design question is where to capture embedding costs. The `EmbedResult` type currently has no cost/token field, and the `embedCorrection()` fire-and-forget in auto.ts swallows all details. The cleanest approach is extending `EmbedResult` with optional `tokensUsed` and `cost` fields, then accumulating in a module-level counter that gets flushed to `UnitMetrics` alongside gate events.

For vector index rotation, VectorIndex needs a `clear()` or `removeAll()` method, and a `rotateVectorIndex()` function should be called from the same place `rotateCorrections()` is called. The Vectra index lives at `.gsd/patterns/vectors/` — rotation means deleting stale vector entries whose source corrections have been archived.

## Recommendation

**Task 1: Extend EmbedResult + accumulate costs.** Add `tokensUsed?: number` and `cost?: number` to `EmbedResult`. OpenAI's embedding response includes `usage.total_tokens` — parse it. Ollama doesn't report tokens, so cost is 0 for local. Add a module-level `embeddingCostAccumulator` in auto.ts (or a small `embedding-costs.ts` module) that sums costs from each `embedCorrection()` call. Flush to `UnitMetrics` via a new `embeddingCost` field at snapshot time.

**Task 2: Add `embeddingCost` to UnitMetrics and dashboard.** Extend `UnitMetrics` with optional `embeddingCost?: number` and `embeddingTokens?: number`. In dashboard-overlay.ts, add an embedding cost line after the existing cost summary (only when > 0). Follow the quality gates section pattern for conditional rendering.

**Task 3: Vector index rotation + end-to-end verification.** Add `rotateVectorIndex()` that removes vectors whose source corrections have been archived. Call it from wherever `rotateCorrections()` is called. Verify the complete pipeline with tests and run the full existing test suite to confirm no regressions.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Cost formatting | `formatCost()` in metrics.ts | Already handles $0.0001 to $100+ ranges |
| Dashboard section rendering | Quality Gates pattern in dashboard-overlay.ts | Conditional section with themed output, proven pattern |
| Archive cleanup | `cleanupArchives()` in corrections.ts | Retention-day based cleanup of dated files |
| Non-throwing I/O | D013 pattern throughout corrections.ts, embedding.ts | Consistent error handling contract |

## Existing Code and Patterns

- `src/resources/extensions/gsd/metrics.ts` — `UnitMetrics` type and `snapshotUnitMetrics()` function. Add `embeddingCost` and `embeddingTokens` optional fields. `formatCost()` reusable for display.
- `src/resources/extensions/gsd/auto.ts` — `embedCorrection()` at line ~158 is where cost data flows through. The `_embedChain` promise chain is the serialization point. Module-level accumulator fits naturally here (like `gateEvents` module-level array in quality-gating).
- `src/resources/extensions/gsd/embedding.ts` — `EmbedResult` at line 15 needs `tokensUsed` and `cost` fields. OpenAI response body includes `usage.total_tokens`. Cost = tokens × rate (text-embedding-3-small: $0.02/1M tokens = $0.00000002/token).
- `src/resources/extensions/gsd/dashboard-overlay.ts` — Quality Gates section at line ~460 shows the pattern: conditional rendering when data exists, themed colors, `aggregateX()` + `formatX()` helper pair.
- `src/resources/extensions/gsd/corrections.ts` — `rotateCorrections()` at line 219 and `cleanupArchives()` at line 308. Vector rotation should mirror this: when corrections are rotated/archived, remove corresponding vectors.
- `src/resources/extensions/gsd/vector-index.ts` — `removeByCategory()` exists but removes by category. Need a broader `removeOlderThan(timestamp)` or simply `clear()` + re-embed approach. Given correction volumes are small, clearing the entire index when corrections rotate is simplest.

## Constraints

- `EmbedResult` interface change must be backward compatible (new fields optional)
- `UnitMetrics` extension must not break existing metrics.json deserialization (optional fields)
- Vector rotation must be silent on errors (D013 pattern)
- Embedding cost accumulator must reset between units (like gate events)
- OpenAI embedding pricing: text-embedding-3-small = $0.02/1M tokens; must not hardcode — should be configurable or at least a named constant
- Ollama embeddings are free (local) — cost should be 0, not undefined

## Common Pitfalls

- **Hardcoding embedding pricing** — Models and prices change. Use a constant map or config rather than inline math. But don't over-engineer — a simple `EMBEDDING_COST_PER_TOKEN` constant is fine for now.
- **Accumulator not resetting between units** — Gate events use a module-level array that's flushed and cleared at snapshot time. Embedding costs must follow the same pattern or costs will double-count.
- **Vector rotation deleting active vectors** — Must only remove vectors whose source corrections were archived, not all vectors. Safest approach: clear + re-embed from active corrections.jsonl, but that's expensive. Better: track timestamp in metadata and remove entries older than retention cutoff.
- **Dashboard rendering when no embeddings configured** — The embedding cost section should not appear at all when embeddingCost is 0 or undefined across all units. Follow the quality gates null-check pattern.

## Open Risks

- **Vectra has no bulk delete** — `removeByCategory()` iterates and deletes one-by-one. A `removeOlderThan()` would need the same pattern. For small indices (<100 items) this is fine; at scale it's O(n) with individual I/O per deletion.
- **Timestamp not currently in CorrectionMetadata** — D042 specifies 5 metadata fields including `timestamp`, but need to verify it's stored as a queryable value for age-based rotation. (Confirmed: correction_types.ts has `timestamp` and vector-index.ts stores `scope` and `timestamp` in metadata — but need to verify timestamp is actually stored.)
- **No existing test for rotateCorrections integration** — rotation tests exist in corrections.test.ts but vector rotation tests are new. Must test the coordination between correction rotation and vector cleanup.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Vectra | none found | No skills available — library is small enough to use directly |
| OpenAI embeddings | available in `<available_skills>` — none directly relevant | N/A |

No skills recommended for installation. This is straightforward TypeScript extension work using existing patterns.

## Sources

- S01 summary: EmbedResult type, VectorIndex API, CorrectionMetadata fields (preloaded context)
- S02 summary: embedCorrection() location, _embedChain pattern, getEmbeddingSingletons() (preloaded context)
- metrics.ts: UnitMetrics type, formatCost(), snapshotUnitMetrics() (direct code read)
- dashboard-overlay.ts: Quality Gates section pattern at line ~460 (direct code read)
- corrections.ts: rotateCorrections() and cleanupArchives() patterns (direct code read)
- OpenAI embedding pricing: $0.02/1M tokens for text-embedding-3-small (source: [OpenAI pricing](https://openai.com/pricing))
