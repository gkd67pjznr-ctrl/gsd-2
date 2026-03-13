// GSD Extension — Vector Index wrapping Vectra LocalIndex
// Stores and queries correction embeddings with cosine similarity.
// All operations are non-throwing per D013 — errors surface as empty results or default stats.
// Uses post-query JS filtering since Vectra's metadata filter is unreliable (D037).

import { LocalIndex } from 'vectra';
import type { CorrectionEntry, DiagnosisCategory, CorrectionScope } from './correction-types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Metadata stored alongside each vector — essential fields only, not full CorrectionEntry. */
export interface CorrectionMetadata {
  correction_from: string;
  correction_to: string;
  diagnosis_category: string;
  scope: string;
  timestamp: string;
}

/** A correction with its similarity score from a vector query. */
export interface ScoredCorrection {
  correction_from: string;
  correction_to: string;
  diagnosis_category: DiagnosisCategory;
  scope: CorrectionScope;
  timestamp: string;
  score: number;
}

/** Index health stats. */
export interface VectorIndexStats {
  itemCount: number;
  initialized: boolean;
}

// ─── VectorIndex Class ────────────────────────────────────────────────────────

export class VectorIndex {
  private readonly index: LocalIndex;
  private _initialized = false;

  constructor(indexPath: string) {
    this.index = new LocalIndex(indexPath);
  }

  /** Create the Vectra index on disk if it doesn't exist. */
  async initialize(): Promise<void> {
    try {
      const exists = await this.index.isIndexCreated();
      if (!exists) {
        await this.index.createIndex();
      }
      this._initialized = true;
    } catch {
      this._initialized = false;
    }
  }

  /** Insert a correction entry with its embedding vector. */
  async addCorrection(entry: CorrectionEntry, vector: number[]): Promise<boolean> {
    try {
      if (!this._initialized) await this.initialize();
      const metadata: CorrectionMetadata = {
        correction_from: entry.correction_from,
        correction_to: entry.correction_to,
        diagnosis_category: entry.diagnosis_category,
        scope: entry.scope,
        timestamp: entry.timestamp,
      };
      await this.index.insertItem({ vector, metadata });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Query similar corrections by cosine similarity.
   * Uses post-query JS filtering — Vectra's built-in metadata filter is unreliable.
   */
  async querySimilar(vector: number[], limit = 10): Promise<ScoredCorrection[]> {
    try {
      if (!this._initialized) await this.initialize();
      // Query more than needed since we do post-filtering in JS
      const results = await this.index.queryItems(vector, limit);
      return results
        .filter((r: { score: number }) => r.score > 0)
        .slice(0, limit)
        .map((r: { score: number; item: { metadata: Record<string, unknown> } }) => ({
          correction_from: String(r.item.metadata.correction_from ?? ''),
          correction_to: String(r.item.metadata.correction_to ?? ''),
          diagnosis_category: String(r.item.metadata.diagnosis_category ?? '') as DiagnosisCategory,
          scope: String(r.item.metadata.scope ?? '') as CorrectionScope,
          timestamp: String(r.item.metadata.timestamp ?? ''),
          score: r.score,
        }));
    } catch {
      return [];
    }
  }

  /** Remove all corrections matching a diagnosis category. Post-query JS filtering. */
  async removeByCategory(category: string): Promise<number> {
    try {
      if (!this._initialized) await this.initialize();
      const items = await this.index.listItems();
      let removed = 0;
      for (const item of items) {
        if ((item.metadata as CorrectionMetadata).diagnosis_category === category) {
          await this.index.deleteItem(item.id);
          removed++;
        }
      }
      return removed;
    } catch {
      return 0;
    }
  }

  /** Return index health stats. */
  async getStats(): Promise<VectorIndexStats> {
    try {
      if (!this._initialized) await this.initialize();
      const stats = await this.index.getIndexStats();
      return { itemCount: stats.items, initialized: this._initialized };
    } catch {
      return { itemCount: 0, initialized: this._initialized };
    }
  }
}

// ─── Index Rotation ─────────────────────────────────────────────────────────

/**
 * Rotate a vector index by clearing all items.
 * Called alongside correction JSONL rotation to keep embeddings in sync.
 * Silent on all errors per D013 pattern.
 */
export async function rotateVectorIndex(indexPath: string): Promise<{ cleared: number }> {
  try {
    const index = new LocalIndex(indexPath);
    const exists = await index.isIndexCreated();
    if (!exists) return { cleared: 0 };

    const items = await index.listItems();
    let cleared = 0;
    for (const item of items) {
      await index.deleteItem(item.id);
      cleared++;
    }
    return { cleared };
  } catch {
    return { cleared: 0 };
  }
}
