/**
 * Tests for corrections I/O — write, read, rotate, validate, truncate lifecycle.
 * These tests have real assertions but will fail on import until T02 creates corrections.ts.
 *
 * Uses a temp directory to avoid touching real .gsd/ state.
 */

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  writeCorrection,
  readCorrections,
  rotateCorrections,
} from "../corrections.ts";
import type { CorrectionEntry } from "../correction-types.ts";

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
  tmpDir = mkdtempSync(join(tmpdir(), "gsd-corrections-io-test-"));
  mkdirSync(join(tmpDir, ".gsd", "patterns"), { recursive: true });
}

function cleanup(): void {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ─── Tests: write valid entry ─────────────────────────────────────────────────

console.log("\n=== writeCorrection — valid entry ===");

{
  setup();

  const entry = makeValidEntry();
  const result = writeCorrection(entry, { cwd: tmpDir });

  assert(result.written === true, "writeCorrection returns written: true");
  assert(result.reason === undefined, "no reason on success");

  const filePath = join(tmpDir, ".gsd", "patterns", "corrections.jsonl");
  assert(existsSync(filePath), "corrections.jsonl created");

  const lines = readFileSync(filePath, "utf-8").split("\n").filter(l => l.trim() !== "");
  assertEq(lines.length, 1, "file has 1 line");

  const parsed = JSON.parse(lines[0]);
  assertEq(parsed.correction_from, entry.correction_from, "correction_from persisted");
  assertEq(parsed.diagnosis_category, entry.diagnosis_category, "diagnosis_category persisted");

  cleanup();
}

// ─── Tests: write invalid entry rejected ──────────────────────────────────────

console.log("\n=== writeCorrection — invalid entry rejected ===");

{
  setup();

  // Missing required field
  const incomplete = makeValidEntry();
  delete (incomplete as Record<string, unknown>).diagnosis_category;
  const result = writeCorrection(incomplete, { cwd: tmpDir });

  assertEq(result.written, false, "rejects invalid entry");
  assertEq(result.reason, "invalid_entry", "reason is invalid_entry");

  cleanup();
}

// ─── Tests: field truncation ──────────────────────────────────────────────────

console.log("\n=== writeCorrection — field truncation ===");

{
  setup();

  const longStr = "a".repeat(300);
  const entry = makeValidEntry({
    correction_from: longStr,
    correction_to: longStr,
  });
  writeCorrection(entry, { cwd: tmpDir });

  const filePath = join(tmpDir, ".gsd", "patterns", "corrections.jsonl");
  const parsed = JSON.parse(readFileSync(filePath, "utf-8").trim());

  assert(parsed.correction_from.length <= 200, "correction_from truncated to ≤200 chars");
  assert(parsed.correction_to.length <= 200, "correction_to truncated to ≤200 chars");

  cleanup();
}

// ─── Tests: read with no file returns empty ───────────────────────────────────

console.log("\n=== readCorrections — no file returns empty ===");

{
  setup();

  const entries = readCorrections({}, { cwd: tmpDir });
  assertEq(entries.length, 0, "readCorrections returns empty array when no file");

  cleanup();
}

// ─── Tests: read with status filter ───────────────────────────────────────────

console.log("\n=== readCorrections — status filter ===");

{
  setup();

  const active = makeValidEntry({ session_id: "active-001" });
  const retired = makeValidEntry({
    session_id: "retired-001",
    retired_at: new Date().toISOString(),
    retired_by: "user",
  });

  writeCorrection(active, { cwd: tmpDir });
  writeCorrection(retired, { cwd: tmpDir });

  const activeOnly = readCorrections({ status: "active" }, { cwd: tmpDir });
  assert(activeOnly.length === 1, "status:active returns only active entries");
  assertEq(activeOnly[0].session_id, "active-001", "active entry is the non-retired one");

  const retiredOnly = readCorrections({ status: "retired" }, { cwd: tmpDir });
  assert(retiredOnly.length === 1, "status:retired returns only retired entries");
  assertEq(retiredOnly[0].session_id, "retired-001", "retired entry is the one with retired_at");

  const all = readCorrections({}, { cwd: tmpDir });
  assertEq(all.length, 2, "no filter returns all entries");

  cleanup();
}

// ─── Tests: rotation at threshold ─────────────────────────────────────────────

console.log("\n=== writeCorrection — rotation at threshold ===");

{
  setup();

  // Write maxEntries lines directly to simulate reaching threshold
  const filePath = join(tmpDir, ".gsd", "patterns", "corrections.jsonl");
  const maxEntries = 100; // test with a small threshold
  const lines: string[] = [];
  for (let i = 0; i < maxEntries; i++) {
    lines.push(JSON.stringify(makeValidEntry({ session_id: `fill-${i}` })));
  }
  writeFileSync(filePath, lines.join("\n") + "\n");

  // Write one more — should trigger rotation
  writeCorrection(makeValidEntry({ session_id: "post-rotate" }), { cwd: tmpDir, maxEntries });

  const patternsDir = join(tmpDir, ".gsd", "patterns");
  const files = readdirSync(patternsDir).filter(f => f.startsWith("corrections"));

  assert(files.length >= 2, "rotation created an archive file");
  assert(files.some(f => f.startsWith("corrections-") && f.endsWith(".jsonl")), "archive file has dated name");

  // New file should have only the post-rotate entry
  const newContent = readFileSync(filePath, "utf-8").trim();
  const newLines = newContent.split("\n").filter(l => l.trim() !== "");
  assert(newLines.length === 1, "new corrections.jsonl has 1 entry after rotation");

  cleanup();
}

// ─── Tests: archive cleanup by retention ──────────────────────────────────────

console.log("\n=== writeCorrection — archive cleanup by retention ===");

{
  setup();

  const patternsDir = join(tmpDir, ".gsd", "patterns");

  // Create an old archive file (simulating past retention)
  const oldArchive = join(patternsDir, "corrections-2020-01-01.jsonl");
  writeFileSync(oldArchive, JSON.stringify(makeValidEntry()) + "\n");

  // Set mtime to far past to simulate old file
  const { utimesSync } = await import("node:fs");
  const oldDate = new Date("2020-01-01");
  utimesSync(oldArchive, oldDate, oldDate);

  // Write enough to trigger rotation + cleanup
  const filePath = join(tmpDir, ".gsd", "patterns", "corrections.jsonl");
  const lines: string[] = [];
  for (let i = 0; i < 100; i++) {
    lines.push(JSON.stringify(makeValidEntry({ session_id: `fill-${i}` })));
  }
  writeFileSync(filePath, lines.join("\n") + "\n");

  writeCorrection(makeValidEntry({ session_id: "trigger" }), { cwd: tmpDir, maxEntries: 100, retentionDays: 90 });

  // Old archive should be cleaned up
  assert(!existsSync(oldArchive), "old archive cleaned up by retention policy");

  cleanup();
}

// ─── Tests: kill switch via preferences ───────────────────────────────────────

console.log("\n=== writeCorrection — kill switch ===");

{
  setup();

  // Create a preferences.md in the tmp dir with correction_capture: false
  const prefsDir = join(tmpDir, ".gsd");
  mkdirSync(prefsDir, { recursive: true });
  writeFileSync(
    join(prefsDir, "preferences.md"),
    "---\ncorrection_capture: false\n---\n",
  );

  // Temporarily change cwd so loadEffectiveGSDPreferences() picks up our test prefs
  const originalCwd = process.cwd();
  process.chdir(tmpDir);

  try {
    const entry = makeValidEntry();
    const result = writeCorrection(entry, { cwd: tmpDir });

    assertEq(result.written, false, "kill switch blocks write");
    assertEq(result.reason, "capture_disabled", "reason is capture_disabled");

    // Verify no file was created
    const filePath = join(tmpDir, ".gsd", "patterns", "corrections.jsonl");
    assert(!existsSync(filePath), "no corrections file created when capture disabled");
  } finally {
    process.chdir(originalCwd);
  }

  cleanup();
}

// ─── Tests: rotateCorrections standalone ──────────────────────────────────────

console.log("\n=== rotateCorrections — standalone rotation ===");

{
  setup();

  const patternsDir = join(tmpDir, ".gsd", "patterns");
  const filePath = join(patternsDir, "corrections.jsonl");

  // Write entries below threshold — should not rotate
  const fewLines: string[] = [];
  for (let i = 0; i < 5; i++) {
    fewLines.push(JSON.stringify(makeValidEntry({ session_id: `few-${i}` })));
  }
  writeFileSync(filePath, fewLines.join("\n") + "\n");

  rotateCorrections({ cwd: tmpDir, threshold: 10 });
  assert(existsSync(filePath), "no rotation when below threshold");

  // Now write entries at threshold — should rotate
  const manyLines: string[] = [];
  for (let i = 0; i < 10; i++) {
    manyLines.push(JSON.stringify(makeValidEntry({ session_id: `many-${i}` })));
  }
  writeFileSync(filePath, manyLines.join("\n") + "\n");

  rotateCorrections({ cwd: tmpDir, threshold: 10 });

  const files = readdirSync(patternsDir).filter(f => f.startsWith("corrections"));
  assert(files.some(f => f.startsWith("corrections-") && f.endsWith(".jsonl")), "archive created by rotateCorrections");
  assert(!existsSync(filePath), "active file renamed away after rotation");

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
