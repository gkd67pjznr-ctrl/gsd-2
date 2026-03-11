/**
 * Tests for observer engine — analyzePatterns, suggestion lifecycle, guardrails.
 * These tests have real assertions but will fail on import until T03 creates observer.ts.
 *
 * Uses temp directories to avoid touching real .gsd/ state.
 * Pattern: mirrors corrections-io.test.ts structure with assert/assertEq helpers.
 */

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzePatterns } from "../observer.ts";
import { writeCorrection } from "../corrections.ts";
import { writePreference, readPreferences } from "../pattern-preferences.ts";
import type { CorrectionEntry } from "../correction-types.ts";
import type { PreferenceEntry, SuggestionsDocument } from "../preference-types.ts";

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

function makeValidEntry(overrides: Record<string, unknown> = {}): CorrectionEntry {
  return {
    correction_from: "Used wrong pattern",
    correction_to: "Should have used correct pattern",
    diagnosis_category: "code.wrong_pattern",
    diagnosis_text: "Applied incorrect abstraction.",
    scope: "file",
    phase: "executing",
    timestamp: new Date().toISOString(),
    session_id: "test-session-001",
    source: "self_report",
    ...overrides,
  } as CorrectionEntry;
}

function makePreference(overrides: Partial<PreferenceEntry> = {}): PreferenceEntry {
  return {
    category: "code.wrong_pattern",
    scope: "file",
    preference_text: "Test preference",
    confidence: 0.6,
    source_count: 3,
    last_correction_ts: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    retired_at: null,
    retired_by: null,
    ...overrides,
  };
}

let tmpDir: string;

function setup(): void {
  tmpDir = mkdtempSync(join(tmpdir(), "gsd-observer-test-"));
  mkdirSync(join(tmpDir, ".gsd", "patterns"), { recursive: true });
}

