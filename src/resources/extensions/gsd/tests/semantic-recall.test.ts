/**
 * Tests for async buildRecallBlock() with vector similarity path.
 * Covers: vector path, fallback path, kill switch, token budget,
 * self-report instructions, embed failure, empty vector index.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildRecallBlock, estimateTokens } from "../recall.ts";
import type { EmbeddingProvider, EmbedResult } from "../embedding.ts";
import type { VectorIndex, ScoredCorrection } from "../vector-index.ts";
import type { CorrectionEntry } from "../correction-types.ts";
import type { PreferenceEntry } from "../preference-types.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

// ─── Mock Helpers ─────────────────────────────────────────────────────────────

class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = "mock";
  private readonly _vector: number[] | null;
  private readonly _error?: string;
  embedCallCount = 0;

  constructor(opts: { vector?: number[] | null; error?: string } = {}) {
    this._vector = opts.vector ?? [0.1, 0.2, 0.3];
    this._error = opts.error;
  }

  async embed(_text: string): Promise<EmbedResult> {
    this.embedCallCount++;
    if (this._error) return { vector: null, error: this._error };
    return { vector: this._vector };
  }
}

class MockVectorIndex {
  private _results: ScoredCorrection[];
  queryCallCount = 0;

  constructor(results: ScoredCorrection[] = []) {
    this._results = results;
  }

  async querySimilar(_vector: number[], limit = 10): Promise<ScoredCorrection[]> {
    this.queryCallCount++;
    return this._results.slice(0, limit);
  }

  async getStats() {
    return { itemCount: this._results.length, initialized: true };
  }
}

function makeScoredCorrection(overrides: Partial<ScoredCorrection> = {}): ScoredCorrection {
  return {
    correction_from: "did X wrong",
    correction_to: overrides.correction_to ?? "do X correctly",
    diagnosis_category: overrides.diagnosis_category ?? ("code.wrong_pattern" as any),
    scope: overrides.scope ?? ("file" as any),
    timestamp: overrides.timestamp ?? "2026-01-10T00:00:00Z",
    score: overrides.score ?? 0.85,
  };
}

// ─── Temp dir helpers ─────────────────────────────────────────────────────────

let tmpDir: string;
let savedGsdHome: string | undefined;

function setup(): void {
  tmpDir = mkdtempSync(join(tmpdir(), "sem-recall-"));
  mkdirSync(join(tmpDir, ".gsd", "patterns"), { recursive: true });
  savedGsdHome = process.env.GSD_HOME;
  process.env.GSD_HOME = join(tmpDir, ".gsd-home-nonexistent");
}

function cleanup(): void {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
    if (savedGsdHome === undefined) {
      delete process.env.GSD_HOME;
    } else {
      process.env.GSD_HOME = savedGsdHome;
    }
  } catch { /* ignore */ }
}

