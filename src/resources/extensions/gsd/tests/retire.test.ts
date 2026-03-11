/**
 * Tests for retirement module — retireByCategory().
 * Tests will fail on import until T03 creates retire.ts.
 *
 * Uses temp directories to avoid touching real .gsd/ state.
 * Pattern: mirrors corrections-io.test.ts structure with assert/assertEq helpers.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { retireByCategory } from "../retire.ts";
import type { CorrectionEntry } from "../correction-types.ts";
import type { PreferenceEntry } from "../preference-types.ts";
import type { SuggestionsDocument } from "../preference-types.ts";

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

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCorrection(overrides: Record<string, unknown> = {}): CorrectionEntry {
  return {
    correction_from: "Did thing wrong",
    correction_to: "Should do thing right",
    diagnosis_category: "code.wrong_pattern",
    diagnosis_text: "Used incorrect approach.",
    scope: "file",
    phase: "executing",
    timestamp: new Date().toISOString(),
    session_id: "test-session-001",
    source: "self_report",
    ...overrides,
  } as CorrectionEntry;
}

function makePreference(overrides: Record<string, unknown> = {}): PreferenceEntry {
  return {
    category: "code.wrong_pattern",
    scope: "file",
    preference_text: "Prefer the right way",
    confidence: 0.6,
    source_count: 3,
    last_correction_ts: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    retired_at: null,
    retired_by: null,
    ...overrides,
  } as PreferenceEntry;
}

function makeSuggestionsDoc(suggestions: SuggestionsDocument["suggestions"] = []): SuggestionsDocument {
  return {
    metadata: {
      last_analyzed_at: new Date().toISOString(),
      version: 1,
      skipped_suggestions: [],
    },
    suggestions,
  };
}

let tmpDir: string;

function setup(): void {
  tmpDir = mkdtempSync(join(tmpdir(), "gsd-retire-test-"));
  mkdirSync(join(tmpDir, ".gsd", "patterns"), { recursive: true });
}

function cleanup(): void {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/** Write JSONL corrections to a specific file */
function writeCorrectionFile(filename: string, entries: CorrectionEntry[]): void {
  const filePath = join(tmpDir, ".gsd", "patterns", filename);
  const content = entries.map(e => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(filePath, content);
}

/** Write preferences to preferences.jsonl */
function writePreferences(entries: PreferenceEntry[]): void {
  const filePath = join(tmpDir, ".gsd", "patterns", "preferences.jsonl");
  const content = entries.map(e => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(filePath, content);
}

/** Write suggestions.json */
function writeSuggestions(doc: SuggestionsDocument): void {
  const filePath = join(tmpDir, ".gsd", "patterns", "suggestions.json");
  writeFileSync(filePath, JSON.stringify(doc, null, 2));
}

/** Read JSONL file and parse entries */
function readJsonl<T>(filename: string): T[] {
  const filePath = join(tmpDir, ".gsd", "patterns", filename);
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8");
  return content.split("\n").filter(l => l.trim() !== "").map(l => JSON.parse(l));
}

/** Read suggestions.json */
function readSuggestions(): SuggestionsDocument {
  const filePath = join(tmpDir, ".gsd", "patterns", "suggestions.json");
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

// ─── Test: retire corrections in active file ──────────────────────────────

console.log("\n=== retireByCategory — retire corrections in active file ===");

{
  setup();

  const corrections = [
    makeCorrection({ diagnosis_category: "code.wrong_pattern", correction_to: "Fix A" }),
    makeCorrection({ diagnosis_category: "code.missing_context", correction_to: "Fix B" }),
    makeCorrection({ diagnosis_category: "code.wrong_pattern", correction_to: "Fix C" }),
  ];
  writeCorrectionFile("corrections.jsonl", corrections);

  retireByCategory("code.wrong_pattern", "suggestion-001", { cwd: tmpDir });

  const result = readJsonl<CorrectionEntry & { retired_at?: string; retired_by?: string }>("corrections.jsonl");

  assertEq(result.length, 3, "all 3 entries preserved");
  assert(result[0].retired_at !== undefined && result[0].retired_at !== null, "first matching entry has retired_at");
  assertEq(result[0].retired_by, "suggestion-001", "first matching entry has retired_by");
  assert(result[1].retired_at === undefined || result[1].retired_at === null, "non-matching entry NOT retired");
  assert(result[2].retired_at !== undefined && result[2].retired_at !== null, "second matching entry has retired_at");
  assertEq(result[2].retired_by, "suggestion-001", "second matching entry has retired_by");

  cleanup();
}

// ─── Test: retire corrections in archive files ────────────────────────────

console.log("\n=== retireByCategory — retire corrections in archive files ===");

{
  setup();

  // Active file has one non-matching entry
  writeCorrectionFile("corrections.jsonl", [
    makeCorrection({ diagnosis_category: "code.missing_context", correction_to: "Active non-match" }),
  ]);

  // Archive file has matching entries
  writeCorrectionFile("corrections-2025-06-01.jsonl", [
    makeCorrection({ diagnosis_category: "code.wrong_pattern", correction_to: "Archive match" }),
    makeCorrection({ diagnosis_category: "code.style_mismatch", correction_to: "Archive non-match" }),
  ]);

  retireByCategory("code.wrong_pattern", "suggestion-002", { cwd: tmpDir });

  const active = readJsonl<CorrectionEntry & { retired_at?: string }>("corrections.jsonl");
  assert(active[0].retired_at === undefined || active[0].retired_at === null, "active non-matching entry unchanged");

  const archive = readJsonl<CorrectionEntry & { retired_at?: string; retired_by?: string }>("corrections-2025-06-01.jsonl");
  assert(archive[0].retired_at !== undefined && archive[0].retired_at !== null, "archive matching entry retired");
  assertEq(archive[0].retired_by, "suggestion-002", "archive entry has correct retired_by");
  assert(archive[1].retired_at === undefined || archive[1].retired_at === null, "archive non-matching entry unchanged");

  cleanup();
}

// ─── Test: retire preferences ─────────────────────────────────────────────

console.log("\n=== retireByCategory — retire preferences ===");

{
  setup();

  const prefs = [
    makePreference({ category: "code.wrong_pattern", preference_text: "Match this" }),
    makePreference({ category: "code.style_mismatch", preference_text: "Skip this" }),
  ];
  writePreferences(prefs);

  retireByCategory("code.wrong_pattern", "suggestion-003", { cwd: tmpDir });

  const result = readJsonl<PreferenceEntry>("preferences.jsonl");

  assertEq(result.length, 2, "both preferences preserved");
  assert(result[0].retired_at !== null, "matching preference retired");
  assertEq(result[0].retired_by, "suggestion-003", "matching preference has retired_by");
  assertEq(result[1].retired_at, null, "non-matching preference NOT retired");

  cleanup();
}

// ─── Test: update suggestion status ───────────────────────────────────────

console.log("\n=== retireByCategory — update suggestion status to refined ===");

{
  setup();

  // Create a suggestion that matches our suggestionId
  const doc = makeSuggestionsDoc([
    {
      id: "suggestion-004",
      type: "refine_skill",
      target_skill: "frontend-design",
      category: "code.wrong_pattern",
      scope_summary: "file",
      correction_count: 3,
      sample_corrections: ["sample"],
      status: "accepted",
      created_at: new Date().toISOString(),
      accepted_at: new Date().toISOString(),
      dismissed_at: null,
      dismiss_reason: null,
      refined_at: null,
    },
  ]);
  writeSuggestions(doc);

  // Also write a correction so retire has something to process
  writeCorrectionFile("corrections.jsonl", [
    makeCorrection({ diagnosis_category: "code.wrong_pattern" }),
  ]);

  retireByCategory("code.wrong_pattern", "suggestion-004", { cwd: tmpDir });

  const result = readSuggestions();
  assertEq(result.suggestions[0].status, "refined", "suggestion status updated to refined");
  assert(result.suggestions[0].refined_at !== null, "refined_at timestamp set");

  cleanup();
}

// ─── Test: idempotent re-retirement ───────────────────────────────────────

console.log("\n=== retireByCategory — idempotent re-retirement ===");

{
  setup();

  const alreadyRetiredTs = "2025-01-15T00:00:00.000Z";
  const corrections = [
    makeCorrection({
      diagnosis_category: "code.wrong_pattern",
      retired_at: alreadyRetiredTs,
      retired_by: "suggestion-old",
    }),
  ];
  writeCorrectionFile("corrections.jsonl", corrections);

  retireByCategory("code.wrong_pattern", "suggestion-new", { cwd: tmpDir });

  const result = readJsonl<CorrectionEntry & { retired_at?: string; retired_by?: string }>("corrections.jsonl");

  // The already-retired entry should NOT be double-stamped
  assertEq(result[0].retired_at, alreadyRetiredTs, "retired_at not overwritten");
  assertEq(result[0].retired_by, "suggestion-old", "retired_by not overwritten");

  cleanup();
}

// ─── Test: malformed lines preserved unchanged ────────────────────────────

console.log("\n=== retireByCategory — malformed lines preserved ===");

{
  setup();

  const filePath = join(tmpDir, ".gsd", "patterns", "corrections.jsonl");
  // Write a mix of valid JSON and malformed lines
  const lines = [
    JSON.stringify(makeCorrection({ diagnosis_category: "code.wrong_pattern" })),
    "this is not valid json {{{",
    JSON.stringify(makeCorrection({ diagnosis_category: "code.missing_context" })),
    "",
  ];
  writeFileSync(filePath, lines.join("\n") + "\n");

  retireByCategory("code.wrong_pattern", "suggestion-005", { cwd: tmpDir });

  const rawContent = readFileSync(filePath, "utf-8");
  assert(rawContent.includes("this is not valid json {{{"), "malformed line preserved unchanged");

  // Valid entries should still be processed
  const validLines = rawContent.split("\n")
    .filter(l => l.trim() !== "")
    .filter(l => { try { JSON.parse(l); return true; } catch { return false; } })
    .map(l => JSON.parse(l));

  const retired = validLines.filter((e: any) => e.retired_at);
  assert(retired.length >= 1, "at least one valid entry was retired");

  cleanup();
}

// ─── Test: no-op on missing files ─────────────────────────────────────────

console.log("\n=== retireByCategory — no-op on missing files ===");

{
  setup();

  // Don't create any files — patterns dir exists but is empty
  // Should not throw
  let didThrow = false;
  try {
    retireByCategory("code.wrong_pattern", "suggestion-006", { cwd: tmpDir });
  } catch {
    didThrow = true;
  }

  assert(!didThrow, "no error thrown when no files exist");

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
