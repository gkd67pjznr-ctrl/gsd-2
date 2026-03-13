# M002: Knowledge Infrastructure — Qdrant & Neo4j Integration Research

**Gathered:** 2026-03-12
**Status:** Ready for research

## Project Description

Research and evaluate integrating Qdrant (vector database) and Neo4j (graph database) into gsd-pi to give the agent richer memory, semantic retrieval, and relationship-aware reasoning across sessions, projects, and codebases.

## Why This Milestone

GSD-pi already has correction capture, preference learning, and recall injection (M001), but these systems use flat JSONL files with simple text matching. The current recall system is limited to exact-category lookups with a 10-slot cap. There's no semantic similarity search, no way to find "similar past problems," and no way to model relationships between code entities, decisions, patterns, and outcomes.

Qdrant could provide **semantic memory** — embed corrections, decisions, code patterns, and session context as vectors, enabling the agent to retrieve contextually relevant past experience even when the exact category or keywords don't match.

Neo4j could provide **relationship-aware reasoning** — model the graph of files → decisions → corrections → preferences → milestones → outcomes, enabling queries like "what decisions led to regressions in this area?" or "what patterns work well for this type of task?"

Together, they could transform gsd-pi from a stateless-per-session agent with simple recall into one with deep, queryable project memory.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Understand whether Qdrant, Neo4j, or both provide meaningful capability improvements to gsd-pi's agent memory and reasoning
- See a concrete implementation plan with architecture, integration points, and risk assessment
- Make an informed go/no-go decision on proceeding to implementation

### Entry point / environment

- Entry point: Research artifacts in `.gsd/milestones/M002/`
- Environment: local dev
- Live dependencies involved: Qdrant (local Docker or cloud), Neo4j (local Docker or Aura cloud) — for prototyping only

## Completion Class

- Contract complete means: Research document with clear recommendation, architecture sketch, integration point analysis, and prototype findings
- Integration complete means: N/A (research milestone)
- Operational complete means: N/A (research milestone)

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- A clear recommendation exists for which database(s) to integrate, in what order, and why
- Integration points with existing gsd-pi modules are mapped and feasibility is assessed
- At least one proof-of-concept demonstrates the core value proposition (semantic recall or relationship queries)

## Risks and Unknowns

- **Embedding cost and latency** — every correction/decision/context needs embedding; unclear if this adds unacceptable overhead to auto-mode task dispatch
- **Deployment complexity** — requiring Docker or cloud services raises the barrier for gsd-pi users significantly vs. current zero-dependency file-based approach
- **TypeScript client maturity** — need to verify Qdrant and Neo4j have solid TypeScript/Node.js clients
- **Value vs. complexity tradeoff** — flat files with simple recall may be "good enough" for most use cases; the added infrastructure may not justify the improvement
- **Embedding model selection** — which model to use for embeddings, whether to require an API key (OpenAI) or use a local model
- **Data model design** — what exactly gets embedded/graphed, at what granularity, and how it maps to existing gsd-pi concepts

## Existing Codebase / Prior Art

- `src/resources/extensions/gsd/corrections.ts` — Current correction I/O (JSONL read/write); any vector/graph integration would supplement or replace the recall path
- `src/resources/extensions/gsd/recall.ts` — Current recall injection into dispatch prompts; this is the primary integration point for semantic retrieval
- `src/resources/extensions/gsd/pattern-preferences.ts` — Preference promotion from corrections; graph relationships could enhance pattern detection
- `src/resources/extensions/gsd/observer.ts` — Cross-scope pattern analysis; could benefit from graph traversal for deeper pattern discovery
- `src/resources/extensions/gsd/auto.ts` — The dispatch loop; any new retrieval must fit into the existing task dispatch flow without adding significant latency
- `src/resources/extensions/gsd/metrics.ts` — Token/cost tracking; embedding API calls would need cost tracking
- `src/resources/extensions/gsd/passive-monitor.ts` — Drift detection; graph-based drift analysis could be more powerful

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- This is exploratory — no existing requirements. Research may produce new requirements for a future implementation milestone.

## Scope

### In Scope

- Evaluate Qdrant for semantic memory (embedding corrections, decisions, code context, session summaries)
- Evaluate Neo4j for relationship modeling (file→decision→correction→outcome graphs, cross-project knowledge)
- Assess TypeScript client libraries for both
- Assess deployment options (local Docker, cloud, embedded/in-process alternatives)
- Assess embedding model options (OpenAI API, local models, cost tradeoffs)
- Map integration points with existing gsd-pi modules
- Build minimal proof-of-concept for the most promising approach
- Produce go/no-go recommendation with implementation roadmap

### Out of Scope / Non-Goals

- Full production implementation (that's a future milestone if research recommends proceeding)
- Benchmarking at scale (research-level prototyping only)
- Modifying existing M001 adaptive intelligence modules (research only)
- Building a general-purpose RAG system (focus is on gsd-pi's specific agent memory needs)

## Technical Constraints

- gsd-pi is a TypeScript CLI distributed as an npm package — any integration must work in that context
- Current users have zero external dependencies beyond Node.js — adding Docker/cloud requirements is a significant UX change
- Auto-mode dispatches tasks in tight loops — retrieval latency must not significantly slow dispatch
- The Pi SDK controls session lifecycle — integration must work within Pi's extension model
- Existing JSONL/file-based systems must continue to work as fallback (graceful degradation)

## Integration Points

- **recall.ts** — Primary candidate for semantic retrieval enhancement (replace or augment category-based recall)
- **corrections.ts** — Source data for embeddings (corrections are the richest structured learning data)
- **auto.ts** — Dispatch loop where retrieval happens; latency-sensitive
- **pattern-preferences.ts** — Could use graph queries for richer pattern detection
- **observer.ts** — Could traverse relationship graphs for deeper cross-scope analysis
- **metrics.ts** — Would need to track embedding/query costs
- **prompt-loader.ts** — Template variable injection point for retrieved context

## Open Questions

- Should embedding happen synchronously during correction capture, or asynchronously in the background?
- Is there an in-process vector DB (like SQLite-vec or lance) that avoids the Docker/cloud dependency?
- Could Neo4j be replaced by a lighter graph solution (e.g., graph queries over SQLite, or an in-memory graph)?
- What's the minimum viable data model — what gets embedded first for maximum impact?
- How does this interact with Context7's existing documentation retrieval?
- Should this be an optional "power user" feature behind a preference flag, or a core capability?
