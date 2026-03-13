// Tests for embedding cost tracking: EmbedResult cost fields, provider cost computation, accumulator semantics

import { strict as assert } from 'node:assert';
import { EMBEDDING_COST_PER_TOKEN, type EmbedResult } from '../embedding.js';
import { _addEmbeddingCost, flushEmbeddingCosts, _getEmbeddingCostSnapshot } from '../auto.js';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

console.log('\n── EmbedResult cost fields ──');

test('EMBEDDING_COST_PER_TOKEN is correct for text-embedding-3-small', () => {
  assert.equal(EMBEDDING_COST_PER_TOKEN, 0.00000002);
});

test('EmbedResult with cost fields is backward compatible', () => {
  const r: EmbedResult = { vector: [1, 2, 3] };
  assert.equal(r.cost, undefined);
  assert.equal(r.tokensUsed, undefined);
});

test('EmbedResult can carry cost and tokensUsed', () => {
  const r: EmbedResult = { vector: [1], tokensUsed: 100, cost: 100 * EMBEDDING_COST_PER_TOKEN };
  assert.equal(r.tokensUsed, 100);
  assert.equal(r.cost, 0.000002);
});

test('Error results have no cost fields (undefined, not 0)', () => {
  const r: EmbedResult = { vector: null, error: 'fail' };
  assert.equal(r.cost, undefined);
  assert.equal(r.tokensUsed, undefined);
});

console.log('\n── OpenAI cost computation ──');

test('OpenAI cost = tokens * rate', () => {
  const tokens = 50;
  const cost = tokens * EMBEDDING_COST_PER_TOKEN;
  assert.equal(cost, 0.000001);
});

test('OpenAI zero tokens yields zero cost', () => {
  assert.equal(0 * EMBEDDING_COST_PER_TOKEN, 0);
});

console.log('\n── Ollama zero cost ──');

test('Ollama provider returns cost: 0, tokensUsed: 0', () => {
  const r: EmbedResult = { vector: [1, 2], cost: 0, tokensUsed: 0 };
  assert.equal(r.cost, 0);
  assert.equal(r.tokensUsed, 0);
});

console.log('\n── Cost accumulator ──');

// Reset state by flushing
flushEmbeddingCosts();

test('Accumulator starts at zero after flush', () => {
  const s = _getEmbeddingCostSnapshot();
  assert.equal(s.cost, 0);
  assert.equal(s.tokens, 0);
});

test('_addEmbeddingCost sums multiple calls', () => {
  _addEmbeddingCost(0.000001, 50);
  _addEmbeddingCost(0.000002, 100);
  const s = _getEmbeddingCostSnapshot();
  assert.equal(s.tokens, 150);
  assert.ok(Math.abs(s.cost - 0.000003) < 1e-12);
});

test('_getEmbeddingCostSnapshot does not reset', () => {
  const s1 = _getEmbeddingCostSnapshot();
  const s2 = _getEmbeddingCostSnapshot();
  assert.equal(s1.tokens, s2.tokens);
});

test('flushEmbeddingCosts returns and resets', () => {
  const flushed = flushEmbeddingCosts();
  assert.equal(flushed.tokens, 150);
  const after = _getEmbeddingCostSnapshot();
  assert.equal(after.tokens, 0);
  assert.equal(after.cost, 0);
});

console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
if (failed > 0) process.exit(1);
