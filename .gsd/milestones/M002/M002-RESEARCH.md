# M002 — Research

**Date:** 2026-03-12

## Summary

The current recall system (recall.ts) uses exact category:scope matching with a 10-slot cap and ~3K token budget — functional but unable to surface semantically similar past corrections when exact categories don't match. The research question is whether Qdrant (vector DB) and/or Neo4j (graph DB) meaningfully improve this.

**Primary recommendation: Start with Vectra (in-process, file-backed vector DB) for semantic recall, skip Neo4j entirely, and defer Qdrant to a "power user" tier.** The highest-impact improvement is semantic similarity search over corrections and preferences. This doesn't require a server — Vectra is a pure TypeScript, file-backed vector index that fits gsd-pi's zero-dependency model. Neo4j's relationship modeling is theoretically interesting but the data volume and query patterns in gsd-pi don't justify a graph database; the existing JSONL + category taxonomy already captures the relationships that matter.

The critical dependency is an embedding model. OpenAI's `text-embedding-3-small` is the pragmatic choice (1536 dims, $0.02/M tokens — negligible cost for correction-sized text). A local alternative (e.g., Ollama + nomic-embed-text) could be offered as a fallback for users who don't want API dependency.

## Recommendation

**Phase 1: Vectra + OpenAI embeddings for semantic recall (high impact, low complexity).** Replace the category-based filtering in `buildRecallBlock()` with vector similarity search. Embed corrections at write time (in `writeCorrection()`), query at dispatch time. Vectra stores everything as JSON files in `.gsd/patterns/vectors/` — no Docker, no server, no new infrastructure. Graceful degradation: if no embeddings exist, fall back to current category matching.

**Phase 2 (optional): Qdrant as opt-in upgrade for power users with large correction corpora (1000+).** Vectra is brute-force search — fine for hundreds of corrections but degrades at scale. Qdrant (via Docker or Qdrant Cloud) provides ANN indexing for users who accumulate massive correction histories across many projects.

**Skip Neo4j.** The file→decision→correction graph is interesting in theory, but gsd-pi's actual query patterns are: "what past mistakes are relevant to this task?" That's a vector similarity question, not a graph traversal question. The DECISIONS.md register and category taxonomy already provide the structural relationships needed.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| In-process vector search for Node.js | **Vectra** (`vectra` npm) | File-backed, pure TypeScript, Pinecone-like metadata filtering, zero native deps, works in npm package distribution |
| Vector search at scale (1000+ vectors) | **Qdrant** (`@qdrant/js-client-rest`) | Mature REST client (trust 9.8/10), ANN indexing, payload filtering, runs in Docker or cloud |
| Text embeddings | **OpenAI text-embedding-3-small** | 1536 dims, $0.02/M tokens, proven quality, gsd-pi already has provider infrastructure |
| Local embeddings without API | **Ollama + nomic-embed-text** | Runs locally, 768 dims, no API key needed, good quality for short text |
| Cosine similarity in SQLite | **sqlite-vec** | In-process but requires native extension — problematic for npm distribution |

## Existing Code and Patterns

- `src/resources/extensions/gsd/recall.ts` — **Primary integration point.** `buildRecallBlock()` currently does category-based filtering with 10-slot cap. Semantic search replaces the filtering logic; the token budget, slot allocation, and self-report append stay the same.
- `src/resources/extensions/gsd/corrections.ts` — **Embedding trigger point.** `writeCorrection()` is where embeddings should be generated (async, non-blocking). The structured `WriteResult` pattern must be preserved — embedding failure must not block correction writes.
- `src/resources/extensions/gsd/pattern-preferences.ts` — Preferences could also be embedded for richer recall. `readPreferences()` already supports scope filtering — vector search could replace or augment this.
- `src/resources/extensions/gsd/auto.ts` — Dispatch loop calls `buildRecallBlock()` synchronously via `buildCorrectionsVar()`. Vector queries must be fast (<50ms) or the recall block assembly must go async. Currently ~2476 lines — the post-completion block at line ~1800+ is where embedding could be triggered.
- `src/resources/extensions/gsd/metrics.ts` — Embedding API costs need tracking here. The existing `UnitMetrics` ledger with `formatCost()` can be extended.
- `src/resources/extensions/gsd/observer.ts` — Could benefit from semantic grouping of corrections (finding similar corrections across different categories), but this is a stretch goal, not a first-phase concern.
- `src/resources/extensions/gsd/prompt-loader.ts` — Template variable injection. No changes needed — `{{corrections}}` variable already handles the recall block.

## Constraints

