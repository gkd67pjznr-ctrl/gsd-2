/**
 * Tests for correction detector — programmatic detection of retries, stuck loops,
 * timeouts, and reverts from session data.
 * These tests have real assertions but will fail on import until T03 creates correction-detector.ts.
 */

import {
  detectCorrections,
  type DetectionResult,
} from "../correction-detector.ts";
import { isValidEntry, type CorrectionEntry } from "../correction-types.ts";

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

// ─── Fixture helpers ──────────────────────────────────────────────────────────

/** Simulates a session entry with tool use and result. */
function makeToolEntry(tool: string, input: Record<string, unknown>, result: string, ts?: number) {
  return {
    type: "tool_use" as const,
    tool,
    input,
    result,
    timestamp: new Date(ts ?? Date.now()).toISOString(),
  };
}

/** Simulates a retry pattern: same command run multiple times. */
function makeRetrySession() {
  const base = Date.now();
  return {
    session_id: "retry-session",
    phase: "executing",
    entries: [
      makeToolEntry("bash", { command: "npm test" }, "FAIL: 3 tests failed", base),
      makeToolEntry("bash", { command: "npm test" }, "FAIL: 3 tests failed", base + 5000),
      makeToolEntry("bash", { command: "npm test" }, "FAIL: 2 tests failed", base + 10000),
      makeToolEntry("bash", { command: "npm test" }, "PASS: all tests passed", base + 15000),
    ],
  };
}

/** Simulates a stuck loop: same edit applied repeatedly. */
function makeStuckSession() {
  const base = Date.now();
  return {
    session_id: "stuck-session",
    phase: "executing",
    entries: [
      makeToolEntry("edit", { path: "src/foo.ts", oldText: "a", newText: "b" }, "ok", base),
      makeToolEntry("edit", { path: "src/foo.ts", oldText: "b", newText: "a" }, "ok", base + 2000),
      makeToolEntry("edit", { path: "src/foo.ts", oldText: "a", newText: "b" }, "ok", base + 4000),
      makeToolEntry("edit", { path: "src/foo.ts", oldText: "b", newText: "a" }, "ok", base + 6000),
    ],
  };
}

/** Simulates a timeout recovery pattern. */
function makeTimeoutSession() {
  const base = Date.now();
  return {
    session_id: "timeout-session",
    phase: "executing",
    entries: [
      makeToolEntry("bash", { command: "curl http://localhost:3000", timeout: 30 }, "timed out after 30s", base),
      makeToolEntry("bash", { command: "curl http://localhost:3000", timeout: 60 }, "200 OK", base + 35000),
    ],
  };
}

/** Simulates a revert: file content reverted to earlier state. */
function makeRevertSession() {
  const base = Date.now();
  return {
    session_id: "revert-session",
    phase: "executing",
    entries: [
      makeToolEntry("write", { path: "src/config.ts", content: "export const x = 1;" }, "ok", base),
      makeToolEntry("write", { path: "src/config.ts", content: "export const x = 2;" }, "ok", base + 5000),
      makeToolEntry("write", { path: "src/config.ts", content: "export const x = 1;" }, "ok", base + 10000),
    ],
  };
}

/** Clean session — no patterns that indicate corrections. */
function makeCleanSession() {
  const base = Date.now();
  return {
    session_id: "clean-session",
    phase: "executing",
    entries: [
      makeToolEntry("bash", { command: "ls" }, "file1.ts\nfile2.ts", base),
      makeToolEntry("read", { path: "src/foo.ts" }, "const x = 1;", base + 1000),
      makeToolEntry("write", { path: "src/bar.ts", content: "export {}" }, "ok", base + 2000),
    ],
  };
}

// ─── Tests: detect retry ──────────────────────────────────────────────────────

console.log("\n=== detectCorrections — retry detection ===");

{
  const session = makeRetrySession();
  const results = detectCorrections(session);

  assert(results.length > 0, "detects corrections from retry session");
  assert(
    results.some(r => r.diagnosis_category === "process.implementation_bug" || r.diagnosis_category === "process.regression"),
    "retry classified as implementation_bug or regression"
  );
  assert(
    results.every(r => r.source === "programmatic"),
    "all detected corrections have source 'programmatic'"
  );
  assert(
    results.every(r => r.session_id === "retry-session"),
    "session_id propagated to corrections"
  );
}

// ─── Tests: detect stuck loop ─────────────────────────────────────────────────

console.log("\n=== detectCorrections — stuck loop detection ===");

{
  const session = makeStuckSession();
  const results = detectCorrections(session);

  assert(results.length > 0, "detects corrections from stuck session");
  assert(
    results.some(r => r.diagnosis_text.toLowerCase().includes("stuck") || r.diagnosis_text.toLowerCase().includes("loop") || r.diagnosis_text.toLowerCase().includes("oscillat")),
    "stuck detection mentions the pattern in diagnosis_text"
  );
}

