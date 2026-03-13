# S02: Semantic Recall in Dispatch

**Goal:** `buildRecallBlock()` uses vector similarity when embeddings exist, falls back to category matching when they don't, and `writeCorrection()` call sites in auto.ts trigger async embedding — proven by tests and real dispatch path.
**Demo:** Run tests showing: (1) buildRecallBlock with vector index returns semantically relevant corrections ranked by similarity, (2) buildRecallBlock without embeddings returns identical output to current category-based logic, (3) async embedding trigger fires after writeCorrection and handles failures gracefully.

## Must-Haves

- `buildRecallBlock()` becomes async, queries `VectorIndex` when provider+index available
- Fallback: when no embedding provider configured, `buildRecallBlock()` returns identical output to current sync implementation
- `buildCorrectionsVar()` in auto.ts becomes async, call site at line 1598 awaits it
- Async embedding trigger after each `writeCorrection()` call in auto.ts (fire-and-forget, non-throwing per D040)
- Embedding failures never block correction capture or dispatch
- Kill switch (`correction_capture: false`) disables both embedding and vector recall
- Token budget (3K / 10 slots) preserved — semantic search changes *which* corrections, not how many
- Self-report instructions still appended after recall block
- All 550+ existing M001 tests pass
- Embedding config read from env vars (`GSD_EMBEDDING_PROVIDER`, `GSD_EMBEDDING_MODEL`)

## Proof Level

- This slice proves: integration — real `buildRecallBlock()` async path with VectorIndex (mock provider, real Vectra index), real auto.ts wiring changes
- Real runtime required: no — mock embedding providers with fixture vectors prove behavior deterministically
- Human/UAT required: no — deferred to milestone-level UAT

## Verification

- `npx vitest run src/resources/extensions/gsd/tests/semantic-recall.test.ts` — async buildRecallBlock with vector path, fallback path, kill switch, token budget, self-report preservation
- `npx vitest run src/resources/extensions/gsd/tests/embed-trigger.test.ts` — async embedding trigger, fire-and-forget, failure isolation, serialization
- `npx vitest run src/resources/extensions/gsd/tests/recall.test.ts` — existing 22 recall tests still pass (backward compat)
- `npx vitest run` — full suite passes (550+ M001 + 37 S01 + new S02 assertions)

## Observability / Diagnostics

- Runtime signals: `embeddingResult` field on write sites indicates embed success/failure/skipped; `EmbedResult.error` preserves provider+reason
- Inspection surfaces: `VectorIndex.getStats()` for index health; `buildRecallBlock()` output inspectable via `{{corrections}}` template variable
- Failure visibility: embedding errors logged but swallowed — surfaced via `EmbedResult.error` string in debug scenarios
- Redaction constraints: API keys never logged; only provider name + HTTP status in error strings

## Integration Closure

- Upstream surfaces consumed: `EmbeddingProvider` + `createEmbeddingProvider()` from `embedding.ts`, `VectorIndex` from `vector-index.ts`, `writeCorrection()` from `corrections.ts`, existing `buildRecallBlock()` from `recall.ts`
- New wiring introduced in this slice: `buildRecallBlock()` async with vector query path in `recall.ts`; `buildCorrectionsVar()` async in `auto.ts`; embedding trigger after `writeCorrection()` calls in `auto.ts`
- What remains before the milestone is truly usable end-to-end: S03 cost tracking for embedding API calls, vector index rotation aligned with correction rotation

## Tasks

- [x] **T01: Make buildRecallBlock async with vector query path and fallback** `est:1h`
  - Why: Core integration — extends recall.ts to query VectorIndex when available, preserving existing category-based logic as fallback
  - Files: `src/resources/extensions/gsd/recall.ts`, `src/resources/extensions/gsd/tests/semantic-recall.test.ts`
  - Do: Make `buildRecallBlock()` async. Add optional `provider`/`vectorIndex` params. When both present, embed task context via provider, query vectorIndex for similar corrections, use scored results in slot allocation (preferences still first). When absent, execute existing sync logic unchanged. Create test file with assertions for vector path, fallback path, kill switch, token budget, self-report.
  - Verify: `npx vitest run src/resources/extensions/gsd/tests/semantic-recall.test.ts` passes; `npx vitest run src/resources/extensions/gsd/tests/recall.test.ts` still passes
  - Done when: async buildRecallBlock returns semantically relevant corrections from vector index AND returns identical output to current logic when no provider/index given

- [x] **T02: Wire async embedding trigger into auto.ts writeCorrection sites** `est:45m`
  - Why: Completes the write side — corrections get embedded asynchronously after capture, populating the vector index for future recall
  - Files: `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/tests/embed-trigger.test.ts`
  - Do: Add `embedCorrection()` helper in auto.ts that calls `provider.embed(entry.correction_to)` then `vectorIndex.addCorrection(entry, vector)`, wrapped in try/catch (fire-and-forget per D040). Call after each `writeCorrection()` at lines 927, 1274, 1312. Add singleton `VectorIndex` + `EmbeddingProvider` initialization (lazy, once per auto-mode run). Read embedding config from env vars. Create test file proving fire-and-forget, failure isolation, skip when no provider.
  - Verify: `npx vitest run src/resources/extensions/gsd/tests/embed-trigger.test.ts` passes
  - Done when: embedding trigger fires after successful writeCorrection, failures are swallowed, no provider means no embedding attempt

- [x] **T03: Wire async buildCorrectionsVar in auto.ts and verify full integration** `est:30m`
  - Why: Connects the read side — makes buildCorrectionsVar async so dispatch prompts use semantic recall when available
  - Files: `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/tests/semantic-recall.test.ts`
  - Do: Make `buildCorrectionsVar()` async, await `buildRecallBlock()` with provider/vectorIndex params. Update call site at line 1598 to `await buildCorrectionsVar()`. Add integration assertions to semantic-recall.test.ts proving the full path: correction written → embedded → buildRecallBlock returns it via vector similarity. Run full test suite.
  - Verify: `npx vitest run` — full suite passes including all existing M001 (550+), S01 (37), and new S02 tests
  - Done when: `buildCorrectionsVar()` is async, dispatch prompts use semantic recall when provider configured, all tests green

## Files Likely Touched

- `src/resources/extensions/gsd/recall.ts`
- `src/resources/extensions/gsd/auto.ts`
- `src/resources/extensions/gsd/tests/semantic-recall.test.ts`
- `src/resources/extensions/gsd/tests/embed-trigger.test.ts`