function cleanup(): void {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

function readSuggestionsDoc(): SuggestionsDocument {
  const filePath = join(tmpDir, ".gsd", "patterns", "suggestions.json");
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function seedCorrections(
  count: number,
  overrides: Record<string, unknown> = {},
): void {
  for (let i = 0; i < count; i++) {
    writeCorrection(
      makeValidEntry({
        session_id: `seed-${i}`,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        ...overrides,
      }),
      { cwd: tmpDir },
    );
  }
}

// ─── Tests: analyzePatterns — below threshold ─────────────────────────────

console.log("\n=== analyzePatterns — corrections below threshold ===");

{
  setup();

  // Write 2 corrections (below threshold of 3)
  seedCorrections(2, { diagnosis_category: "code.wrong_pattern", scope: "file" });

  const result = analyzePatterns({ cwd: tmpDir });

  assertEq(result.analyzed, true, "analysis completes successfully");
  assertEq(result.suggestions_written, 0, "no suggestions written below threshold");

  cleanup();
}

// ─── Tests: analyzePatterns — at threshold ────────────────────────────────

console.log("\n=== analyzePatterns — corrections at threshold ===");

{
  setup();

  // Write 3 corrections with same category (at threshold)
  seedCorrections(3, { diagnosis_category: "code.missing_context", scope: "file" });

  const result = analyzePatterns({ cwd: tmpDir });

  assertEq(result.analyzed, true, "analysis completes");
  assert(
    result.suggestions_written !== undefined && result.suggestions_written >= 1,
    "at least 1 suggestion written at threshold",
  );

  // Verify suggestion structure
  const doc = readSuggestionsDoc();
  assert(doc.suggestions.length >= 1, "suggestions array has entries");

  const suggestion = doc.suggestions[0];
  assert(typeof suggestion.id === "string" && suggestion.id.length > 0, "suggestion has non-empty id");
  assert(
    suggestion.type === "refine_skill" || suggestion.type === "new_skill_needed",
    "type is refine_skill or new_skill_needed",
  );
  assertEq(suggestion.category, "code.missing_context", "category matches corrections");
  assert(typeof suggestion.scope_summary === "string", "scope_summary is a string");
  assert(suggestion.correction_count >= 3, "correction_count ≥ 3");
  assert(Array.isArray(suggestion.sample_corrections), "sample_corrections is an array");
  assertEq(suggestion.status, "pending", "initial status is pending");
  assert(typeof suggestion.created_at === "string", "created_at is set");
  assertEq(suggestion.accepted_at, null, "accepted_at is null initially");
  assertEq(suggestion.dismissed_at, null, "dismissed_at is null initially");
  assertEq(suggestion.dismiss_reason, null, "dismiss_reason is null initially");

  cleanup();
}

// ─── Tests: watermark dedup ──────────────────────────────────────────────

console.log("\n=== analyzePatterns — watermark dedup ===");

{
  setup();

  seedCorrections(3, { diagnosis_category: "code.style_mismatch", scope: "file" });

  // First call — should create suggestions
  const result1 = analyzePatterns({ cwd: tmpDir });
  assert(
    result1.suggestions_written !== undefined && result1.suggestions_written >= 1,
    "first call creates suggestions",
  );

  // Second call with NO new corrections — should not create duplicates
  const result2 = analyzePatterns({ cwd: tmpDir });
  assertEq(result2.suggestions_written, 0, "second call with no new corrections creates 0 suggestions");

  const doc = readSuggestionsDoc();
  // Should still have only the original suggestions, no duplicates
  const matchingSuggestions = doc.suggestions.filter(
    s => s.category === "code.style_mismatch",
  );
  assertEq(matchingSuggestions.length, 1, "no duplicate suggestions after second call");

  cleanup();
}

// ─── Tests: active-preference dedup ───────────────────────────────────────

console.log("\n=== analyzePatterns — active-preference dedup ===");

{
  setup();

  // Write corrections for a category
  seedCorrections(4, { diagnosis_category: "code.over_engineering", scope: "project" });

  // Also write an active preference for the same category+scope
  writePreference(
    makePreference({ category: "code.over_engineering", scope: "project" }),
    { cwd: tmpDir },
  );

  const result = analyzePatterns({ cwd: tmpDir });

  assertEq(result.analyzed, true, "analysis completes with existing preferences");
  // Should NOT create a suggestion for a category that already has an active preference
  const doc = readSuggestionsDoc();
  const matching = doc.suggestions.filter(s => s.category === "code.over_engineering");
  assertEq(matching.length, 0, "no suggestion for category with active preference");

  cleanup();
}

// ─── Tests: cross-scope grouping ──────────────────────────────────────────

console.log("\n=== analyzePatterns — cross-scope grouping ===");

{
  setup();

  // Write corrections for same category across different scopes
  seedCorrections(2, { diagnosis_category: "code.under_engineering", scope: "file" });
  seedCorrections(2, { diagnosis_category: "code.under_engineering", scope: "project" });

  // Total 4 corrections for same category across scopes — should group
  const result = analyzePatterns({ cwd: tmpDir });

  assertEq(result.analyzed, true, "analysis completes");

  const doc = readSuggestionsDoc();
  const matching = doc.suggestions.filter(s => s.category === "code.under_engineering");
  assertEq(matching.length, 1, "single suggestion for cross-scope corrections");

  // scope_summary should reflect both scopes
  assert(
    matching[0].scope_summary.includes("file") || matching[0].scope_summary.includes("project"),
    "scope_summary mentions at least one of the scopes",
  );

  cleanup();
}

// ─── Tests: cooldown guardrail ────────────────────────────────────────────

console.log("\n=== analyzePatterns — cooldown guardrail ===");

{
  setup();

  seedCorrections(3, { diagnosis_category: "code.scope_drift", scope: "file" });

  // First call — creates suggestion
  analyzePatterns({ cwd: tmpDir });

  // Simulate accepting the suggestion
  const doc = readSuggestionsDoc();
  const suggestion = doc.suggestions.find(s => s.category === "code.scope_drift");
  if (suggestion) {
    suggestion.status = "accepted";
    suggestion.accepted_at = new Date().toISOString();
    writeFileSync(
      join(tmpDir, ".gsd", "patterns", "suggestions.json"),
      JSON.stringify(doc, null, 2),
    );
  }

  // Write more corrections for the same category
  seedCorrections(3, {
    diagnosis_category: "code.scope_drift",
    scope: "file",
    session_id: "cooldown-test",
    timestamp: new Date(Date.now() + 100000).toISOString(),
  });

  // Second call — should be blocked by cooldown (accepted < 7 days ago)
  const result2 = analyzePatterns({ cwd: tmpDir });

  const doc2 = readSuggestionsDoc();
  const newMatching = doc2.suggestions.filter(
    s => s.category === "code.scope_drift" && s.status === "pending",
  );
  assertEq(newMatching.length, 0, "no new pending suggestion during cooldown");

  // Verify it was recorded in skipped_suggestions
  assert(
    doc2.metadata.skipped_suggestions.length > 0,
    "skipped_suggestions records the blocked suggestion",
  );

  cleanup();
}

// ─── Tests: no-duplicate-pending guardrail ────────────────────────────────

console.log("\n=== analyzePatterns — no-duplicate-pending guardrail ===");

{
  setup();

  seedCorrections(3, { diagnosis_category: "process.planning_error", scope: "phase" });

  // Create first suggestion
  analyzePatterns({ cwd: tmpDir });

  // Write more corrections
  seedCorrections(3, {
    diagnosis_category: "process.planning_error",
    scope: "phase",
    session_id: "dup-test",
    timestamp: new Date(Date.now() + 200000).toISOString(),
  });

  // Second analysis — should NOT create another pending suggestion for same category
  analyzePatterns({ cwd: tmpDir });

  const doc = readSuggestionsDoc();
  const pending = doc.suggestions.filter(
    s => s.category === "process.planning_error" && s.status === "pending",
  );
  assertEq(pending.length, 1, "only one pending suggestion for same category");

  cleanup();
}

// ─── Tests: auto-dismiss expired ──────────────────────────────────────────

console.log("\n=== analyzePatterns — auto-dismiss expired (> 30 days) ===");

{
  setup();

  seedCorrections(3, { diagnosis_category: "process.research_gap", scope: "global" });

  // Create suggestion
  analyzePatterns({ cwd: tmpDir });

  // Backdate the suggestion's created_at to > 30 days ago
  const doc = readSuggestionsDoc();
  const suggestion = doc.suggestions.find(s => s.category === "process.research_gap");
  if (suggestion) {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    suggestion.created_at = oldDate.toISOString();
    writeFileSync(
      join(tmpDir, ".gsd", "patterns", "suggestions.json"),
      JSON.stringify(doc, null, 2),
    );
  }

  // Run analysis again — should auto-dismiss the old suggestion
  analyzePatterns({ cwd: tmpDir });

  const doc2 = readSuggestionsDoc();
  const dismissed = doc2.suggestions.find(s => s.category === "process.research_gap");
  assert(dismissed !== undefined, "suggestion still exists after auto-dismiss");
  assertEq(dismissed?.status, "dismissed", "expired suggestion status changed to dismissed");
  assert(dismissed?.dismissed_at !== null, "dismissed_at is set");

  cleanup();
}

// ─── Tests: suggestion ID uniqueness ──────────────────────────────────────

console.log("\n=== analyzePatterns — suggestion ID uniqueness ===");

{
  setup();

  // Seed corrections for two different categories
  seedCorrections(3, { diagnosis_category: "code.wrong_pattern", scope: "file" });
  seedCorrections(3, { diagnosis_category: "process.implementation_bug", scope: "project" });

  analyzePatterns({ cwd: tmpDir });

  const doc = readSuggestionsDoc();
  const ids = doc.suggestions.map(s => s.id);
  const uniqueIds = new Set(ids);
  assertEq(uniqueIds.size, ids.length, "all suggestion IDs are unique");

  cleanup();
}

// ─── Tests: analyzePatterns result shape ──────────────────────────────────

console.log("\n=== analyzePatterns — result shape ===");

{
  setup();

  seedCorrections(3, { diagnosis_category: "process.convention_violation", scope: "file" });

  const result = analyzePatterns({ cwd: tmpDir });

  assertEq(result.analyzed, true, "result.analyzed is true");
  assert(typeof result.suggestions_written === "number", "result.suggestions_written is a number");
  assert(result.reason === undefined, "result.reason is undefined on success");

  cleanup();
}

// ─── Tests: skill existence check ─────────────────────────────────────────

console.log("\n=== analyzePatterns — skill existence check ===");

{
  setup();

  // Seed corrections for a category that likely maps to a non-existent skill
  seedCorrections(3, { diagnosis_category: "process.requirement_misread", scope: "file" });

  analyzePatterns({ cwd: tmpDir });

  const doc = readSuggestionsDoc();
  const suggestion = doc.suggestions.find(s => s.category === "process.requirement_misread");
  assert(suggestion !== undefined, "suggestion created for requirement_misread");

  // The type should indicate skill status — either refine_skill (if skill exists)
  // or new_skill_needed (if skill doesn't exist)
  assert(
    suggestion?.type === "refine_skill" || suggestion?.type === "new_skill_needed",
    "suggestion type reflects skill existence",
  );

  cleanup();
}

// ─── Tests: metadata structure ────────────────────────────────────────────

console.log("\n=== analyzePatterns — metadata structure ===");

{
  setup();

  seedCorrections(3, { diagnosis_category: "process.integration_miss", scope: "file" });
  analyzePatterns({ cwd: tmpDir });

  const doc = readSuggestionsDoc();

  assert(doc.metadata !== undefined, "metadata exists");
  assert(typeof doc.metadata.last_analyzed_at === "string", "last_analyzed_at is set");
  assert(typeof doc.metadata.version === "number", "version is a number");
  assert(Array.isArray(doc.metadata.skipped_suggestions), "skipped_suggestions is an array");

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
