---
estimated_steps: 5
estimated_files: 3
---

# T01: Make buildRecallBlock async with vector query path and fallback

**Slice:** S02 — Semantic Recall in Dispatch
**Milestone:** M002

## Description

Extend `buildRecallBlock()` in `recall.ts` to support async vector similarity queries when an `EmbeddingProvider` and `VectorIndex` are provided, while preserving the existing category-based logic as the default fallback path. Create comprehensive test file covering both paths.

## Steps

1. Read `recall.ts` fully to understand current `buildRecallBlock()` contract and all internal helpers
2. Make `buildRecallBlock()` async — add optional params `{ provider?: EmbeddingProvider, vectorIndex?: VectorIndex, taskContext?: string }`. When all three provided: embed `taskContext` via provider, call `vectorIndex.querySimilar()`, use scored corrections in slot allocation (preferences still get priority per existing logic). When any missing: execute existing sync logic unchanged.
3. Update the vector query path: scored corrections from `querySimilar()` replace the `readCorrections()` + filter + sort section. Still apply dedup against promoted preferences. Still respect MAX_ENTRIES (10) and MAX_TOKENS (3K). Self-report instructions still appended.
4. Handle embedding failure in the async path: if `provider.embed()` returns `{ vector: null }`, fall back to category-based logic (not empty string).
5. Create `tests/semantic-recall.test.ts` with assertions: (a) async vector path returns corrections ranked by similarity, (b) fallback when no provider returns same output as sync logic, (c) kill switch returns empty, (d) token budget respected with vector results, (e) self-report instructions present, (f) embed failure falls back to category logic, (g) empty vector index falls back to category logic.

## Must-Haves

- [ ] `buildRecallBlock()` is async and returns `Promise<string>`
- [ ] Vector path uses `VectorIndex.querySimilar()` results in slot allocation
- [ ] Fallback path produces identical output to current sync logic
- [ ] Embed failure triggers graceful fallback, not empty string
- [ ] Token budget (3K) and slot cap (10) enforced on vector results
- [ ] Self-report instructions appended in all non-empty cases
- [ ] Kill switch still returns empty string
- [ ] Existing `recall.test.ts` tests still pass (backward compat)

## Verification

- `npx vitest run src/resources/extensions/gsd/tests/semantic-recall.test.ts` — all new assertions pass
- `npx vitest run src/resources/extensions/gsd/tests/recall.test.ts` — all 22 existing assertions pass
- No type errors: `npx tsc --noEmit` on modified files

## Observability Impact

- Signals added/changed: `buildRecallBlock()` now returns vector-sourced corrections when available — output format unchanged but content selection is similarity-ranked
- How a future agent inspects this: inspect `{{corrections}}` template variable in dispatch prompt output
- Failure state exposed: embed failure triggers fallback path silently — no explicit error in output (matches non-throwing contract)

## Inputs

- `src/resources/extensions/gsd/recall.ts` — current sync `buildRecallBlock()` implementation
- `src/resources/extensions/gsd/embedding.ts` — `EmbeddingProvider` interface, `EmbedResult` type
- `src/resources/extensions/gsd/vector-index.ts` — `VectorIndex.querySimilar()` returns `ScoredCorrection[]`
- S01 summary — `MockEmbeddingProvider` pattern for testing with fixture vectors

## Expected Output

- `src/resources/extensions/gsd/recall.ts` — `buildRecallBlock()` is async with vector query + fallback paths
- `src/resources/extensions/gsd/tests/semantic-recall.test.ts` — ~15 assertions proving vector recall, fallback, edge cases
