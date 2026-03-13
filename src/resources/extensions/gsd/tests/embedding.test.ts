/**
 * Tests for embedding provider abstraction — factory, providers, error handling.
 * Uses mock HTTP via globalThis.fetch override. No real API calls (D041).
 */

import { strict as assert } from "node:assert";
import {
  createEmbeddingProvider,
  OpenAIEmbeddingProvider,
  OllamaEmbeddingProvider,
} from "../embedding.ts";
import type { EmbeddingConfig, EmbedResult } from "../embedding.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((err: unknown) => { failed++; console.log(`  ✗ ${name}: ${err}`); });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, opts: RequestInit) => { status: number; body: unknown }) {
  (globalThis as any).fetch = async (url: string | URL, opts?: RequestInit) => {
    const result = handler(String(url), opts || {} as RequestInit);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      statusText: `HTTP ${result.status}`,
      text: async () => typeof result.body === 'string' ? result.body : JSON.stringify(result.body),
      json: async () => result.body,
    } as Response;
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// ─── Factory Tests ────────────────────────────────────────────────────────────

console.log("\nEmbedding Factory:");

await test("returns null for undefined config", () => {
  assert.equal(createEmbeddingProvider(undefined), null);
});

await test("returns null for null config", () => {
  assert.equal(createEmbeddingProvider(null), null);
});

await test("returns null for config without provider", () => {
  assert.equal(createEmbeddingProvider({ provider: '' as any, model: 'x' }), null);
});

await test("returns null for config without model", () => {
  assert.equal(createEmbeddingProvider({ provider: 'openai', model: '' }), null);
});

await test("returns OpenAI provider for openai config", () => {
  const p = createEmbeddingProvider({ provider: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-test' });
  assert.notEqual(p, null);
  assert.equal(p!.name, 'openai');
  assert(p instanceof OpenAIEmbeddingProvider);
});

await test("returns Ollama provider for ollama config", () => {
  const p = createEmbeddingProvider({ provider: 'ollama', model: 'nomic-embed-text' });
  assert.notEqual(p, null);
  assert.equal(p!.name, 'ollama');
  assert(p instanceof OllamaEmbeddingProvider);
});

await test("returns null for unknown provider", () => {
  assert.equal(createEmbeddingProvider({ provider: 'unknown' as any, model: 'x' }), null);
});

// ─── OpenAI Provider Tests ────────────────────────────────────────────────────

console.log("\nOpenAI Provider:");

await test("embed returns vector on success", async () => {
  const provider = new OpenAIEmbeddingProvider({ provider: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-test' });
  const testVector = [0.1, 0.2, 0.3];

  mockFetch((url, opts) => {
    assert(url.includes('/v1/embeddings'));
    const body = JSON.parse(opts.body as string);
    assert.equal(body.model, 'text-embedding-3-small');
    return { status: 200, body: { data: [{ embedding: testVector }] } };
  });

  const result = await provider.embed("test text");
  restoreFetch();

  assert.deepEqual(result.vector, testVector);
  assert.equal(result.error, undefined);
});

await test("embed sends dimensions when configured", async () => {
  const provider = new OpenAIEmbeddingProvider({ provider: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-test', dimensions: 256 });

  mockFetch((_url, opts) => {
    const body = JSON.parse(opts.body as string);
    assert.equal(body.dimensions, 256);
    return { status: 200, body: { data: [{ embedding: [0.1] }] } };
  });

  const result = await provider.embed("test");
  restoreFetch();

  assert.deepEqual(result.vector, [0.1]);
});

await test("embed returns error on HTTP failure", async () => {
  const provider = new OpenAIEmbeddingProvider({ provider: 'openai', model: 'text-embedding-3-small', apiKey: 'bad' });

  mockFetch(() => ({ status: 401, body: 'Unauthorized' }));

  const result = await provider.embed("test");
  restoreFetch();

  assert.equal(result.vector, null);
  assert(result.error!.includes('openai'));
  assert(result.error!.includes('401'));
});

await test("embed returns error on malformed response", async () => {
  const provider = new OpenAIEmbeddingProvider({ provider: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-test' });

  mockFetch(() => ({ status: 200, body: { data: [] } }));

  const result = await provider.embed("test");
  restoreFetch();

  assert.equal(result.vector, null);
  assert(result.error!.includes('no embedding'));
});

await test("embed returns error on network failure (never throws)", async () => {
  const provider = new OpenAIEmbeddingProvider({ provider: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-test', baseUrl: 'http://localhost:1' });

  // Use a fetch that throws to simulate network error
  (globalThis as any).fetch = async () => { throw new Error('ECONNREFUSED'); };

  const result = await provider.embed("test");
  restoreFetch();

  assert.equal(result.vector, null);
  assert(result.error!.includes('ECONNREFUSED'));
});

// ─── Ollama Provider Tests ────────────────────────────────────────────────────

console.log("\nOllama Provider:");

await test("embed returns vector on success", async () => {
  const provider = new OllamaEmbeddingProvider({ provider: 'ollama', model: 'nomic-embed-text' });
  const testVector = [0.4, 0.5, 0.6];

  mockFetch((url, opts) => {
    assert(url.includes('/api/embeddings'));
    const body = JSON.parse(opts.body as string);
    assert.equal(body.model, 'nomic-embed-text');
    assert.equal(body.prompt, 'hello world');
    return { status: 200, body: { embedding: testVector } };
  });

  const result = await provider.embed("hello world");
  restoreFetch();

  assert.deepEqual(result.vector, testVector);
  assert.equal(result.error, undefined);
});

await test("embed returns error on HTTP failure", async () => {
  const provider = new OllamaEmbeddingProvider({ provider: 'ollama', model: 'nomic-embed-text' });

  mockFetch(() => ({ status: 500, body: 'model not found' }));

  const result = await provider.embed("test");
  restoreFetch();

  assert.equal(result.vector, null);
  assert(result.error!.includes('ollama'));
  assert(result.error!.includes('500'));
});

await test("embed returns error on network failure (never throws)", async () => {
  const provider = new OllamaEmbeddingProvider({ provider: 'ollama', model: 'nomic-embed-text', baseUrl: 'http://localhost:1' });

  (globalThis as any).fetch = async () => { throw new Error('ECONNREFUSED'); };

  const result = await provider.embed("test");
  restoreFetch();

  assert.equal(result.vector, null);
  assert(result.error!.includes('ECONNREFUSED'));
});

await test("embed returns error on malformed response", async () => {
  const provider = new OllamaEmbeddingProvider({ provider: 'ollama', model: 'nomic-embed-text' });

  mockFetch(() => ({ status: 200, body: {} }));

  const result = await provider.embed("test");
  restoreFetch();

  assert.equal(result.vector, null);
  assert(result.error!.includes('no embedding'));
});

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed ✓");
}
