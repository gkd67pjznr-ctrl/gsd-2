# S02: Semantic Recall in Dispatch — Research

**Date:** 2026-03-12

## Summary

S02 wires S01's `EmbeddingProvider` and `VectorIndex` into the existing correction capture and recall paths. The work has two integration points: (1) `writeCorrection()` in `corrections.ts` or auto.ts post-completion triggers async embedding, and (2) `buildRecallBlock()` in `recall.ts` queries vectors when available, falling back to category matching when not.

The primary challenge is that `buildRecallBlock()` is synchronous (called from `buildCorrectionsVar()` in auto.ts line 1182, consumed by `loadPrompt()` vars at line 1598). Vector queries via Vectra are async. The cleanest approach is making `buildCorrectionsVar()` async and awaiting it in auto.ts — the call site at line 1598 is already inside an async function. `buildRecallBlock()` itself should become async with a sync fallback path for the no-embeddings case.

For the embedding trigger, the three `writeCorrection()` call sites in auto.ts (lines 927, 1274, 1312) are the natural points. Rather than modifying `writeCorrection()` itself (which is synchronous by design per D013), a wrapper function in auto.ts can fire-and-forget the embedding after a successful write. This keeps corrections.ts unchanged and embedding concerns in the dispatch layer.

## Recommendation

**Two-module approach:**

1. **Extend `recall.ts`**: Make `buildRecallBlock()` async. When a `VectorIndex` is initialized and an `EmbeddingProvider` is available, embed the current task context and query similar corrections. Otherwise, fall back to existing category-based logic unchanged.

2. **Add embedding trigger in `auto.ts`**: After each `writeCorrection()` call that returns `{ written: true }`, fire-and-forget `embedCorrection(entry)` which calls `provider.embed()` then `index.addCorrection()`. Wrap in try/catch — never block, never throw.

3. **Make `buildCorrectionsVar()` async**: Change from `return buildRecallBlock()` to `return await buildRecallBlock()`. Update the call site at line 1598 to await it.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Vector storage + cosine search | `VectorIndex` (S01) | Already wraps Vectra, proven in 11 tests |
| Text embedding | `EmbeddingProvider` (S01) | OpenAI/Ollama with graceful null factory |
| Correction I/O | `writeCorrection()` / `readCorrections()` | Stable, tested, non-throwing |
| Recall assembly + token budget | `buildRecallBlock()` | Existing 3K budget, 10-slot cap, self-report append |

## Existing Code and Patterns

- `src/resources/extensions/gsd/recall.ts` — **Primary modification target.** `buildRecallBlock()` currently reads corrections + preferences, deduplicates, applies slot allocation, enforces token budget. The vector path replaces the "read corrections → filter → sort" section with "embed context → querySimilar → use scored results". Preferences-first allocation and token budget stay the same.
- `src/resources/extensions/gsd/auto.ts:1182` — `buildCorrectionsVar()` is a sync wrapper around `buildRecallBlock()`. Must become async. Call site at line 1598 is inside `buildExecuteTaskPrompt()` which is already async.
- `src/resources/extensions/gsd/auto.ts:927,1274,1312` — Three `writeCorrection()` call sites. Each should trigger embedding after successful write. All are already in try/catch blocks.
- `src/resources/extensions/gsd/corrections.ts:80` — `writeCorrection()` returns `WriteResult { written: boolean, reason?: string }`. S02 should NOT modify this function — embedding is a side-effect of auto.ts, not of correction I/O.
- `src/resources/extensions/gsd/embedding.ts` — `createEmbeddingProvider(config)` returns `null` when unconfigured. S02 needs to read embedding config from somewhere — likely `preferences.md` frontmatter or a new `embedding` section.
- `src/resources/extensions/gsd/vector-index.ts` — `VectorIndex` needs a storage path. Convention from roadmap: `.gsd/patterns/vectors/`. Singleton instance in auto.ts, initialized once per auto-mode run.

## Constraints

- `buildRecallBlock()` is currently sync and non-throwing. Making it async changes the contract — all callers must be updated. Only known caller is `buildCorrectionsVar()` in auto.ts.
- `WriteResult` interface must not change (D013). Embedding status communicated via separate `embeddingResult` field or return value from the wrapper.
- Token budget stays at 3K / 10 slots (R007). Semantic search changes *which* corrections, not how many.
- Kill switch (`correction_capture: false`) must disable both embedding and vector recall.
- All 550+ existing M001 tests must pass — no breaking interface changes.
- Embedding config must be discoverable without a new config file. Options: `preferences.md` frontmatter field (`embedding_provider`, `embedding_model`, `embedding_api_key`), or env vars (`GSD_EMBEDDING_PROVIDER`, `GSD_EMBEDDING_MODEL`).

## Common Pitfalls

- **Making recall async breaks loadPrompt()** — If `buildRecallBlock()` becomes async, verify that `loadPrompt()` in `prompt-loader.ts` doesn't call it directly. From the code, it's only called via `buildCorrectionsVar()` in auto.ts, not from prompt-loader. Safe to make async.
- **Embedding the wrong text** — For recall queries, embed the *task context* (unit type + task plan summary), not the full prompt. For correction storage, embed `correction_to` text (the lesson learned), not `correction_from` (what went wrong).
- **Singleton VectorIndex not initialized** — `VectorIndex.initialize()` is async and must be called before queries. Use lazy initialization with a module-level promise.
- **Race condition on concurrent embeddings** — Multiple `writeCorrection()` calls in rapid succession could race on `addCorrection()`. Vectra's `LocalIndex` may not handle concurrent writes. Solution: serialize embedding writes via a promise chain.
- **No embedding config source defined yet** — S01 created `EmbeddingConfig` type but there's no code to read it from user config. Need to define where config lives before implementation.

## Open Risks

- **Async refactor scope** — Making `buildCorrectionsVar()` async could cascade if `loadPrompt()` or other code paths also use it. Need to verify there are no other callers. Grep shows only auto.ts uses it.
- **Embedding config location** — No established pattern for embedding-specific config. Using preferences.md frontmatter is consistent but adds fields to an already-used file. Env vars are simpler but less discoverable.
- **Task context for recall query** — What text to embed for the similarity query at dispatch time? The task plan title + description is the obvious choice, but it needs to be extracted from the task plan file, which is already loaded at that point in auto.ts.
- **VectorIndex initialization latency** — First `initialize()` call creates the Vectra index directory and loads existing items. If there are many stored vectors, this could add startup latency to auto-mode. Likely negligible for <100 vectors.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Vectra | none found in `<available_skills>` | N/A — pure integration work using existing S01 modules |

No external skills needed. This is TypeScript integration work using patterns already established in M001 and S01.

## Sources

- `recall.ts` — current sync `buildRecallBlock()` implementation (codebase)
- `auto.ts` — dispatch loop, `buildCorrectionsVar()`, `writeCorrection()` call sites (codebase)
- `embedding.ts` / `vector-index.ts` — S01 outputs (codebase)
- S01 summary — forward intelligence on VectorIndex API and EmbedResult contract (`.gsd/milestones/M002/slices/S01/S01-SUMMARY.md`)