- **npm distribution model**: gsd-pi ships as an npm package. Any dependency must be installable via `npm install` without native compilation or Docker. This rules out sqlite-vec (native extension) and makes Qdrant/Neo4j servers opt-in only.
- **Synchronous recall path**: `buildRecallBlock()` is synchronous and called from `loadPrompt()` vars. Either keep it sync (Vectra queries are sync-capable) or refactor `buildCorrectionsVar()` in auto.ts to be async.
- **Non-throwing I/O contract**: All correction/recall I/O returns structured results, never throws (D013). Embedding failures must follow this pattern — `{ written: true, embedded: false }`.
- **Kill switch must still work**: The `correction_capture` preference disables all correction I/O. Embedding should respect this.
- **Token budget is fixed at ~3K**: Semantic search changes *which* corrections are recalled, not *how many*. The 10-slot/3K-token budget from R007 stays.
- **Existing 550 test assertions must pass**: No breaking changes to existing module interfaces.

## Common Pitfalls

- **Embedding at write time blocks the dispatch loop** — Embedding must be async and fire-and-forget. If the embedding API is slow or down, the correction still gets written to JSONL; the vector index catches up later.
- **Requiring an API key for basic functionality** — Semantic recall should be an enhancement, not a requirement. If no embedding model is configured, fall back to current category-based recall. This preserves the zero-config experience.
- **Over-embedding low-value data** — Not everything needs embedding. Corrections with `correction_to` text are high value. Preferences already have `preference_text`. Don't embed metadata fields, timestamps, or categories — those are structured data for filtering.
- **Vector index growing unbounded** — Must respect the same rotation/retention semantics as corrections.jsonl. When corrections are archived/retired, their vectors should be removed from the active index.
- **Choosing too many dimensions** — For short correction text (typically 10-50 words), `text-embedding-3-small` at 1536 dims is overkill. Consider using the model's dimension reduction (512 dims) to reduce storage and speed up brute-force search.
- **Neo4j as a solution in search of a problem** — The relationship queries in the context doc ("what decisions led to regressions?") sound compelling but require a critical mass of structured data that gsd-pi doesn't have yet. Building a graph schema for data that fits in a single JSONL file is over-engineering.

## Open Risks

- **Vectra maturity** — Vectra is a small project (~351 GitHub stars as of search). It's simple enough that risk is low (it's basically JSON files + cosine similarity), but it could become unmaintained. Mitigation: the core is <500 lines — could be vendored if needed.
- **Embedding model lock-in** — Starting with OpenAI embeddings creates a dependency. Mitigation: abstract the embedding interface (`embed(text: string): Promise<number[]>`) so models can be swapped. Support Ollama as a local alternative from day one.
- **Async refactoring scope** — If `buildRecallBlock()` must become async, this touches `loadPrompt()` and potentially the entire prompt-loading pipeline. Vectra's in-memory index queries are fast enough to stay sync, but embedding generation is inherently async.
- **Cost tracking gap** — Embedding API calls need to flow through metrics.ts, but they happen outside the normal session token flow (Pi SDK tracks LLM tokens, not embedding API calls). Need a separate cost accumulator.
- **Cross-project vector indices** — User-level preferences promote to `~/.gsd/preferences.json`. Should vectors also promote? This adds complexity. Recommendation: keep vectors project-local in phase 1.

## Candidate Requirements (Advisory)

These emerged from research and should be considered during roadmap planning, but are not auto-binding:

| ID | Candidate | Rationale |
|----|-----------|-----------|
| CR-1 | Semantic recall via vector similarity search | Core value proposition — find relevant past corrections even when categories don't match |
| CR-2 | Embedding model abstraction (OpenAI + Ollama) | Avoid lock-in, support zero-API-key local mode |
| CR-3 | Graceful degradation to category-based recall | Zero-config users must not lose existing functionality |
| CR-4 | Async embedding at correction write time | Non-blocking — embedding failure must not block correction capture |
| CR-5 | Vector index rotation aligned with correction retention | Prevent unbounded growth |
| CR-6 | Embedding cost tracking in metrics ledger | Observability — users should see embedding costs alongside LLM costs |
| CR-7 | Optional Qdrant backend for power users | Scalability path for large correction corpora |

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Qdrant | `davila7/claude-code-templates@qdrant-vector-search` (351 installs) | available — relevant if Qdrant phase proceeds |
| Neo4j | `tomasonjo/blogs@neo4j-cypher-guide` (86 installs) | available — not recommended (Neo4j deprioritized) |

No skills recommended for installation. The implementation is primarily TypeScript integration work using existing patterns, not framework-specific.

## Sources

- Qdrant JS client API: upsert, search, collections, gRPC support (source: [Context7 /qdrant/qdrant-js](https://context7.com/qdrant/qdrant-js))
- Neo4j JavaScript driver: session.run(), transactions, async iterators (source: [Context7 /neo4j/neo4j-javascript-driver](https://context7.com/neo4j/neo4j-javascript-driver))
- sqlite-vec benchmarks: brute-force performance at various scales, 100ms target for <100k vectors (source: [sqlite-vec v0.1.0 release blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html))
- Vectra: file-backed in-process vector DB for Node.js, LocalIndex API, metadata filtering (source: [GitHub Stevenic/vectra](https://github.com/Stevenic/vectra))
- Existing codebase: recall.ts (10-slot/3K token recall), corrections.ts (JSONL I/O), auto.ts (dispatch loop), pattern-preferences.ts (preference promotion)
