---
id: T01
parent: S01
milestone: M002
provides:
  - EmbeddingProvider interface and types
  - OpenAI and Ollama embedding provider implementations
  - createEmbeddingProvider factory function
key_files:
  - src/resources/extensions/gsd/embedding.ts
  - src/resources/extensions/gsd/tests/embedding.test.ts
key_decisions:
  - Used raw fetch instead of openai SDK (no new dependency needed)
patterns_established:
  - Non-throwing embed() returns EmbedResult with vector or error
  - Mock fetch pattern for testing HTTP providers
observability_surfaces:
  - EmbedResult.error contains provider name + failure reason
duration: 1 step
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T01: Create EmbeddingProvider interface and implementations

**Built EmbeddingProvider abstraction with OpenAI and Ollama implementations, factory function, and 16-test suite — all non-throwing per D013.**

## What Happened

Created `embedding.ts` with:
- Types: `EmbeddingConfig`, `EmbedResult`, `EmbeddingProvider` interface
- `OpenAIEmbeddingProvider` — POST to `/v1/embeddings` with configurable dimensions
- `OllamaEmbeddingProvider` — POST to `/api/embeddings` with `{model, prompt}`
- `createEmbeddingProvider(config)` — returns null when config missing/empty, correct provider otherwise

Used raw `fetch` for both providers instead of adding `openai` SDK dependency — keeps the module lightweight and consistent.

## Verification

- `npx tsx src/resources/extensions/gsd/tests/embedding.test.ts` — 16/16 passed
- Factory: null for undefined/null/empty/unknown configs, correct providers for openai/ollama
- Providers: success vectors, HTTP errors, network failures, malformed responses — all non-throwing
- Existing tests unaffected (spot-checked correction-types.test.ts)

### Slice-level checks:
- ✅ `embedding` tests pass (16/16)
- ⬜ `vector-index` tests — not yet created (T02)
- ⬜ Full test suite — deferred to final task

## Diagnostics

- `EmbedResult.error` string format: `"{provider}: {reason}"` — includes HTTP status for API failures
- `EmbedResult.vector` is `number[] | null` — check length for dimension validation

## Deviations

Used raw fetch instead of openai SDK — avoids adding a dependency; API surface is simple enough.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/embedding.ts` — types, interface, two providers, factory
- `src/resources/extensions/gsd/tests/embedding.test.ts` — 16 tests covering all paths
