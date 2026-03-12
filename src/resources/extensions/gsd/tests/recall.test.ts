/**
 * Tests for recall block assembly — buildRecallBlock().
 * Tests will fail on import until T02 creates recall.ts.
 *
 * Uses temp directories to avoid touching real .gsd/ state.
 * Pattern: mirrors corrections-io.test.ts structure with assert/assertEq helpers.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildRecallBlock } from "../recall.ts";
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
    category: "code.missing_context",
    scope: "project",
    preference_text: "Always read the full function before editing",
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

/** Estimate tokens using the same formula as the module under test */
function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length / 0.75);
}

let tmpDir: string;
let savedGsdHome: string | undefined;

function setup(): void {
  tmpDir = mkdtempSync(join(tmpdir(), "gsd-recall-test-"));
  mkdirSync(join(tmpDir, ".gsd", "patterns"), { recursive: true });
  // Redirect user-level preferences to temp dir so tests don't read real ~/.gsd/
  savedGsdHome = process.env.GSD_HOME;
  process.env.GSD_HOME = join(tmpDir, ".gsd");
}

function cleanup(): void {
  try {
    // Restore GSD_HOME
    if (savedGsdHome === undefined) {
      delete process.env.GSD_HOME;
    } else {
      process.env.GSD_HOME = savedGsdHome;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/** Write corrections to the active corrections.jsonl */
function writeCorrections(entries: CorrectionEntry[]): void {
  const filePath = join(tmpDir, ".gsd", "patterns", "corrections.jsonl");
  const content = entries.map(e => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(filePath, content);
}

/** Write preferences to preferences.jsonl */
function writePreferences(entries: PreferenceEntry[]): void {
  const filePath = join(tmpDir, ".gsd", "patterns", "preferences.jsonl");
  const content = entries.map(e => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(filePath, content);
}

/** Write preferences.md with optional kill switch */
function writePreferencesMd(correctionCapture: boolean): void {
  writeFileSync(
    join(tmpDir, ".gsd", "preferences.md"),
    `---\ncorrection_capture: ${correctionCapture}\n---\n`,
  );
}

// ─── Test: empty state returns self-report instructions only ──────────────

console.log("\n=== buildRecallBlock — empty state ===");

{
  setup();

  // No corrections, no preferences
  const result = buildRecallBlock({ cwd: tmpDir });

  // With no learned data, should still return self-report instructions
  assert(typeof result === "string", "returns a string");
  assert(result.includes("Self-report") || result.includes("self_report") || result.includes("self-report") || result.includes("correction"), "contains self-report instructions");
  assert(!result.includes("<system-reminder>"), "no system-reminder block when no recall data");

  cleanup();
}

// ─── Test: preferences-only recall ────────────────────────────────────────

console.log("\n=== buildRecallBlock — preferences only ===");

{
  setup();

  const prefs = [
    makePreference({ category: "code.wrong_pattern", preference_text: "Prefer composition over inheritance" }),
    makePreference({ category: "code.style_mismatch", preference_text: "Use 2-space indentation" }),
  ];
  writePreferences(prefs);

  const result = buildRecallBlock({ cwd: tmpDir });

  assert(result.includes("<system-reminder>"), "wraps in system-reminder block");
  assert(result.includes("</system-reminder>"), "closes system-reminder block");
  assert(result.includes("Prefer composition over inheritance"), "includes first preference text");
  assert(result.includes("Use 2-space indentation"), "includes second preference text");

  cleanup();
}

// ─── Test: corrections-only recall ────────────────────────────────────────

console.log("\n=== buildRecallBlock — corrections only ===");

{
  setup();

  const corrections = [
    makeCorrection({ correction_to: "Use the existing utility function", diagnosis_category: "code.wrong_pattern" }),
    makeCorrection({ correction_to: "Check file exists before reading", diagnosis_category: "code.missing_context" }),
  ];
  writeCorrections(corrections);

  const result = buildRecallBlock({ cwd: tmpDir });

  assert(result.includes("<system-reminder>"), "wraps in system-reminder block");
  assert(result.includes("Use the existing utility function"), "includes first correction text");
  assert(result.includes("Check file exists before reading"), "includes second correction text");

  cleanup();
}

// ─── Test: mixed slot allocation — preferences first, corrections fill remaining ──

console.log("\n=== buildRecallBlock — mixed slot allocation ===");

{
  setup();

  // 4 preferences take priority
  const prefs = [
    makePreference({ category: "code.wrong_pattern", preference_text: "Pref 1" }),
    makePreference({ category: "code.style_mismatch", preference_text: "Pref 2" }),
    makePreference({ category: "code.missing_context", preference_text: "Pref 3" }),
    makePreference({ category: "code.over_engineering", preference_text: "Pref 4" }),
  ];
  writePreferences(prefs);

  // 8 corrections — only 6 should fit (10 max - 4 prefs = 6 remaining slots)
  const corrections: CorrectionEntry[] = [];
  for (let i = 0; i < 8; i++) {
    corrections.push(makeCorrection({
      correction_to: `Correction ${i + 1}`,
      diagnosis_category: "process.planning_error",
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
    }));
  }
  writeCorrections(corrections);

  const result = buildRecallBlock({ cwd: tmpDir });

  // All 4 preferences should appear
  assert(result.includes("Pref 1"), "preference 1 included");
  assert(result.includes("Pref 4"), "preference 4 included");
  // First corrections should appear (up to remaining slots)
  assert(result.includes("Correction 1"), "first correction included");
  // Total entries should not exceed 10
  // Count the number of list items (lines starting with "- [")
  const entryLines = result.split("\n").filter(l => l.trim().startsWith("- ["));
  assert(entryLines.length <= 10, `total entries ≤ 10 (got ${entryLines.length})`);

  cleanup();
}

// ─── Test: token budget enforcement ───────────────────────────────────────

console.log("\n=== buildRecallBlock — token budget (20 verbose entries under 3K) ===");

{
  setup();

  // Create 20 verbose corrections — each with ~50 words in correction_to
  const verboseCorrections: CorrectionEntry[] = [];
  for (let i = 0; i < 20; i++) {
    const verboseText = Array(50).fill("word").join(" ") + ` entry-${i}`;
    verboseCorrections.push(makeCorrection({
      correction_to: verboseText,
      diagnosis_category: "code.wrong_pattern",
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
      session_id: `session-${i}`,
    }));
  }
  writeCorrections(verboseCorrections);

  const result = buildRecallBlock({ cwd: tmpDir });
  const tokenCount = estimateTokens(result);

  assert(tokenCount <= 3000, `token count ≤ 3000 (got ${tokenCount})`);
  assert(result.length > 0, "non-empty result despite budget pressure");

  cleanup();
}

// ─── Test: deduplication — corrections matching promoted preference excluded ──

console.log("\n=== buildRecallBlock — dedup (corrections matching preference excluded) ===");

{
  setup();

  // Preference for code.wrong_pattern:file
  const prefs = [
    makePreference({
      category: "code.wrong_pattern",
      scope: "file",
      preference_text: "Promoted preference for wrong_pattern:file",
    }),
  ];
  writePreferences(prefs);

  // Corrections: one matches the preference's category:scope, one doesn't
  const corrections = [
    makeCorrection({
      correction_to: "This correction should be EXCLUDED (matches preference)",
      diagnosis_category: "code.wrong_pattern",
      scope: "file",
    }),
    makeCorrection({
      correction_to: "This correction should be INCLUDED (different category)",
      diagnosis_category: "code.missing_context",
      scope: "project",
    }),
  ];
  writeCorrections(corrections);

  const result = buildRecallBlock({ cwd: tmpDir });

  assert(result.includes("Promoted preference for wrong_pattern:file"), "preference included");
  assert(!result.includes("should be EXCLUDED"), "matching correction excluded by dedup");
  assert(result.includes("should be INCLUDED"), "non-matching correction included");

  cleanup();
}

// ─── Test: kill switch — correction_capture: false returns empty ───────────

console.log("\n=== buildRecallBlock — kill switch ===");

{
  setup();

  writePreferencesMd(false);

  // Even with data present, kill switch returns empty
  writePreferences([makePreference()]);
  writeCorrections([makeCorrection()]);

  // Need to change cwd so loadEffectiveGSDPreferences() picks up our test prefs
  const originalCwd = process.cwd();
  process.chdir(tmpDir);

  try {
    const result = buildRecallBlock({ cwd: tmpDir });
    assertEq(result, "", "kill switch returns empty string");
  } finally {
    process.chdir(originalCwd);
  }

  cleanup();
}

// ─── Test: self-report instructions at end of non-empty recall ────────────

console.log("\n=== buildRecallBlock — self-report instructions preserved ===");

{
  setup();

  writePreferences([makePreference({ preference_text: "Test preference for self-report check" })]);

  const result = buildRecallBlock({ cwd: tmpDir });

  // Self-report instructions should appear after the recall block
  const reminderEnd = result.lastIndexOf("</system-reminder>");
  const selfReportIdx = result.indexOf("self_report") !== -1
    ? result.indexOf("self_report")
    : result.indexOf("Self-report") !== -1
      ? result.indexOf("Self-report")
      : result.indexOf("self-report");

  assert(selfReportIdx !== -1, "self-report instructions present in output");
  assert(selfReportIdx > reminderEnd || reminderEnd === -1, "self-report instructions appear after system-reminder block");

  cleanup();
}

// ─── Test: user-level preferences included in recall ──────────────────────

console.log("\n=== buildRecallBlock — user-level preferences ===");

{
  setup();

  // Write a promoted user-level preference to GSD_HOME/preferences.json
  const userPrefsPath = join(tmpDir, ".gsd", "preferences.json");
  const userDoc = {
    version: "1.0",
    preferences: [
      {
        category: "code.stale_knowledge",
        scope: "global",
        preference_text: "Always check docs before assuming API shape",
        confidence: 0.8,
        source_projects: ["proj-a", "proj-b", "proj-c"],
        promoted_at: "2026-01-15T00:00:00Z",
        updated_at: "2026-01-15T00:00:00Z",
      },
      {
        // Not promoted yet — should be excluded
        category: "code.wrong_pattern",
        scope: "file",
        preference_text: "This should NOT appear — not promoted",
        confidence: 0.5,
        source_projects: ["proj-a"],
        promoted_at: null,
        updated_at: "2026-01-15T00:00:00Z",
      },
    ],
  };
  writeFileSync(userPrefsPath, JSON.stringify(userDoc, null, 2));

  // No project-level preferences — only user-level
  const result = buildRecallBlock({ cwd: tmpDir });

  assert(result.includes("Always check docs before assuming API shape"), "promoted user-level preference included in recall");
  assert(!result.includes("This should NOT appear"), "non-promoted user-level preference excluded");
  assert(result.includes("system-reminder"), "recall block has system-reminder wrapper");

  cleanup();
}

// ─── Test: project-level preference wins over duplicate user-level ─────────

console.log("\n=== buildRecallBlock — project-level dedup over user-level ===");

{
  setup();

  // Project-level preference for code.wrong_pattern:file
  writePreferences([
    makePreference({
      category: "code.wrong_pattern",
      scope: "file",
      preference_text: "Project-level: use helper function",
    }),
  ]);

  // User-level preference for same category:scope
  const userPrefsPath = join(tmpDir, ".gsd", "preferences.json");
  const userDoc = {
    version: "1.0",
    preferences: [
      {
        category: "code.wrong_pattern",
        scope: "file",
        preference_text: "User-level: this should be deduped out",
        confidence: 0.8,
        source_projects: ["proj-a", "proj-b", "proj-c"],
        promoted_at: "2026-01-15T00:00:00Z",
        updated_at: "2026-01-15T00:00:00Z",
      },
    ],
  };
  writeFileSync(userPrefsPath, JSON.stringify(userDoc, null, 2));

  const result = buildRecallBlock({ cwd: tmpDir });

  assert(result.includes("Project-level: use helper function"), "project-level preference present");
  assert(!result.includes("User-level: this should be deduped out"), "user-level duplicate excluded — project wins");

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