// ─── Tests: detect timeout ────────────────────────────────────────────────────

console.log("\n=== detectCorrections — timeout detection ===");

{
  const session = makeTimeoutSession();
  const results = detectCorrections(session);

  assert(results.length > 0, "detects corrections from timeout session");
  assert(
    results.some(r => r.diagnosis_text.toLowerCase().includes("timeout") || r.diagnosis_text.toLowerCase().includes("timed out")),
    "timeout detection mentions timeout in diagnosis_text"
  );
}

// ─── Tests: detect revert ─────────────────────────────────────────────────────

console.log("\n=== detectCorrections — revert detection ===");

{
  const session = makeRevertSession();
  const results = detectCorrections(session);

  assert(results.length > 0, "detects corrections from revert session");
  assert(
    results.some(r => r.diagnosis_text.toLowerCase().includes("revert")),
    "revert detection mentions revert in diagnosis_text"
  );
}

// ─── Tests: clean session produces empty ──────────────────────────────────────

console.log("\n=== detectCorrections — clean session ===");

{
  const session = makeCleanSession();
  const results = detectCorrections(session);

  assertEq(results.length, 0, "clean session produces no corrections");
}

// ─── Tests: all entries pass isValidEntry() ──────────────────────────────────

console.log("\n=== detectCorrections — all entries well-formed ===");

{
  const sessions = [makeRetrySession(), makeStuckSession(), makeTimeoutSession(), makeRevertSession()];
  for (const session of sessions) {
    const results = detectCorrections(session);
    for (const entry of results) {
      assert(isValidEntry(entry), `entry from ${session.session_id} passes isValidEntry()`);
    }
  }
}

// ─── Tests: correct diagnosis categories ─────────────────────────────────────

console.log("\n=== detectCorrections — diagnosis categories ===");

{
  const retryResults = detectCorrections(makeRetrySession());
  assert(
    retryResults.some(r => r.diagnosis_category === "process.implementation_bug"),
    "retry detection uses process.implementation_bug category"
  );

  const timeoutResults = detectCorrections(makeTimeoutSession());
  assert(
    timeoutResults.some(r => r.diagnosis_category === "process.planning_error"),
    "timeout detection uses process.planning_error category"
  );

  const revertResults = detectCorrections(makeRevertSession());
  assert(
    revertResults.some(r => r.diagnosis_category === "code.wrong_pattern"),
    "revert detection uses code.wrong_pattern category"
  );
}

// ─── Tests: conservative thresholds — no false positives ─────────────────────

console.log("\n=== detectCorrections — conservative thresholds ===");

{
  // A session with 1 command failure is normal — should not flag
  const singleFailSession = {
    session_id: "single-fail",
    phase: "executing",
    entries: [
      makeToolEntry("bash", { command: "npm test" }, "FAIL: 1 test failed"),
      makeToolEntry("bash", { command: "npm test" }, "PASS: all tests passed"),
    ],
  };
  const singleFailResults = detectCorrections(singleFailSession);
  assertEq(singleFailResults.length, 0, "single retry does not trigger detection");

  // A session with 1 file rewrite is normal — should not flag
  const singleRewriteSession = {
    session_id: "single-rewrite",
    phase: "executing",
    entries: [
      makeToolEntry("write", { path: "src/foo.ts", content: "v1" }, "ok"),
      makeToolEntry("write", { path: "src/foo.ts", content: "v2" }, "ok"),
    ],
  };
  const singleRewriteResults = detectCorrections(singleRewriteSession);
  assertEq(singleRewriteResults.length, 0, "single file rewrite does not trigger detection");

  // A session with 1 edit on a file is normal — should not flag
  const singleEditSession = {
    session_id: "single-edit",
    phase: "executing",
    entries: [
      makeToolEntry("edit", { path: "src/foo.ts", oldText: "a", newText: "b" }, "ok"),
    ],
  };
  const singleEditResults = detectCorrections(singleEditSession);
  assertEq(singleEditResults.length, 0, "single edit does not trigger detection");
}

// ─── Tests: edge cases ───────────────────────────────────────────────────────

console.log("\n=== detectCorrections — edge cases ===");

{
  // Empty entries
  const emptyResults = detectCorrections({ session_id: "empty", entries: [] });
  assertEq(emptyResults.length, 0, "empty entries return empty array");

  // Null/undefined safety — never throws
  let threw = false;
  try {
    detectCorrections(null as any);
    detectCorrections(undefined as any);
    detectCorrections({ session_id: "bad", entries: null as any });
  } catch {
    threw = true;
  }
  assert(!threw, "never throws on bad input");
}

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed ✓");
}
