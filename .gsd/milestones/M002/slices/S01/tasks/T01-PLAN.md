---
estimated_steps: 5
estimated_files: 2
---

# T01: Create EmbeddingProvider interface and implementations

**Slice:** S01 — Embedding Abstraction & Vector Index
**Milestone:** M002

## Description

Build the `EmbeddingProvider` abstraction: an interface with `embed(text): Promise<EmbedResult>`, concrete implementations for OpenAI (`text-embedding-3-small`) and Ollama (local HTTP), and a factory function that returns the correct provider or `null` when unconfigured. All operations are non-throwing per D013.

## Steps

1. Define types: `EmbeddingConfig` (provider name, model, apiKey, baseUrl, dimensions), `EmbedResult` ({ vector: number[] | null, error?: string }), `EmbeddingProvider` interface
2. Implement `OpenAIEmbeddingProvider` — uses openai SDK `client.embeddings.create()`, catches errors into `EmbedResult.error`
3. Implement `OllamaEmbeddingProvider` — HTTP POST to `baseUrl/api/embeddings` with `{model, prompt}`, catches errors into `EmbedResult.error`
4. Implement `createEmbeddingProvider(config): EmbeddingProvider | null` — returns null if config is missing/empty, otherwise instantiates the correct provider
5. Write tests: factory returns null for no config, factory returns OpenAI/Ollama for valid config, embed() returns structured result (mock the HTTP/SDK layer), error cases return `{vector: null, error: string}`

## Must-Haves

- [ ] `EmbeddingProvider` interface with `embed(text: string): Promise<EmbedResult>`
- [ ] `EmbedResult` type: `{ vector: number[] | null, error?: string }`
- [ ] OpenAI provider using `text-embedding-3-small`, configurable dimensions
- [ ] Ollama provider using local HTTP endpoint
- [ ] Factory returns `null` when no model configured (graceful degradation per D039)
- [ ] Non-throwing contract — errors in `EmbedResult.error`, never thrown (D013)
- [ ] Tests cover all factory paths and error handling

## Verification

- `npm test -- --grep "embedding"` passes all assertions
- No existing tests broken

## Observability Impact

- Signals added/changed: `EmbedResult.error` field provides structured failure information for any embedding call
- How a future agent inspects this: check `EmbedResult.error` string for failure reason; check `EmbedResult.vector` length for dimension validation
- Failure state exposed: provider name + error message in `EmbedResult.error`

## Inputs

- `src/resources/extensions/gsd/correction-types.ts` — `CorrectionEntry` type for metadata shape reference
- D013 (non-throwing contract), D038 (embedding model strategy), D039 (graceful degradation)

## Expected Output

- `src/resources/extensions/gsd/embedding.ts` — complete module with types, interface, two providers, factory
- `src/resources/extensions/gsd/tests/embedding.test.ts` — test suite covering factory, providers, error handling