function writeCorrections(entries: CorrectionEntry[]): void {
  const content = entries.map(e => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(join(tmpDir, ".gsd", "patterns", "corrections.jsonl"), content);
}

function writePreferences(entries: PreferenceEntry[]): void {
  const content = entries.map(e => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(join(tmpDir, ".gsd", "patterns", "preferences.jsonl"), content);
}

function writePreferencesMd(correctionCapture: boolean): void {
  const content = `---\ncorrection_capture: ${correctionCapture}\n---\nPreferences`;
  writeFileSync(join(tmpDir, ".gsd", "preferences.md"), content);
}

function makeCorrection(overrides: Record<string, unknown> = {}): CorrectionEntry {
  return {
    correction_from: "wrong approach",
    correction_to: "correct approach",
    diagnosis_category: "code.wrong_pattern",
    diagnosis_text: "test",
    scope: "file",
    phase: "executing",
    timestamp: "2026-01-10T00:00:00Z",
    session_id: "test",
    source: "self_report",
    status: "active",
    ...overrides,
  } as CorrectionEntry;
}

function makePreference(overrides: Record<string, unknown> = {}): PreferenceEntry {
  return {
    category: "code.wrong_pattern",
    scope: "file",
    preference_text: "Always use helper function",
    confidence: 0.9,
    source: "auto" as const,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as PreferenceEntry;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

(async () => {

// (a) Vector path returns corrections ranked by similarity
console.log("\n=== vector path — similarity ranked ===");
{
  setup();
  const provider = new MockEmbeddingProvider();
  const index = new MockVectorIndex([
    makeScoredCorrection({ correction_to: "use async/await", score: 0.95 }),
    makeScoredCorrection({ correction_to: "check null first", score: 0.80 }),
    makeScoredCorrection({ correction_to: "add error handling", score: 0.70 }),
  ]);

  const result = await buildRecallBlock({
    cwd: tmpDir,
    provider,
    vectorIndex: index as unknown as VectorIndex,
    taskContext: "implement error handling",
  });

  assert(result.includes("use async/await"), "highest scored correction present");
  assert(result.includes("check null first"), "second scored correction present");
  assert(result.includes("add error handling"), "third scored correction present");
  assert(provider.embedCallCount === 1, "embed called once");
  assert(index.queryCallCount === 1, "querySimilar called once");
  cleanup();
}

// (b) Fallback when no provider — same as sync logic
console.log("\n=== fallback — no provider ===");
{
  setup();
  writeCorrections([
    makeCorrection({ correction_to: "use the existing utility" }),
  ]);

  const withoutProvider = await buildRecallBlock({ cwd: tmpDir });
  
  cleanup();
  setup();
  writeCorrections([
    makeCorrection({ correction_to: "use the existing utility" }),
  ]);

  const withNullProvider = await buildRecallBlock({ cwd: tmpDir, provider: undefined });

  assert(withoutProvider.includes("use the existing utility"), "fallback path returns corrections");
  assert(withNullProvider.includes("use the existing utility"), "null provider uses fallback");
  cleanup();
}

// (c) Kill switch returns empty
console.log("\n=== kill switch ===");
{
  setup();
  writePreferencesMd(false);
  const provider = new MockEmbeddingProvider();
  const index = new MockVectorIndex([makeScoredCorrection()]);

  const result = await buildRecallBlock({
    cwd: tmpDir,
    provider,
    vectorIndex: index as unknown as VectorIndex,
    taskContext: "anything",
  });

  assert(result === "", "kill switch returns empty even with vector config");
  assert(provider.embedCallCount === 0, "embed not called when kill switch active");
  cleanup();
}

// (d) Token budget respected with vector results
console.log("\n=== token budget with vector results ===");
{
  setup();
  const longText = "word ".repeat(600); // ~600 words ≈ 800 tokens each
  const corrections = Array.from({ length: 10 }, (_, i) =>
    makeScoredCorrection({ correction_to: `${longText} entry${i}`, score: 0.9 - i * 0.01 }),
  );
  const provider = new MockEmbeddingProvider();
  const index = new MockVectorIndex(corrections);

  const result = await buildRecallBlock({
    cwd: tmpDir,
    provider,
    vectorIndex: index as unknown as VectorIndex,
    taskContext: "test",
  });

  const tokens = estimateTokens(result);
  assert(tokens <= 3000, `token budget respected: ${tokens} <= 3000`);
  cleanup();
}

// (e) Self-report instructions present
console.log("\n=== self-report instructions ===");
{
  setup();
  const provider = new MockEmbeddingProvider();
  const index = new MockVectorIndex([makeScoredCorrection()]);

  const result = await buildRecallBlock({
    cwd: tmpDir,
    provider,
    vectorIndex: index as unknown as VectorIndex,
    taskContext: "test",
  });

  assert(result.includes("Self-report corrections"), "self-report instructions in vector path");
  assert(result.includes("corrections.jsonl"), "self-report has file reference");
  cleanup();
}

// (f) Embed failure falls back to category logic
console.log("\n=== embed failure fallback ===");
{
  setup();
  writeCorrections([
    makeCorrection({ correction_to: "fallback correction from file" }),
  ]);
  const failProvider = new MockEmbeddingProvider({ vector: null, error: "mock: embed failed" });
  const index = new MockVectorIndex([]);

  const result = await buildRecallBlock({
    cwd: tmpDir,
    provider: failProvider,
    vectorIndex: index as unknown as VectorIndex,
    taskContext: "test",
  });

  assert(result.includes("fallback correction from file"), "embed failure triggers category fallback");
  assert(result !== "", "embed failure does not return empty string");
  cleanup();
}

// (g) Empty vector index falls back to category logic
console.log("\n=== empty vector index fallback ===");
{
  setup();
  writeCorrections([
    makeCorrection({ correction_to: "category-based correction" }),
  ]);
  const provider = new MockEmbeddingProvider();
  const index = new MockVectorIndex([]); // empty results

  const result = await buildRecallBlock({
    cwd: tmpDir,
    provider,
    vectorIndex: index as unknown as VectorIndex,
    taskContext: "test",
  });

  assert(result.includes("category-based correction"), "empty index triggers category fallback");
  cleanup();
}

// (h) Vector results deduped against preferences
console.log("\n=== vector dedup against preferences ===");
{
  setup();
  writePreferences([
    makePreference({ category: "code.wrong_pattern", scope: "file" }),
  ]);
  const provider = new MockEmbeddingProvider();
  const index = new MockVectorIndex([
    makeScoredCorrection({ diagnosis_category: "code.wrong_pattern" as any, scope: "file" as any, correction_to: "should be deduped" }),
    makeScoredCorrection({ diagnosis_category: "code.style_mismatch" as any, scope: "project" as any, correction_to: "should survive", score: 0.8 }),
  ]);

  const result = await buildRecallBlock({
    cwd: tmpDir,
    provider,
    vectorIndex: index as unknown as VectorIndex,
    taskContext: "test",
  });

  assert(!result.includes("should be deduped"), "vector correction matching preference excluded");
  assert(result.includes("should survive"), "non-matching vector correction kept");
  cleanup();
}

// ─── Integration: write → embed → recall with real VectorIndex ────────────────

console.log("\n=== integration: write→embed→recall pipeline ===");
{
  setup();
  const { VectorIndex: RealVectorIndex } = await import("../vector-index.ts");
  const indexDir = join(tmpDir, ".gsd", "vector-index");
  mkdirSync(indexDir, { recursive: true });
  const realIndex = new RealVectorIndex(indexDir);

  // Use a provider that returns deterministic vectors based on text content
  const integrationProvider: EmbeddingProvider = {
    name: "integration-mock",
    async embed(text: string): Promise<EmbedResult> {
      // Simple deterministic vector: hash-like based on char codes
      const vec = new Array(3).fill(0);
      for (let i = 0; i < text.length; i++) {
        vec[i % 3] += text.charCodeAt(i) / 1000;
      }
      const mag = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0));
      return { vector: vec.map((v: number) => v / (mag || 1)) };
    },
  };

  // Write a correction and embed it
  const entry: CorrectionEntry = {
    correction_from: "used var instead of const",
    correction_to: "always use const for immutable bindings",
    diagnosis_category: "code.wrong_pattern" as any,
    scope: "file" as any,
    timestamp: "2026-03-12T00:00:00Z",
  };
  const embedResult = await integrationProvider.embed(
    `${entry.correction_from} → ${entry.correction_to}`
  );
  assert(embedResult.vector !== null, "integration: embed produced vector");
  const added = await realIndex.addCorrection(entry, embedResult.vector!);
  assert(added, "integration: correction added to real index");

  // Verify index has the item
  const stats = await realIndex.getStats();
  assert(stats.itemCount === 1, `integration: index has 1 item (got ${stats.itemCount})`);

  // Now recall via buildRecallBlock with the real index
  const result = await buildRecallBlock({
    cwd: tmpDir,
    provider: integrationProvider,
    vectorIndex: realIndex as unknown as VectorIndex,
    taskContext: "use const instead of var for variable declarations",
  });
  assert(result.includes("always use const"), "integration: recalled correction appears in output");

  cleanup();
}

// Integration: without provider, output matches category-based logic
console.log("\n=== integration: no provider falls back to category logic ===");
{
  setup();
  // Write a correction to the corrections file
  const corrEntry: CorrectionEntry = {
    correction_from: "bad pattern",
    correction_to: "good pattern",
    diagnosis_category: "code.wrong_pattern" as any,
    scope: "file" as any,
    timestamp: "2026-03-12T00:00:00Z",
  };
  const patternsDir = join(tmpDir, ".gsd", "patterns");
  mkdirSync(patternsDir, { recursive: true });
  writeFileSync(join(patternsDir, "corrections.jsonl"), JSON.stringify(corrEntry));

  const withoutProvider = await buildRecallBlock({ cwd: tmpDir });
  const withProvider = await buildRecallBlock({ cwd: tmpDir, provider: undefined, vectorIndex: undefined });
  assert(withoutProvider === withProvider, "integration: no-provider path identical with/without explicit undefined");
  // Both should include the correction via category-based logic
  assert(withoutProvider.includes("good pattern"), "integration: category fallback includes correction");
  cleanup();
}

// (i) Async signature — returns Promise
console.log("\n=== async signature ===");
{
  setup();
  const result = buildRecallBlock({ cwd: tmpDir });
  assert(result instanceof Promise, "buildRecallBlock returns a Promise");
  await result;
  cleanup();
}

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed ✓");
}

})();
