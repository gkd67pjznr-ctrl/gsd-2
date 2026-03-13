---
id: T02
parent: S02
milestone: M002
provides:
  - fire-and-forget embedCorrection() wired at all 3 writeCorrection sites in auto.ts
  - singleton EmbeddingProvider + VectorIndex initialization from env vars
key_files:
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/tests/embed-trigger.test.ts
key_decisions:
  - Promise chain serialization for Vectra write safety (not mutex/queue — simpler, sufficient)
  - Kill switch checked synchronously before entering chain to avoid unnecessary singleton init
patterns_established:
  - Singleton promise pattern for lazy provider/index initialization (initialize once, reuse)
  - Module-level _embedChain for serialized async operations
observability_surfaces:
  - VectorIndex.getStats() itemCount increasing confirms embeddings are stored
  - _getEmbedChain() and _resetEmbeddingSingletons() exported for test introspection
duration: 12min
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T02: Wire async embedding trigger into auto.ts writeCorrection sites

**Added fire-and-forget embedCorrection() at all 3 writeCorrection call sites with singleton provider/index init, promise-chain serialization, and kill switch support.**

## What Happened

Added `getEmbeddingSingletons()` with lazy singleton promise pattern reading `GSD_EMBEDDING_PROVIDER`, `GSD_EMBEDDING_MODEL`, `GSD_EMBEDDING_API_KEY` env vars. Added `embedCorrection(entry)` that checks kill switch synchronously, then chains async work (provider.embed → index.addCorrection) onto `_embedChain` for serialization. Wired at all 3 `writeCorrection()` sites: passive monitoring drift corrections (~line 982), session correction detection loop (~line 1331), and stuck loop correction (~line 1371). All fire-and-forget — not awaited.

## Verification

- `npx vitest run src/resources/extensions/gsd/tests/embed-trigger.test.ts` — 9/9 pass
  - Success path: provider.embed + index.addCorrection called correctly
  - Null vector: addCorrection not called
  - Provider throws: swallowed, no throw
  - No provider: no embed attempt
  - Serialization: concurrent calls execute in order
  - Kill switch: skips entirely
  - Config from env vars: verified
  - addCorrection failure: swallowed
  - Singleton reuse: createEmbeddingProvider called once across multiple embedCorrection calls
- recall.test.ts and semantic-recall.test.ts are skeleton files (no test suites) — expected for intermediate task

## Diagnostics

- `VectorIndex.getStats()` — check `itemCount` to verify embeddings are being stored
- Embedding failures are caught and swallowed silently (D040) — no persistent failure state (S03 will add cost tracking)
- `_getEmbedChain()` — await to confirm all pending embeddings have completed (test use only)

## Deviations

- Site 1 (passive monitoring) required extracting the inline correction object into a `driftEntry` variable to pass to both `writeCorrection` and `embedCorrection`

## Known Issues

None

## Files Created/Modified

- `src/resources/extensions/gsd/auto.ts` — Added imports, singleton init, embedCorrection helper, wired at 3 call sites
- `src/resources/extensions/gsd/tests/embed-trigger.test.ts` — 9 test assertions for fire-and-forget embedding trigger
