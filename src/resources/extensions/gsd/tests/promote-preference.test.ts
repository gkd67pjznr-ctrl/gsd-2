/**
 * Tests for cross-project preference promotion — promoteToUserLevel().
 * Tests will fail on import until T04 creates promote-preference.ts.
 *
 * Uses GSD_HOME env var to redirect file location for test isolation.
 * Pattern: mirrors corrections-io.test.ts structure with assert/assertEq helpers.
 */

import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promoteToUserLevel } from "../promote-preference.ts";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string;
let originalGsdHome: string | undefined;

function setup(): void {
  tmpDir = mkdtempSync(join(tmpdir(), "gsd-promote-test-"));
  mkdirSync(tmpDir, { recursive: true });
  // Redirect GSD_HOME for test isolation
  originalGsdHome = process.env.GSD_HOME;
  process.env.GSD_HOME = tmpDir;
}

function cleanup(): void {
  // Restore original GSD_HOME
  if (originalGsdHome !== undefined) {
    process.env.GSD_HOME = originalGsdHome;
  } else {
    delete process.env.GSD_HOME;
  }
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/** Read the user-level preferences.json from the test GSD_HOME */
function readUserPrefs(): { version: string; preferences: any[] } {
  const filePath = join(tmpDir, "preferences.json");
  if (!existsSync(filePath)) return { version: "1.0", preferences: [] };
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

// ─── Test: first project creates new entry ────────────────────────────────

console.log("\n=== promoteToUserLevel — first project creates new entry ===");

{
  setup();

  const result = promoteToUserLevel(
    {
      category: "code.wrong_pattern",
      scope: "file",
      preference_text: "Prefer composition over inheritance",
      confidence: 0.6,
    },
    { projectId: "project-alpha" },
  );

  assertEq(result.promoted, false, "not promoted with only 1 project");
  assert(result.projectCount === 1, "projectCount is 1");

  const doc = readUserPrefs();
  assertEq(doc.preferences.length, 1, "one entry created");
  assertEq(doc.preferences[0].category, "code.wrong_pattern", "category stored");
  assertEq(doc.preferences[0].scope, "file", "scope stored");
  assert(
    JSON.stringify(doc.preferences[0].source_projects) === JSON.stringify(["project-alpha"]),
    "source_projects contains first project",
  );
  assertEq(doc.preferences[0].promoted_at, null, "promoted_at is null (not yet promoted)");

  cleanup();
}

// ─── Test: second project adds to source_projects ─────────────────────────

console.log("\n=== promoteToUserLevel — second project adds to source_projects ===");

{
  setup();

  // First project
  promoteToUserLevel(
    { category: "code.style_mismatch", scope: "project", preference_text: "Use 2-space indent", confidence: 0.6 },
    { projectId: "project-alpha" },
  );

  // Second project
  const result = promoteToUserLevel(
    { category: "code.style_mismatch", scope: "project", preference_text: "Use 2-space indent always", confidence: 0.7 },
    { projectId: "project-beta" },
  );

  assertEq(result.promoted, false, "not promoted with only 2 projects");
  assert(result.projectCount === 2, "projectCount is 2");

  const doc = readUserPrefs();
  assertEq(doc.preferences.length, 1, "still one entry (upserted)");
  assert(
    doc.preferences[0].source_projects.includes("project-alpha") &&
    doc.preferences[0].source_projects.includes("project-beta"),
    "source_projects contains both projects",
  );

  cleanup();
}

// ─── Test: third project triggers promotion ───────────────────────────────

console.log("\n=== promoteToUserLevel — third project triggers promotion ===");

{
  setup();

  // Three distinct projects
  promoteToUserLevel(
    { category: "code.missing_context", scope: "file", preference_text: "Read full function first", confidence: 0.6 },
    { projectId: "project-alpha" },
  );
  promoteToUserLevel(
    { category: "code.missing_context", scope: "file", preference_text: "Read full function first", confidence: 0.7 },
    { projectId: "project-beta" },
  );
  const result = promoteToUserLevel(
    { category: "code.missing_context", scope: "file", preference_text: "Read full function first", confidence: 0.8 },
    { projectId: "project-gamma" },
  );

  assertEq(result.promoted, true, "promoted with 3 projects");
  assert(result.projectCount === 3, "projectCount is 3");

  const doc = readUserPrefs();
  assert(doc.preferences[0].promoted_at !== null, "promoted_at is set");
  assertEq(doc.preferences[0].source_projects.length, 3, "source_projects has 3 entries");

  cleanup();
}

// ─── Test: re-promotion is idempotent ─────────────────────────────────────

console.log("\n=== promoteToUserLevel — re-promotion is idempotent ===");

{
  setup();

  // Promote via 3 projects
  promoteToUserLevel(
    { category: "code.over_engineering", scope: "global", preference_text: "Keep it simple", confidence: 0.6 },
    { projectId: "p1" },
  );
  promoteToUserLevel(
    { category: "code.over_engineering", scope: "global", preference_text: "Keep it simple", confidence: 0.7 },
    { projectId: "p2" },
  );
  promoteToUserLevel(
    { category: "code.over_engineering", scope: "global", preference_text: "Keep it simple", confidence: 0.8 },
    { projectId: "p3" },
  );

  const docBefore = readUserPrefs();
  const promotedAtBefore = docBefore.preferences[0].promoted_at;

  // 4th project — should NOT overwrite promoted_at
  const result = promoteToUserLevel(
    { category: "code.over_engineering", scope: "global", preference_text: "Keep it simple", confidence: 0.9 },
    { projectId: "p4" },
  );

  assertEq(result.promoted, true, "still reports promoted with 4 projects");

  const docAfter = readUserPrefs();
  assertEq(docAfter.preferences[0].promoted_at, promotedAtBefore, "promoted_at NOT overwritten by 4th project");
  assertEq(docAfter.preferences[0].source_projects.length, 4, "source_projects includes 4th project");

  cleanup();
}

// ─── Test: confidence takes max ───────────────────────────────────────────

console.log("\n=== promoteToUserLevel — confidence takes max ===");

{
  setup();

  // First project with confidence 0.8
  promoteToUserLevel(
    { category: "code.scope_drift", scope: "phase", preference_text: "Stay focused", confidence: 0.8 },
    { projectId: "p1" },
  );

  // Second project with lower confidence 0.5 — should not decrease
  promoteToUserLevel(
    { category: "code.scope_drift", scope: "phase", preference_text: "Stay focused", confidence: 0.5 },
    { projectId: "p2" },
  );

  const doc = readUserPrefs();
  assertEq(doc.preferences[0].confidence, 0.8, "confidence stays at max (0.8), not replaced by 0.5");

  // Third project with higher confidence 0.9 — should increase
  promoteToUserLevel(
    { category: "code.scope_drift", scope: "phase", preference_text: "Stay focused", confidence: 0.9 },
    { projectId: "p3" },
  );

  const doc2 = readUserPrefs();
  assertEq(doc2.preferences[0].confidence, 0.9, "confidence updated to new max (0.9)");

  cleanup();
}

// ─── Test: GSD_HOME env var redirects file location ───────────────────────

console.log("\n=== promoteToUserLevel — GSD_HOME env var redirects file location ===");

{
  setup();

  promoteToUserLevel(
    { category: "process.regression", scope: "project", preference_text: "Test redirect", confidence: 0.6 },
    { projectId: "redirect-test" },
  );

  // File should be in GSD_HOME (tmpDir), not ~/.gsd/
  const filePath = join(tmpDir, "preferences.json");
  assert(existsSync(filePath), "preferences.json created in GSD_HOME directory");

  const content = JSON.parse(readFileSync(filePath, "utf-8"));
  assert(content.preferences.length === 1, "entry written to GSD_HOME location");
  assertEq(content.preferences[0].category, "process.regression", "correct entry in redirected file");

  cleanup();
}

// ─── Test: missing required fields returns error ──────────────────────────

console.log("\n=== promoteToUserLevel — missing required fields ===");

{
  setup();

  // Missing category
  const result1 = promoteToUserLevel(
    { scope: "file", preference_text: "No category", confidence: 0.6 } as any,
    { projectId: "p1" },
  );
  assertEq(result1.promoted, false, "not promoted with missing category");
  assertEq(result1.reason, "missing_fields", "reason is missing_fields for missing category");

  // Missing projectId
  const result2 = promoteToUserLevel(
    { category: "code.wrong_pattern", scope: "file", preference_text: "Test", confidence: 0.6 },
    { projectId: "" } as any,
  );
  assertEq(result2.promoted, false, "not promoted with empty projectId");
  assertEq(result2.reason, "missing_fields", "reason is missing_fields for empty projectId");

  // Missing scope
  const result3 = promoteToUserLevel(
    { category: "code.wrong_pattern", preference_text: "No scope", confidence: 0.6 } as any,
    { projectId: "p1" },
  );
  assertEq(result3.promoted, false, "not promoted with missing scope");
  assertEq(result3.reason, "missing_fields", "reason is missing_fields for missing scope");

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
