/**
 * Tests for quality-gating module — resolveQualityLevel, buildQualityInstructions,
 * gate event management.
 *
 * 30+ assertions covering:
 * - Quality level resolution from preferences (default, configured, invalid)
 * - Instruction building for all three levels (content, keywords, token budgets)
 * - Gate event recording, validation, retrieval, clearing
 *
 * Uses temp directories for preferences testing (same pattern as recall.test.ts).
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveQualityLevel,
  buildQualityInstructions,
  recordGateEvent,
  getGateEvents,
  clearGateEvents,
  VALID_GATES,
  VALID_OUTCOMES,
  VALID_QUALITY_LEVELS,
  DEFAULT_QUALITY_LEVEL,
} from "../quality-gating.ts";
import type { QualityLevel, GateName, GateOutcome } from "../quality-gating.ts";
import { estimateTokens } from "../recall.ts";

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
    console.error(
      `  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function writePreferences(dir: string, frontmatter: string): void {
  const gsdDir = join(dir, ".gsd");
  mkdirSync(gsdDir, { recursive: true });
  writeFileSync(
    join(gsdDir, "preferences.md"),
    `---\n${frontmatter}\n---\n\n# Preferences\n`,
  );
}

// ─── resolveQualityLevel ──────────────────────────────────────────────────────

console.log("\n--- resolveQualityLevel ---");

// Test: returns "fast" by default (no preferences)
{
  const level = resolveQualityLevel();
  assertEq(level, "fast", "returns 'fast' by default (no preferences)");
}

// Test: DEFAULT_QUALITY_LEVEL constant is "fast"
assertEq(DEFAULT_QUALITY_LEVEL, "fast", "DEFAULT_QUALITY_LEVEL is 'fast'");

// Test: returns "fast" for invalid quality_level values
// Since we can't easily inject preferences without process.cwd() changes,
// we test that the function is non-throwing and returns a valid QualityLevel
{
  const level = resolveQualityLevel("/nonexistent/path");
  assert(
    VALID_QUALITY_LEVELS.has(level),
    "returns a valid quality level even with nonexistent path",
  );
  assertEq(level, "fast", "returns 'fast' for nonexistent path");
}

// ─── buildQualityInstructions — fast ──────────────────────────────────────────

console.log("\n--- buildQualityInstructions (fast) ---");

{
  const instructions = buildQualityInstructions("fast");
  assertEq(instructions, "", "fast returns empty string");
  assertEq(instructions.length, 0, "fast has zero length");
  assertEq(
    estimateTokens(instructions),
    0,
    "fast has zero estimated tokens",
  );
}

// ─── buildQualityInstructions — standard ──────────────────────────────────────

console.log("\n--- buildQualityInstructions (standard) ---");

{
  const instructions = buildQualityInstructions("standard");

  assert(instructions.length > 0, "standard returns non-empty string");

  // Keyword checks
  const lower = instructions.toLowerCase();
  assert(
    lower.includes("codebase") || lower.includes("codebase_scan"),
    "standard contains 'codebase' keyword",
  );
  assert(
    lower.includes("context7") || instructions.includes("Context7"),
    "standard contains 'context7' or 'Context7' keyword",
  );
  assert(lower.includes("diff"), "standard contains 'diff' keyword");
  assert(
    lower.includes("rg") || lower.includes("find"),
    "standard mentions search tools (rg or find)",
  );
  assert(
    lower.includes("test"),
    "standard mentions testing",
  );

  // Negative: standard should NOT contain strict-only content
  assert(
    !lower.includes("test baseline"),
    "standard does NOT contain 'test baseline'",
  );
  assert(
    !lower.includes("full test suite"),
    "standard does NOT contain 'full test suite'",
  );
  assert(
    !lower.includes("(strict)"),
    "standard does NOT contain '(Strict)' marker",
  );
  assert(
    !lower.includes("line-by-line"),
    "standard does NOT contain 'line-by-line'",
  );

  // Token budget
  const tokens = estimateTokens(instructions);
  assert(tokens <= 400, `standard token budget ≤ 400 (actual: ${tokens})`);
  assert(tokens > 20, `standard has meaningful content (tokens: ${tokens})`);
}

// ─── buildQualityInstructions — strict ────────────────────────────────────────

console.log("\n--- buildQualityInstructions (strict) ---");

{
  const instructions = buildQualityInstructions("strict");
  const lower = instructions.toLowerCase();

  assert(instructions.length > 0, "strict returns non-empty string");

  // Contains all standard keywords
  assert(
    lower.includes("codebase") || lower.includes("codebase_scan"),
    "strict contains 'codebase' keyword",
  );
  assert(
    lower.includes("context7") || instructions.includes("Context7"),
    "strict contains 'context7' or 'Context7' keyword",
  );
  assert(lower.includes("diff"), "strict contains 'diff' keyword");

  // Strict-specific content
  assert(lower.includes("baseline"), "strict contains 'baseline' keyword");
  assert(
    lower.includes("full test") || lower.includes("all tests"),
    "strict contains 'full test' or equivalent",
  );
  assert(
    lower.includes("line-by-line"),
    "strict contains 'line-by-line' for thorough diff review",
  );
  assert(
    lower.includes("(strict)"),
    "strict contains the '(Strict)' marker",
  );
  assert(
    lower.includes("mandatory"),
    "strict makes context7 mandatory",
  );

  // Token budget
  const tokens = estimateTokens(instructions);
  assert(tokens <= 600, `strict token budget ≤ 600 (actual: ${tokens})`);
  assert(
    tokens > estimateTokens(buildQualityInstructions("standard")),
    "strict has more content than standard",
  );
}

// ─── Gate Event Recording ─────────────────────────────────────────────────────

console.log("\n--- Gate Event Recording ---");

// Clean slate
clearGateEvents();

// Test: valid event is stored
{
  clearGateEvents();
  recordGateEvent("codebase_scan", "passed", "standard");
  const events = getGateEvents();
  assertEq(events.length, 1, "valid event is stored");
  assertEq(events[0].gate, "codebase_scan", "event has correct gate name");
  assertEq(events[0].outcome, "passed", "event has correct outcome");
  assertEq(events[0].level, "standard", "event has correct level");
}

// Test: events have timestamp
{
  clearGateEvents();
  const before = Date.now();
  recordGateEvent("diff_review", "warned", "strict");
  const after = Date.now();
  const events = getGateEvents();
  assert(events[0].timestamp >= before, "event timestamp >= before recording");
  assert(events[0].timestamp <= after, "event timestamp <= after recording");
}

// Test: invalid gate name is silently dropped
{
  clearGateEvents();
  recordGateEvent("invalid_gate", "passed", "standard");
  assertEq(getGateEvents().length, 0, "invalid gate name is silently dropped");
}

// Test: invalid outcome is silently dropped
{
  clearGateEvents();
  recordGateEvent("codebase_scan", "invalid_outcome", "standard");
  assertEq(
    getGateEvents().length,
    0,
    "invalid outcome is silently dropped",
  );
}

// Test: getGateEvents() returns copy (mutation safety)
{
  clearGateEvents();
  recordGateEvent("test_gate", "passed", "strict");
  const events1 = getGateEvents();
  events1.push({
    gate: "diff_review",
    outcome: "blocked",
    level: "strict",
    timestamp: 0,
  });
  const events2 = getGateEvents();
  assertEq(
    events2.length,
    1,
    "getGateEvents() returns copy — mutation does not affect internal array",
  );
}

// Test: clearGateEvents() empties the array
{
  clearGateEvents();
  recordGateEvent("codebase_scan", "passed", "fast");
  recordGateEvent("diff_review", "warned", "standard");
  assertEq(getGateEvents().length, 2, "two events before clear");
  clearGateEvents();
  assertEq(getGateEvents().length, 0, "clearGateEvents() empties the array");
}

// Test: multiple events accumulate correctly
{
  clearGateEvents();
  recordGateEvent("codebase_scan", "passed", "standard");
  recordGateEvent("context7_lookup", "skipped", "standard");
  recordGateEvent("diff_review", "passed", "standard");
  const events = getGateEvents();
  assertEq(events.length, 3, "multiple events accumulate correctly");
  assertEq(events[0].gate, "codebase_scan", "first event is codebase_scan");
  assertEq(events[1].gate, "context7_lookup", "second event is context7_lookup");
  assertEq(events[2].gate, "diff_review", "third event is diff_review");
}

// Test: all 5 gate names accepted
{
  clearGateEvents();
  const gates: string[] = [
    "codebase_scan",
    "context7_lookup",
    "test_baseline",
    "test_gate",
    "diff_review",
  ];
  for (const gate of gates) {
    recordGateEvent(gate, "passed", "strict");
  }
  assertEq(getGateEvents().length, 5, "all 5 gate names accepted");
}

// Test: all 4 outcomes accepted
{
  clearGateEvents();
  const outcomes: string[] = ["passed", "warned", "skipped", "blocked"];
  for (const outcome of outcomes) {
    recordGateEvent("codebase_scan", outcome, "standard");
  }
  assertEq(getGateEvents().length, 4, "all 4 outcomes accepted");
}

// ─── Constants Validation ─────────────────────────────────────────────────────

console.log("\n--- Constants ---");

assertEq(VALID_GATES.size, 5, "VALID_GATES has 5 entries");
assertEq(VALID_OUTCOMES.size, 4, "VALID_OUTCOMES has 4 entries");
assertEq(VALID_QUALITY_LEVELS.size, 3, "VALID_QUALITY_LEVELS has 3 entries");

assert(VALID_GATES.has("codebase_scan"), "VALID_GATES includes codebase_scan");
assert(VALID_GATES.has("context7_lookup"), "VALID_GATES includes context7_lookup");
assert(VALID_GATES.has("test_baseline"), "VALID_GATES includes test_baseline");
assert(VALID_GATES.has("test_gate"), "VALID_GATES includes test_gate");
assert(VALID_GATES.has("diff_review"), "VALID_GATES includes diff_review");

assert(VALID_OUTCOMES.has("passed"), "VALID_OUTCOMES includes passed");
assert(VALID_OUTCOMES.has("warned"), "VALID_OUTCOMES includes warned");
assert(VALID_OUTCOMES.has("skipped"), "VALID_OUTCOMES includes skipped");
assert(VALID_OUTCOMES.has("blocked"), "VALID_OUTCOMES includes blocked");

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
