/**
 * Tests for preference promotion engine — checkAndPromote, writePreference, readPreferences.
 * These tests have real assertions but will fail on import until T02 creates pattern-preferences.ts.
 *
 * Uses temp directories to avoid touching real .gsd/ state.
 * Pattern: mirrors corrections-io.test.ts structure with assert/assertEq helpers.
 */

import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkAndPromote,
  writePreference,
  readPreferences,
} from "../pattern-preferences.ts";
import { writeCorrection } from "../corrections.ts";
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

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ─── Fixture ──────────────────────────────────────────────────────────────────

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

let tmpDir: string;

function setup(): void {
  tmpDir = mkdtempSync(join(tmpdir(), "gsd-preference-engine-test-"));
  mkdirSync(join(tmpDir, ".gsd", "patterns"), { recursive: true });
}

function cleanup(): void {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ─── Tests: checkAndPromote — below threshold ─────────────────────────────

console.log("\n=== checkAndPromote — below threshold (< 3 corrections) ===");

{
  setup();

  // Write 2 corrections with same category+scope (below threshold of 3)
  writeCorrection(makeValidEntry({ diagnosis_category: "code.wrong_pattern", scope: "file" }), { cwd: tmpDir });
  writeCorrection(makeValidEntry({ diagnosis_category: "code.wrong_pattern", scope: "file" }), { cwd: tmpDir });

  const result = checkAndPromote(
    { category: "code.wrong_pattern", scope: "file" },
    { cwd: tmpDir },
  );

  assertEq(result.promoted, false, "not promoted with < 3 corrections");
  assertEq(result.reason, "below_threshold", "reason is below_threshold");
  assert(result.count === 2, "count reflects actual correction count (2)");
  assert(result.confidence === undefined, "no confidence when not promoted");

  // Verify no preference file was created
  const prefs = readPreferences({}, { cwd: tmpDir });
  assertEq(prefs.length, 0, "no preferences created below threshold");

  cleanup();
}

// ─── Tests: checkAndPromote — at threshold (≥ 3) ──────────────────────────

console.log("\n=== checkAndPromote — at threshold (≥ 3 corrections) ===");

{
  setup();

  // Write exactly 3 corrections
  for (let i = 0; i < 3; i++) {
    writeCorrection(
      makeValidEntry({
        diagnosis_category: "code.missing_context",
        scope: "filetype",
        session_id: `session-${i}`,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
      }),
      { cwd: tmpDir },
    );
  }

  const result = checkAndPromote(
    { category: "code.missing_context", scope: "filetype" },
    { cwd: tmpDir },
  );

  assertEq(result.promoted, true, "promoted with 3 corrections");
  assertEq(result.count, 3, "count is 3");
  assert(result.reason === undefined, "no reason on success");

  // Verify preference was written
  const prefs = readPreferences({}, { cwd: tmpDir });
  assert(prefs.length === 1, "one preference created");
  assertEq(prefs[0].category, "code.missing_context", "preference has correct category");
  assertEq(prefs[0].scope, "filetype", "preference has correct scope");
  assert(prefs[0].source_count === 3, "source_count is 3");

  cleanup();
}

// ─── Tests: checkAndPromote — confidence formula ──────────────────────────

console.log("\n=== checkAndPromote — confidence formula: count/(count+2) ===");

{
  setup();

  // count=3 → confidence = 3/5 = 0.6
  for (let i = 0; i < 3; i++) {
    writeCorrection(
      makeValidEntry({ diagnosis_category: "code.style_mismatch", scope: "project" }),
      { cwd: tmpDir },
    );
  }

  const result3 = checkAndPromote(
    { category: "code.style_mismatch", scope: "project" },
    { cwd: tmpDir },
  );

  assertEq(result3.confidence, 0.6, "confidence = 3/(3+2) = 0.6");

  cleanup();
}

{
  setup();

  // count=5 → confidence = 5/7 ≈ 0.714
  for (let i = 0; i < 5; i++) {
    writeCorrection(
      makeValidEntry({ diagnosis_category: "code.over_engineering", scope: "global" }),
      { cwd: tmpDir },
    );
  }

  const result5 = checkAndPromote(
    { category: "code.over_engineering", scope: "global" },
    { cwd: tmpDir },
  );

  // 5/7 = 0.7142857142857143, compare with tolerance
  assert(
    result5.confidence !== undefined && Math.abs(result5.confidence - 5 / 7) < 0.001,
    "confidence ≈ 5/(5+2) ≈ 0.714",
  );

  cleanup();
}

// ─── Tests: checkAndPromote — invalid entry ───────────────────────────────

console.log("\n=== checkAndPromote — invalid entry ===");

{
  setup();

  // Missing category
  const result = checkAndPromote(
    { category: undefined as unknown as string, scope: "file" },
    { cwd: tmpDir },
  );

  assertEq(result.promoted, false, "not promoted with invalid entry");
  assertEq(result.reason, "invalid_entry", "reason is invalid_entry for missing category");

  cleanup();
}

{
  setup();

  // Invalid category value
  const result = checkAndPromote(
    { category: "not.a.category" as any, scope: "file" },
    { cwd: tmpDir },
  );

  assertEq(result.promoted, false, "not promoted with invalid category");
  assertEq(result.reason, "invalid_entry", "reason is invalid_entry for bad category");

  cleanup();
}

// ─── Tests: writePreference — create new entry ────────────────────────────

console.log("\n=== writePreference — create new entry ===");

{
  setup();

  const entry: PreferenceEntry = {
    category: "code.wrong_pattern",
    scope: "file",
    preference_text: "Prefer composition over inheritance in React components",
    confidence: 0.6,
    source_count: 3,
    last_correction_ts: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    retired_at: null,
    retired_by: null,
  };

  const result = writePreference(entry, { cwd: tmpDir });
  assertEq(result.written, true, "writePreference returns written: true");

  const prefs = readPreferences({}, { cwd: tmpDir });
  assert(prefs.length === 1, "one preference exists after write");
  assertEq(prefs[0].category, "code.wrong_pattern", "category persisted");
  assertEq(prefs[0].scope, "file", "scope persisted");
  assert(prefs[0].created_at !== undefined, "created_at set");
  assert(prefs[0].updated_at !== undefined, "updated_at set");
  assertEq(prefs[0].retired_at, null, "retired_at is null for new entry");
  assertEq(prefs[0].retired_by, null, "retired_by is null for new entry");

  cleanup();
}

// ─── Tests: writePreference — upsert existing entry ───────────────────────

console.log("\n=== writePreference — upsert existing entry ===");

{
  setup();

  const originalCreatedAt = "2025-01-01T00:00:00.000Z";

  const entry1: PreferenceEntry = {
    category: "code.stale_knowledge",
    scope: "project",
    preference_text: "Check API docs before using library methods",
    confidence: 0.6,
    source_count: 3,
    last_correction_ts: "2025-06-01T00:00:00.000Z",
    created_at: originalCreatedAt,
    updated_at: "2025-06-01T00:00:00.000Z",
    retired_at: null,
    retired_by: null,
  };

  writePreference(entry1, { cwd: tmpDir });

  // Upsert with higher confidence
  const entry2: PreferenceEntry = {
    category: "code.stale_knowledge",
    scope: "project",
    preference_text: "Always verify library version compatibility",
    confidence: 0.714,
    source_count: 5,
    last_correction_ts: "2025-07-01T00:00:00.000Z",
    created_at: "2025-07-01T00:00:00.000Z", // should be overridden to preserve original
    updated_at: "2025-07-01T00:00:00.000Z",
    retired_at: null,
    retired_by: null,
  };

  writePreference(entry2, { cwd: tmpDir });

  const prefs = readPreferences({}, { cwd: tmpDir });
  assert(prefs.length === 1, "upsert replaces existing, not duplicates");
  assertEq(prefs[0].confidence, 0.714, "confidence updated");
  assertEq(prefs[0].source_count, 5, "source_count updated");
  assertEq(prefs[0].created_at, originalCreatedAt, "created_at preserved from original");

  cleanup();
}

// ─── Tests: readPreferences — no file returns empty ───────────────────────

console.log("\n=== readPreferences — no file returns empty ===");

{
  setup();

  const prefs = readPreferences({}, { cwd: tmpDir });
  assertEq(prefs.length, 0, "readPreferences returns empty array when no file");

  cleanup();
}

// ─── Tests: readPreferences — scope filter ────────────────────────────────

console.log("\n=== readPreferences — scope filter ===");

{
  setup();

  const fileEntry: PreferenceEntry = {
    category: "code.wrong_pattern",
    scope: "file",
    preference_text: "File-scoped preference",
    confidence: 0.6,
    source_count: 3,
    last_correction_ts: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    retired_at: null,
    retired_by: null,
  };

  const projectEntry: PreferenceEntry = {
    category: "code.missing_context",
    scope: "project",
    preference_text: "Project-scoped preference",
    confidence: 0.714,
    source_count: 5,
    last_correction_ts: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    retired_at: null,
    retired_by: null,
  };

  writePreference(fileEntry, { cwd: tmpDir });
  writePreference(projectEntry, { cwd: tmpDir });

  const fileOnly = readPreferences({ scope: "file" }, { cwd: tmpDir });
  assert(fileOnly.length === 1, "scope:file returns 1 entry");
  assertEq(fileOnly[0].scope, "file", "filtered entry has scope file");

  const projectOnly = readPreferences({ scope: "project" }, { cwd: tmpDir });
  assert(projectOnly.length === 1, "scope:project returns 1 entry");
  assertEq(projectOnly[0].scope, "project", "filtered entry has scope project");

  cleanup();
}

// ─── Tests: readPreferences — status filter ───────────────────────────────

console.log("\n=== readPreferences — status filter (active/retired) ===");

{
  setup();

  const activeEntry: PreferenceEntry = {
    category: "code.wrong_pattern",
    scope: "file",
    preference_text: "Active preference",
    confidence: 0.6,
    source_count: 3,
    last_correction_ts: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    retired_at: null,
    retired_by: null,
  };

  const retiredEntry: PreferenceEntry = {
    category: "code.scope_drift",
    scope: "global",
    preference_text: "Retired preference",
    confidence: 0.8,
    source_count: 8,
    last_correction_ts: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    retired_at: new Date().toISOString(),
    retired_by: "user",
  };

  writePreference(activeEntry, { cwd: tmpDir });
  writePreference(retiredEntry, { cwd: tmpDir });

  const activeOnly = readPreferences({ status: "active" }, { cwd: tmpDir });
  assert(activeOnly.length === 1, "status:active returns 1 entry");
  assertEq(activeOnly[0].retired_at, null, "active entry has null retired_at");

  const retiredOnly = readPreferences({ status: "retired" }, { cwd: tmpDir });
  assert(retiredOnly.length === 1, "status:retired returns 1 entry");
  assert(retiredOnly[0].retired_at !== null, "retired entry has non-null retired_at");

  const all = readPreferences({}, { cwd: tmpDir });
  assertEq(all.length, 2, "no filter returns all entries");

  cleanup();
}

// ─── Tests: atomic write (no .tmp leftover) ───────────────────────────────

console.log("\n=== writePreference — atomic write (no .tmp leftover) ===");

{
  setup();

  const entry: PreferenceEntry = {
    category: "process.planning_error",
    scope: "phase",
    preference_text: "Break large tasks into smaller slices",
    confidence: 0.75,
    source_count: 6,
    last_correction_ts: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    retired_at: null,
    retired_by: null,
  };

  writePreference(entry, { cwd: tmpDir });

  const patternsDir = join(tmpDir, ".gsd", "patterns");
  const files = readdirSync(patternsDir);
  assert(!files.some(f => f.endsWith(".tmp")), "no .tmp files left after write");
  assert(files.some(f => f === "preferences.jsonl"), "preferences.jsonl exists");

  cleanup();
}

// ─── Tests: PreferenceEntry field completeness ────────────────────────────

console.log("\n=== PreferenceEntry — field completeness ===");

{
  setup();

  // Write 3 corrections to trigger promotion
  for (let i = 0; i < 3; i++) {
    writeCorrection(
      makeValidEntry({
        diagnosis_category: "process.regression",
        scope: "project",
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
      }),
      { cwd: tmpDir },
    );
  }

  checkAndPromote(
    { category: "process.regression", scope: "project" },
    { cwd: tmpDir },
  );

  const prefs = readPreferences({}, { cwd: tmpDir });
  assert(prefs.length === 1, "preference created via checkAndPromote");

  const p = prefs[0];
  // Verify all required fields exist
  assert(p.category !== undefined, "field: category exists");
  assert(p.scope !== undefined, "field: scope exists");
  assert(typeof p.preference_text === "string", "field: preference_text is string");
  assert(typeof p.confidence === "number", "field: confidence is number");
  assert(typeof p.source_count === "number", "field: source_count is number");
  assert(typeof p.last_correction_ts === "string", "field: last_correction_ts is string");
  assert(typeof p.created_at === "string", "field: created_at is string");
  assert(typeof p.updated_at === "string", "field: updated_at is string");
  assert(p.retired_at === null, "field: retired_at is null for new entry");
  assert(p.retired_by === null, "field: retired_by is null for new entry");

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
