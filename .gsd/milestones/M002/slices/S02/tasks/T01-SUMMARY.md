---
id: T01
parent: S02
milestone: M002
provides:
  - async buildRecallBlock with vector similarity query path and category-based fallback
key_files:
  - src/resources/extensions/gsd/recall.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/tests/semantic-recall.test.ts
  - src/resources/extensions/gsd/tests/recall.test.ts
key_decisions:
  - Vector results deduped against promoted preferences using same category:scope key set
  - getCategoryBasedCorrections extracted as helper to avoid code duplication between paths
patterns_established:
  - MockVectorIndex pattern for testing vector queries without Vectra dependency
observability_surfaces:
  - buildRecallBlock output inspectable via {{corrections}} template variable — content now similarity-ranked when vector path active
  - Embed failure triggers silent fallback — no explicit error in output (matches non-throwing contract)
duration: ~10min
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T01: Make buildRecallBlock async with vector query path and fallback

**buildRecallBlock() is now async with vector similarity queries when EmbeddingProvider+VectorIndex+taskContext provided, falling back to category-based logic otherwise.**

## What Happened

Made `buildRecallBlock()` async, accepting optional `provider`, `vectorIndex`, and `taskContext` params. When all three are present, embeds taskContext, queries vectorIndex for similar corrections, deduplicates against promoted preferences, and uses scored results for slot allocation. When any param is missing, embed returns null vector, or vector index returns empty results, the original category-based sync logic runs as fallback. Extracted `getCategoryBasedCorrections()` helper to share the original logic cleanly. Updated `buildCorrectionsVar()` in auto.ts to await the async call. Updated existing recall.test.ts to use async IIFE wrapper.

## Verification

- `npx vitest run src/resources/extensions/gsd/tests/semantic-recall.test.ts` — 18 passed, 0 failed (vector path, fallback, kill switch, token budget, self-report, embed failure, empty index, dedup, async signature)
- `npx vitest run src/resources/extensions/gsd/tests/recall.test.ts` — 27 passed, 0 failed (all existing tests preserved)
- `npx tsc --noEmit` — no new type errors (pre-existing .ts extension and PreferenceEntry mapping errors unchanged)

## Diagnostics

- Inspect `{{corrections}}` template variable in dispatch prompt to see vector-sourced vs category-sourced corrections
- Vector path embed failures are silent (non-throwing contract) — fall back to category logic automatically

## Deviations

None.

## Known Issues

- Both test files use custom runner pattern (not vitest describe/it), so vitest reports "No test suite found" despite all assertions passing. This is pre-existing.

## Files Created/Modified

- `src/resources/extensions/gsd/recall.ts` — async buildRecallBlock with vector query path, getCategoryBasedCorrections helper
- `src/resources/extensions/gsd/auto.ts` — buildCorrectionsVar now async, awaits buildRecallBlock
- `src/resources/extensions/gsd/tests/semantic-recall.test.ts` — 18 assertions covering vector recall, fallback, edge cases
- `src/resources/extensions/gsd/tests/recall.test.ts` — wrapped in async IIFE for async buildRecallBlock compat
