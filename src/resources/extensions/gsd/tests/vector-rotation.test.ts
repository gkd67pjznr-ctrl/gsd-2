/**
 * Vector rotation tests — verifies rotateVectorIndex behavior.
 *
 * Tests: full clear, no-op on missing index, silent on errors.
 */

import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalIndex } from "vectra";
import { rotateVectorIndex } from "../vector-index.js";

let tmpDir: string;

function setup() {
  tmpDir = mkdtempSync(join(tmpdir(), "vec-rot-"));
}

function teardown() {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

async function seedIndex(indexPath: string, count: number): Promise<void> {
  const index = new LocalIndex(indexPath);
  if (!(await index.isIndexCreated())) {
    await index.createIndex();
  }
  for (let i = 0; i < count; i++) {
    const vector = new Array(1536).fill(0).map(() => Math.random());
    await index.insertItem({
      vector,
      metadata: {
        correction_from: `from-${i}`,
        correction_to: `to-${i}`,
        diagnosis_category: "test",
        scope: "task",
        timestamp: new Date(Date.now() - i * 86400000).toISOString(),
      },
    });
  }
}

async function getItemCount(indexPath: string): Promise<number> {
  const index = new LocalIndex(indexPath);
  if (!(await index.isIndexCreated())) return 0;
  const items = await index.listItems();
  return items.length;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  setup();
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e: any) {
    console.error(`  ✗ ${name}: ${e.message}`);
    failed++;
  } finally {
    teardown();
  }
}

console.log("vector-rotation tests\n");

await test("rotateVectorIndex clears all items from an existing index", async () => {
  const indexPath = join(tmpDir, "vectors");
  await seedIndex(indexPath, 5);
  assert.equal(await getItemCount(indexPath), 5);

  const result = await rotateVectorIndex(indexPath);
  assert.equal(result.cleared, 5);
  assert.equal(await getItemCount(indexPath), 0);
});

await test("rotateVectorIndex returns { cleared: 0 } on missing index", async () => {
  const indexPath = join(tmpDir, "nonexistent-vectors");
  const result = await rotateVectorIndex(indexPath);
  assert.equal(result.cleared, 0);
});

await test("rotateVectorIndex returns { cleared: 0 } on empty index", async () => {
  const indexPath = join(tmpDir, "empty-vectors");
  const index = new LocalIndex(indexPath);
  await index.createIndex();
  assert.equal(await getItemCount(indexPath), 0);

  const result = await rotateVectorIndex(indexPath);
  assert.equal(result.cleared, 0);
});

await test("rotateVectorIndex is silent on invalid path", async () => {
  // Path that can't be a valid index — should not throw
  const result = await rotateVectorIndex("/dev/null/impossible/path");
  assert.equal(result.cleared, 0);
});

await test("fresh vectors are also cleared (full clear approach)", async () => {
  const indexPath = join(tmpDir, "vectors");
  await seedIndex(indexPath, 3);
  const result = await rotateVectorIndex(indexPath);
  assert.equal(result.cleared, 3);
  assert.equal(await getItemCount(indexPath), 0);
});

await test("multiple rotations are idempotent", async () => {
  const indexPath = join(tmpDir, "vectors");
  await seedIndex(indexPath, 2);
  await rotateVectorIndex(indexPath);
  const result = await rotateVectorIndex(indexPath);
  assert.equal(result.cleared, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
