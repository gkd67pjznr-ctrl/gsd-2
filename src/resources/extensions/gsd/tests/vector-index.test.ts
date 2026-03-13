/**
 * Tests for VectorIndex wrapping Vectra LocalIndex.
 * Uses deterministic fixture vectors (orthogonal unit vectors) to prove
 * cosine similarity ranking, removal, and error handling.
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { VectorIndex } from '../vector-index.js';
import type { CorrectionEntry } from '../correction-types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Create an N-dimensional unit vector with 1.0 at position `axis`, rest 0. */
function unitVector(dims: number, axis: number): number[] {
  const v = new Array(dims).fill(0);
  v[axis] = 1.0;
  return v;
}

function makeCorrectionEntry(overrides: Partial<CorrectionEntry> = {}): CorrectionEntry {
  return {
    correction_from: 'wrong approach',
    correction_to: 'correct approach',
    diagnosis_category: 'code.wrong_pattern',
    diagnosis_text: 'Used wrong pattern',
    scope: 'file',
    phase: 'execute',
    timestamp: new Date().toISOString(),
    session_id: 'test-session',
    source: 'programmatic',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('vector-index', () => {
  let tmpDir: string;
  let idx: VectorIndex;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-vectra-'));
    idx = new VectorIndex(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes a new index from empty directory', async () => {
    await idx.initialize();
    const stats = await idx.getStats();
    assert.equal(stats.initialized, true);
    assert.equal(stats.itemCount, 0);
  });

  it('addCorrection inserts and increments item count', async () => {
    await idx.initialize();
    const ok = await idx.addCorrection(makeCorrectionEntry(), unitVector(32, 0));
    assert.equal(ok, true);
    const stats = await idx.getStats();
    assert.equal(stats.itemCount, 1);
  });

  it('querySimilar returns ranked results by cosine similarity', async () => {
    await idx.initialize();
    const dims = 32;

    // Insert 3 corrections with orthogonal vectors
    await idx.addCorrection(
      makeCorrectionEntry({ correction_to: 'axis-0', diagnosis_category: 'code.wrong_pattern' }),
      unitVector(dims, 0),
    );
    await idx.addCorrection(
      makeCorrectionEntry({ correction_to: 'axis-1', diagnosis_category: 'code.missing_context' }),
      unitVector(dims, 1),
    );
    await idx.addCorrection(
      makeCorrectionEntry({ correction_to: 'axis-2', diagnosis_category: 'code.stale_knowledge' }),
      unitVector(dims, 2),
    );

    // Query with axis-0 vector — should rank axis-0 first with score ~1.0
    const results = await idx.querySimilar(unitVector(dims, 0), 10);
    assert.ok(results.length >= 1, `Expected at least 1 result, got ${results.length}`);
    assert.equal(results[0].correction_to, 'axis-0');
    assert.ok(Math.abs(results[0].score - 1.0) < 0.01, `Expected score ~1.0, got ${results[0].score}`);

    // Orthogonal vectors should have score 0 and be filtered out
    const nonZero = results.filter(r => r.score > 0.01);
    assert.equal(nonZero.length, 1);
  });

  it('querySimilar respects limit', async () => {
    await idx.initialize();
    const dims = 16;

    // Insert 5 items with slightly different vectors (all have some overlap)
    for (let i = 0; i < 5; i++) {
      const v = new Array(dims).fill(0.1);
      v[i] = 1.0;
      await idx.addCorrection(makeCorrectionEntry({ correction_to: `item-${i}` }), v);
    }

    const results = await idx.querySimilar(new Array(dims).fill(0.1), 3);
    assert.ok(results.length <= 3, `Expected at most 3 results, got ${results.length}`);
  });

  it('querySimilar completes in <50ms', async () => {
    await idx.initialize();
    const dims = 64;

    // Insert 50 items
    for (let i = 0; i < 50; i++) {
      const v = new Array(dims).fill(Math.random() * 0.01);
      v[i % dims] = 1.0;
      await idx.addCorrection(makeCorrectionEntry({ correction_to: `perf-${i}` }), v);
    }

    const queryVec = new Array(dims).fill(0.5);
    const start = performance.now();
    await idx.querySimilar(queryVec, 10);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `querySimilar took ${elapsed.toFixed(1)}ms, expected <50ms`);
  });

  it('removeByCategory removes matching items only', async () => {
    await idx.initialize();
    const dims = 16;

    await idx.addCorrection(
      makeCorrectionEntry({ diagnosis_category: 'code.wrong_pattern' }),
      unitVector(dims, 0),
    );
    await idx.addCorrection(
      makeCorrectionEntry({ diagnosis_category: 'code.wrong_pattern' }),
      unitVector(dims, 1),
    );
    await idx.addCorrection(
      makeCorrectionEntry({ diagnosis_category: 'code.missing_context' }),
      unitVector(dims, 2),
    );

    const removed = await idx.removeByCategory('code.wrong_pattern');
    assert.equal(removed, 2);

    const stats = await idx.getStats();
    assert.equal(stats.itemCount, 1);
  });

  it('removeByCategory returns 0 for non-existent category', async () => {
    await idx.initialize();
    const removed = await idx.removeByCategory('process.regression');
    assert.equal(removed, 0);
  });

  it('auto-initializes on first operation if not explicitly initialized', async () => {
    const ok = await idx.addCorrection(makeCorrectionEntry(), unitVector(16, 0));
    assert.equal(ok, true);
    const stats = await idx.getStats();
    assert.equal(stats.initialized, true);
    assert.equal(stats.itemCount, 1);
  });

  it('stores only essential metadata, not full CorrectionEntry', async () => {
    await idx.initialize();
    const entry = makeCorrectionEntry({
      diagnosis_text: 'should not be stored',
      session_id: 'should-not-be-stored',
      file_path: '/some/path',
    });
    await idx.addCorrection(entry, unitVector(16, 0));

    const results = await idx.querySimilar(unitVector(16, 0), 1);
    assert.equal(results.length, 1);
    assert.equal(results[0].correction_from, entry.correction_from);
    assert.equal(results[0].correction_to, entry.correction_to);
    assert.equal(results[0].diagnosis_category, entry.diagnosis_category);
    assert.equal(results[0].scope, entry.scope);
    assert.ok(results[0].timestamp, 'timestamp should be present');
    // Non-essential fields should NOT be in the result
    const raw = results[0] as Record<string, unknown>;
    assert.equal(raw.diagnosis_text, undefined);
    assert.equal(raw.session_id, undefined);
    assert.equal(raw.file_path, undefined);
  });

  it('getStats returns defaults when index is corrupt', async () => {
    fs.writeFileSync(path.join(tmpDir, 'index.json'), 'not valid json');
    const badIdx = new VectorIndex(tmpDir);
    const stats = await badIdx.getStats();
    assert.equal(stats.itemCount, 0);
  });

  it('querySimilar returns empty array on corrupt index', async () => {
    fs.writeFileSync(path.join(tmpDir, 'index.json'), '{bad');
    const badIdx = new VectorIndex(tmpDir);
    const results = await badIdx.querySimilar(unitVector(16, 0), 5);
    assert.deepEqual(results, []);
  });
});
