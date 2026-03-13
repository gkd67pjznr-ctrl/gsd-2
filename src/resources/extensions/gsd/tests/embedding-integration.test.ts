/**
 * Integration test: end-to-end embed → store → query flow.
 * Proves EmbeddingProvider and VectorIndex compose correctly for S02 consumption.
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { EmbeddingProvider, EmbedResult } from '../embedding.js';
import { createEmbeddingProvider } from '../embedding.js';
import { VectorIndex } from '../vector-index.js';
import type { CorrectionEntry, DiagnosisCategory } from '../correction-types.js';

// ─── Deterministic Mock EmbeddingProvider ─────────────────────────────────────

const CATEGORY_DIMENSIONS: Record<string, number> = {
  wrong_tool: 0,
  wrong_command: 1,
  wrong_pattern: 2,
  misread_output: 3,
  skipped_validation: 4,
};

function makeVector(hotDim: number, dims = 384): number[] {
  const v = new Array(dims).fill(0);
  v[hotDim] = 1.0;
  return v;
}

function vectorForCategory(category: string): number[] {
  const dim = CATEGORY_DIMENSIONS[category];
  return dim !== undefined ? makeVector(dim) : makeVector(5);
}

class MockEmbeddingProvider implements EmbeddingProvider {
  readonly model = 'mock-deterministic';
  readonly dimensions = 384;

  async embed(text: string): Promise<EmbedResult> {
    for (const [keyword, dim] of Object.entries(CATEGORY_DIMENSIONS)) {
      if (text.includes(keyword)) {
        return { vector: makeVector(dim), error: null };
      }
    }
    return { vector: makeVector(5), error: null };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(category: DiagnosisCategory, from = 'from', to = 'to'): CorrectionEntry {
  return {
    correction_from: from,
    correction_to: to,
    diagnosis_category: category,
    diagnosis_text: 'test',
    scope: 'project',
    phase: 'execution',
    timestamp: new Date().toISOString(),
    session_id: 'test-session',
    source: 'programmatic',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('embedding-integration', () => {
  let tmpDir: string;
  let index: VectorIndex;
  let provider: MockEmbeddingProvider;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-int-'));
    index = new VectorIndex(tmpDir);
    provider = new MockEmbeddingProvider();
    await index.initialize();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('end-to-end: embed → store → query with correct ranking', async () => {
    const entries = [
      { entry: makeEntry('wrong_tool', 'used cat', 'use rg'), text: 'wrong_tool: used cat' },
      { entry: makeEntry('wrong_command', 'npm start', 'npm run dev'), text: 'wrong_command: npm start' },
      { entry: makeEntry('wrong_pattern', 'class', 'function'), text: 'wrong_pattern: class' },
      { entry: makeEntry('misread_output', 'ignored', 'read'), text: 'misread_output: ignored' },
      { entry: makeEntry('skipped_validation', 'no check', 'validate'), text: 'skipped_validation: none' },
    ];

    for (const { entry, text } of entries) {
      const result = await provider.embed(text);
      assert.equal(result.error, null);
      assert.notEqual(result.vector, null);
      const stored = await index.addCorrection(entry, result.vector!);
      assert.equal(stored, true);
    }

    const stats = await index.getStats();
    assert.equal(stats.itemCount, 5);
    assert.equal(stats.initialized, true);

    // Query with wrong_tool vector — exact match should rank first
    const results = await index.querySimilar(vectorForCategory('wrong_tool'), 5);
    assert.ok(results.length > 0);
    assert.equal(results[0].diagnosis_category, 'wrong_tool');
    assert.equal(results[0].score, 1.0);
    assert.equal(results[0].correction_from, 'used cat');
    assert.equal(results[0].correction_to, 'use rg');
  });

  it('queries different categories and gets correct top result', async () => {
    const categories: DiagnosisCategory[] = ['wrong_tool', 'wrong_command', 'wrong_pattern', 'misread_output', 'skipped_validation'];

    for (const cat of categories) {
      await index.addCorrection(makeEntry(cat, `from-${cat}`), vectorForCategory(cat));
    }

    for (const cat of categories) {
      const results = await index.querySimilar(vectorForCategory(cat), 5);
      assert.equal(results[0].diagnosis_category, cat);
      assert.equal(results[0].correction_from, `from-${cat}`);
    }
  });

  it('query on empty index returns empty array', async () => {
    const results = await index.querySimilar(vectorForCategory('wrong_tool'), 5);
    assert.deepEqual(results, []);
  });

  it('handles duplicate entries', async () => {
    const entry = makeEntry('wrong_tool');
    const vec = vectorForCategory('wrong_tool');

    await index.addCorrection(entry, vec);
    await index.addCorrection(entry, vec);

    const stats = await index.getStats();
    assert.equal(stats.itemCount, 2);

    const results = await index.querySimilar(vec, 5);
    assert.equal(results.length, 2);
    assert.equal(results[0].score, 1.0);
    assert.equal(results[1].score, 1.0);
  });

  it('removeByCategory then re-query confirms removal', async () => {
    await index.addCorrection(makeEntry('wrong_tool', 'tool-entry'), vectorForCategory('wrong_tool'));
    await index.addCorrection(makeEntry('wrong_command', 'cmd-entry'), vectorForCategory('wrong_command'));

    assert.equal((await index.getStats()).itemCount, 2);

    const removed = await index.removeByCategory('wrong_tool');
    assert.equal(removed, 1);
    assert.equal((await index.getStats()).itemCount, 1);

    const results = await index.querySimilar(vectorForCategory('wrong_tool'), 5);
    for (const r of results) {
      assert.notEqual(r.diagnosis_category, 'wrong_tool');
    }
  });

  it('createEmbeddingProvider(null) returns null', () => {
    assert.equal(createEmbeddingProvider(null), null);
  });

  it('createEmbeddingProvider(undefined) returns null', () => {
    assert.equal(createEmbeddingProvider(undefined), null);
  });

  it('createEmbeddingProvider() with no args returns null', () => {
    assert.equal(createEmbeddingProvider(), null);
  });

  it('mock provider returns correct dimensions', async () => {
    const result = await provider.embed('anything');
    assert.notEqual(result.vector, null);
    assert.equal(result.vector!.length, 384);
    assert.equal(result.error, null);
  });

  it('mock provider returns deterministic vectors', async () => {
    const r1 = await provider.embed('wrong_tool test');
    const r2 = await provider.embed('wrong_tool test');
    assert.deepEqual(r1.vector, r2.vector);
  });
});
