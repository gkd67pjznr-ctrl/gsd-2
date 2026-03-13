// GSD Extension — Embedding Provider Abstraction
// Provides EmbeddingProvider interface with OpenAI and Ollama implementations.
// All operations are non-throwing per D013 — errors surface in EmbedResult.error.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmbeddingConfig {
  provider: 'openai' | 'ollama';
  model: string;
  apiKey?: string;
  baseUrl?: string;
  dimensions?: number;
}

export interface EmbedResult {
  vector: number[] | null;
  error?: string;
}

export interface EmbeddingProvider {
  readonly name: string;
  embed(text: string): Promise<EmbedResult>;
}

// ─── OpenAI Provider ──────────────────────────────────────────────────────────

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  private readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly dimensions: number | undefined;

  constructor(config: EmbeddingConfig) {
    this.model = config.model || 'text-embedding-3-small';
    this.apiKey = config.apiKey || '';
    this.baseUrl = (config.baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
    this.dimensions = config.dimensions;
  }

  async embed(text: string): Promise<EmbedResult> {
    try {
      const body: Record<string, unknown> = {
        input: text,
        model: this.model,
      };
      if (this.dimensions != null) {
        body.dimensions = this.dimensions;
      }

      const res = await fetch(`${this.baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        return { vector: null, error: `openai: HTTP ${res.status} — ${errText}` };
      }

      const json = await res.json() as { data?: Array<{ embedding?: number[] }> };
      const embedding = json.data?.[0]?.embedding;
      if (!embedding || !Array.isArray(embedding)) {
        return { vector: null, error: 'openai: no embedding in response' };
      }
      return { vector: embedding };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { vector: null, error: `openai: ${msg}` };
    }
  }
}

// ─── Ollama Provider ──────────────────────────────────────────────────────────

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'ollama';
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: EmbeddingConfig) {
    this.model = config.model || 'nomic-embed-text';
    this.baseUrl = (config.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
  }

  async embed(text: string): Promise<EmbedResult> {
    try {
      const res = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        return { vector: null, error: `ollama: HTTP ${res.status} — ${errText}` };
      }

      const json = await res.json() as { embedding?: number[] };
      if (!json.embedding || !Array.isArray(json.embedding)) {
        return { vector: null, error: 'ollama: no embedding in response' };
      }
      return { vector: json.embedding };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { vector: null, error: `ollama: ${msg}` };
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createEmbeddingProvider(config?: EmbeddingConfig | null): EmbeddingProvider | null {
  if (!config || !config.provider || !config.model) {
    return null;
  }

  switch (config.provider) {
    case 'openai':
      return new OpenAIEmbeddingProvider(config);
    case 'ollama':
      return new OllamaEmbeddingProvider(config);
    default:
      return null;
  }
}
