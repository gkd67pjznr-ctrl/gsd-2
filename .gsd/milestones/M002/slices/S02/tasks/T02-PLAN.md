---
estimated_steps: 5
estimated_files: 3
---

# T02: Wire async embedding trigger into auto.ts writeCorrection sites

**Slice:** S02 — Semantic Recall in Dispatch
**Milestone:** M002

## Description

Add fire-and-forget async embedding after each `writeCorrection()` call in auto.ts. Create singleton `EmbeddingProvider` + `VectorIndex` initialization. Embedding failures are swallowed per D040 — never block dispatch or correction capture.

## Steps

1. Read the three `writeCorrection()` call sites in auto.ts (lines ~927, ~1274, ~1312) to understand their error handling context
2. Add module-level lazy initialization for `EmbeddingProvider` (via `createEmbeddingProvider()` reading from env vars `GSD_EMBEDDING_PROVIDER`, `GSD_EMBEDDING_MODEL`, `GSD_EMBEDDING_API_KEY`) and `VectorIndex` (at `.gsd/patterns/vectors/`). Use a singleton promise pattern — initialize once, reuse.
3. Add `embedCorrection(entry: CorrectionEntry): void` function that: gets provider+index singletons, if either null returns immediately, otherwise calls `provider.embed(entry.correction_to)`, checks `result.vector`, calls `index.addCorrection(entry, vector)`. Entire body in try/catch — never throws. Serialize via promise chain to avoid concurrent Vectra writes.
4. Call `embedCorrection(correction)` after each `writeCorrection()` call at the three sites. Fire-and-forget — do not await.
5. Create `tests/embed-trigger.test.ts` with assertions: (a) embedCorrection calls provider.embed + index.addCorrection on success, (b) embed failure doesn't throw, (c) no provider means no embed attempt, (d) serialization — concurrent calls don't race, (e) kill switch skips embedding.

## Must-Haves

- [ ] `embedCorrection()` is fire-and-forget (not awaited at call sites)
- [ ] Embedding failures are caught and swallowed — never block dispatch
- [ ] No provider configured → no embedding attempt (no error, no log)
- [ ] Concurrent embeddings serialized via promise chain
- [ ] Kill switch (`correction_capture: false`) skips embedding
- [ ] Embedding config read from env vars

## Verification

- `npx vitest run src/resources/extensions/gsd/tests/embed-trigger.test.ts` — all assertions pass
- `npx vitest run` — no regressions in existing tests

## Observability Impact

- Signals added/changed: `embedCorrection()` is silent on success and failure — observable only via `VectorIndex.getStats()` item count increasing
- How a future agent inspects this: call `VectorIndex.getStats()` to verify embeddings are being stored; check `EmbedResult.error` during debugging
- Failure state exposed: embedding errors are caught but not persisted (acceptable — S03 will add cost tracking which also tracks failures)

## Inputs

- `src/resources/extensions/gsd/auto.ts` — writeCorrection call sites at lines ~927, ~1274, ~1312
- `src/resources/extensions/gsd/embedding.ts` — `createEmbeddingProvider()`, `EmbeddingConfig`
- `src/resources/extensions/gsd/vector-index.ts` — `VectorIndex`, `addCorrection()`
- T01 output — `buildRecallBlock()` is now async (confirms the async pattern is established)

## Expected Output

- `src/resources/extensions/gsd/auto.ts` — singleton provider/index init, `embedCorrection()` helper, wired at 3 call sites
- `src/resources/extensions/gsd/tests/embed-trigger.test.ts` — ~10 assertions proving fire-and-forget, failure isolation, serialization
