/**
 * Tests for correction type definitions and validation helpers.
 * Validates the 14-category taxonomy, VALID_CATEGORIES set, isValidCategory(),
 * isValidEntry(), and REQUIRED_FIELDS.
 */

import {
  VALID_CATEGORIES,
  REQUIRED_FIELDS,
  isValidCategory,
  isValidEntry,
  type CorrectionEntry,
  type DiagnosisCategory,
} from "../correction-types.ts";

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
    diagnosis_text: "Applied incorrect abstraction because of stale knowledge.",
    scope: "file",
    phase: "executing",
    timestamp: new Date().toISOString(),
    session_id: "test-session-001",
    source: "self_report",
    ...overrides,
  } as CorrectionEntry;
}

// ─── VALID_CATEGORIES ─────────────────────────────────────────────────────────

console.log("\n=== VALID_CATEGORIES ===");

{
  assertEq(VALID_CATEGORIES.size, 14, "VALID_CATEGORIES has exactly 14 entries");

  // 7 code categories
  const codeCategories = [
    "code.wrong_pattern",
    "code.missing_context",
    "code.stale_knowledge",
    "code.over_engineering",
    "code.under_engineering",
    "code.style_mismatch",
    "code.scope_drift",
  ];
  for (const cat of codeCategories) {
    assert(VALID_CATEGORIES.has(cat), `VALID_CATEGORIES contains ${cat}`);
  }

  // 7 process categories
  const processCategories = [
    "process.planning_error",
    "process.research_gap",
    "process.implementation_bug",
    "process.integration_miss",
    "process.convention_violation",
    "process.requirement_misread",
    "process.regression",
  ];
  for (const cat of processCategories) {
    assert(VALID_CATEGORIES.has(cat), `VALID_CATEGORIES contains ${cat}`);
  }
}

// ─── isValidCategory ──────────────────────────────────────────────────────────

console.log("\n=== isValidCategory ===");

{
  // All 14 valid
  for (const cat of VALID_CATEGORIES) {
    assert(isValidCategory(cat), `isValidCategory('${cat}') is true`);
  }

  // Invalid categories
  assert(!isValidCategory("invalid"), "rejects 'invalid'");
  assert(!isValidCategory("code"), "rejects bare 'code'");
  assert(!isValidCategory("process"), "rejects bare 'process'");
  assert(!isValidCategory("code.nonexistent"), "rejects 'code.nonexistent'");
  assert(!isValidCategory(""), "rejects empty string");
  assert(!isValidCategory("process.wrong_pattern"), "rejects mismatched tier 'process.wrong_pattern'");
}

// ─── REQUIRED_FIELDS ──────────────────────────────────────────────────────────

console.log("\n=== REQUIRED_FIELDS ===");

{
  assertEq(REQUIRED_FIELDS.length, 9, "REQUIRED_FIELDS has 9 entries");

  const expected = [
    "correction_from",
    "correction_to",
    "diagnosis_category",
    "diagnosis_text",
    "scope",
    "phase",
    "timestamp",
    "session_id",
    "source",
  ];
  for (const field of expected) {
    assert(REQUIRED_FIELDS.includes(field), `REQUIRED_FIELDS contains '${field}'`);
  }
}

// ─── isValidEntry — valid entry ───────────────────────────────────────────────

console.log("\n=== isValidEntry — valid entry ===");

{
  const entry = makeValidEntry();
  assert(isValidEntry(entry), "accepts valid entry");

  // With all optional fields
  const full = makeValidEntry({
    secondary_category: "process.regression",
    quality_level: "standard",
    file_path: "src/foo.ts",
    unit_type: "task",
    unit_id: "M001/S01/T01",
    retired_at: new Date().toISOString(),
    retired_by: "user",
  });
  assert(isValidEntry(full), "accepts entry with all optional fields");
}

// ─── isValidEntry — missing required fields ───────────────────────────────────

console.log("\n=== isValidEntry — missing required fields ===");

{
  for (const field of REQUIRED_FIELDS) {
    // Missing field (undefined)
    const withoutField = makeValidEntry();
    delete (withoutField as Record<string, unknown>)[field];
    assert(!isValidEntry(withoutField), `rejects entry missing '${field}'`);

    // Empty string
    const withEmpty = makeValidEntry({ [field]: "" });
    assert(!isValidEntry(withEmpty), `rejects entry with empty '${field}'`);

    // Null value
    const withNull = makeValidEntry({ [field]: null });
    assert(!isValidEntry(withNull), `rejects entry with null '${field}'`);
  }
}

// ─── isValidEntry — invalid category ─────────────────────────────────────────

console.log("\n=== isValidEntry — invalid category ===");

{
  const bad = makeValidEntry({ diagnosis_category: "invalid.category" });
  assert(!isValidEntry(bad), "rejects entry with invalid diagnosis_category");
}

// ─── isValidEntry — diagnosis_text word count ────────────────────────────────

console.log("\n=== isValidEntry — diagnosis_text word count ===");

{
  // Exactly 100 words — should pass
  const words100 = Array(100).fill("word").join(" ");
  const at100 = makeValidEntry({ diagnosis_text: words100 });
  assert(isValidEntry(at100), "accepts diagnosis_text with exactly 100 words");

  // 101 words — should fail
  const words101 = Array(101).fill("word").join(" ");
  const over100 = makeValidEntry({ diagnosis_text: words101 });
  assert(!isValidEntry(over100), "rejects diagnosis_text exceeding 100 words");
}

// ─── isValidEntry — non-object inputs ────────────────────────────────────────

console.log("\n=== isValidEntry — non-object inputs ===");

{
  assert(!isValidEntry(null), "rejects null");
  assert(!isValidEntry(undefined), "rejects undefined");
  assert(!isValidEntry("string"), "rejects string");
  assert(!isValidEntry(42), "rejects number");
  assert(!isValidEntry([]), "rejects array");
}

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed ✓");
}
