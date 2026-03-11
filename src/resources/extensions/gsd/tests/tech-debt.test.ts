/**
 * Tests for tech debt register — logDebt, listDebt, resolveDebt lifecycle.
 *
 * Uses a temp directory per test block to avoid touching real .gsd/ state.
 * Follows corrections-io.test.ts pattern: custom assert helpers, mkdtempSync, try/finally.
 */

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  logDebt,
  listDebt,
  resolveDebt,
  nextDebtId,
} from "../tech-debt.ts";
import type { LogDebtInput, TechDebtEntry, DebtType, DebtSeverity } from "../tech-debt.ts";

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

function makeEntry(overrides: Partial<LogDebtInput> = {}): LogDebtInput {
  return {
    title: "Missing test coverage for edge case",
    type: "test-gap",
    severity: "medium",
    component: "src/resources/extensions/gsd/corrections.ts",
    logged: "M001/S05/T01",
    description: "The rotation function doesn't handle the case where the archive directory is read-only.",
    ...overrides,
  };
}

let tmpDir: string;

function setup(): string {
  tmpDir = mkdtempSync(join(tmpdir(), "gsd-tech-debt-test-"));
  return tmpDir;
}

function cleanup(): void {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ─── Tests: logDebt — write + read round-trip ─────────────────────────────────

console.log("\n=== logDebt + listDebt — write + read round-trip ===");

{
  const dir = setup();
  try {
    const entry = makeEntry();
    const result = logDebt(entry, { cwd: dir });

    assert(result.written === true, "logDebt returns written: true");
    assert(result.reason === undefined, "no reason on success");

    // File should exist
    const filePath = join(dir, ".gsd", "TECH-DEBT.md");
    assert(existsSync(filePath), "TECH-DEBT.md created");

    // Read back
    const entries = listDebt(undefined, { cwd: dir });
    assertEq(entries.length, 1, "listDebt returns 1 entry");
    assertEq(entries[0].id, "TD-001", "first entry gets ID TD-001");
    assertEq(entries[0].title, entry.title, "title persisted");
    assertEq(entries[0].type, entry.type, "type persisted");
    assertEq(entries[0].severity, entry.severity, "severity persisted");
    assertEq(entries[0].component, entry.component, "component persisted");
    assertEq(entries[0].status, "open", "status is open");
    assertEq(entries[0].logged, entry.logged, "logged provenance persisted");
    assert(entries[0].description.includes("rotation function"), "description persisted");
  } finally {
    cleanup();
  }
}

// ─── Tests: sequential ID assignment ──────────────────────────────────────────

console.log("\n=== logDebt — sequential ID assignment ===");

{
  const dir = setup();
  try {
    logDebt(makeEntry({ title: "First issue" }), { cwd: dir });
    logDebt(makeEntry({ title: "Second issue" }), { cwd: dir });
    logDebt(makeEntry({ title: "Third issue" }), { cwd: dir });

    const entries = listDebt(undefined, { cwd: dir });
    assertEq(entries.length, 3, "3 entries written");
    assertEq(entries[0].id, "TD-001", "first is TD-001");
    assertEq(entries[1].id, "TD-002", "second is TD-002");
    assertEq(entries[2].id, "TD-003", "third is TD-003");
  } finally {
    cleanup();
  }
}

// ─── Tests: nextDebtId gap handling ───────────────────────────────────────────

console.log("\n=== nextDebtId — gap handling ===");

{
  // TD-001, TD-003 → next should be TD-004 (max+1, not count+1)
  const content = `# Tech Debt Register

## TD-001: First
- **Type:** bug

## TD-003: Third (skipped 002)
- **Type:** design
`;

  const nextId = nextDebtId(content);
  assertEq(nextId, "TD-004", "next ID after gap (001,003) is TD-004");

  // Empty content → TD-001
  assertEq(nextDebtId(""), "TD-001", "empty content yields TD-001");
  assertEq(nextDebtId("# Tech Debt Register\n"), "TD-001", "header-only yields TD-001");
}

// ─── Tests: nextDebtId with gap in file via logDebt ───────────────────────────

console.log("\n=== logDebt — ID after gap in existing file ===");

{
  const dir = setup();
  try {
    // Pre-populate a file with a gap (TD-001 and TD-003, missing TD-002)
    mkdirSync(join(dir, ".gsd"), { recursive: true });
    const filePath = join(dir, ".gsd", "TECH-DEBT.md");
    writeFileSync(filePath, `# Tech Debt Register

## TD-001: First issue
- **Type:** bug
- **Severity:** high
- **Component:** foo.ts
- **Status:** open
- **Logged:** M001/S01/T01
- **Description:** First

## TD-003: Third issue
- **Type:** design
- **Severity:** low
- **Component:** bar.ts
- **Status:** open
- **Logged:** M001/S02/T01
- **Description:** Third
`);

    // Log a new entry — should get TD-004
    logDebt(makeEntry({ title: "Fourth issue" }), { cwd: dir });

    const entries = listDebt(undefined, { cwd: dir });
    assertEq(entries.length, 3, "3 entries total after adding to gapped file");

    const ids = entries.map(e => e.id);
    assert(ids.includes("TD-004"), "new entry got TD-004 (max+1)");
  } finally {
    cleanup();
  }
}

// ─── Tests: all types valid ───────────────────────────────────────────────────

console.log("\n=== logDebt — all types valid ===");

{
  const dir = setup();
  try {
    const types: DebtType[] = ["bug", "design", "test-gap", "doc-gap"];
    for (const t of types) {
      const result = logDebt(makeEntry({ title: `Type: ${t}`, type: t }), { cwd: dir });
      assert(result.written === true, `type '${t}' accepted`);
    }

    const entries = listDebt(undefined, { cwd: dir });
    assertEq(entries.length, 4, "all 4 types written");

    for (const t of types) {
      assert(entries.some(e => e.type === t), `type '${t}' round-trips`);
    }
  } finally {
    cleanup();
  }
}

// ─── Tests: all severities valid ──────────────────────────────────────────────

console.log("\n=== logDebt — all severities valid ===");

{
  const dir = setup();
  try {
    const severities: DebtSeverity[] = ["critical", "high", "medium", "low"];
    for (const s of severities) {
      const result = logDebt(makeEntry({ title: `Sev: ${s}`, severity: s }), { cwd: dir });
      assert(result.written === true, `severity '${s}' accepted`);
    }

    const entries = listDebt(undefined, { cwd: dir });
    assertEq(entries.length, 4, "all 4 severities written");

    for (const s of severities) {
      assert(entries.some(e => e.severity === s), `severity '${s}' round-trips`);
    }
  } finally {
    cleanup();
  }
}

// ─── Tests: resolveDebt ───────────────────────────────────────────────────────

console.log("\n=== resolveDebt — updates status to resolved ===");

{
  const dir = setup();
  try {
    logDebt(makeEntry({ title: "Bug to fix" }), { cwd: dir });
    logDebt(makeEntry({ title: "Another bug" }), { cwd: dir });

    // Resolve TD-001
    const result = resolveDebt("TD-001", { date: "2026-03-12", resolution: "Fixed in S05/T02" }, { cwd: dir });
    assert(result.written === true, "resolveDebt returns written: true");

    const entries = listDebt(undefined, { cwd: dir });
    const resolved = entries.find(e => e.id === "TD-001");
    assert(resolved !== undefined, "TD-001 still in list");
    assertEq(resolved!.status, "resolved", "TD-001 status is resolved");
    assertEq(resolved!.resolved, "2026-03-12", "resolved date set");
    assertEq(resolved!.resolution, "Fixed in S05/T02", "resolution context set");

    // TD-002 should still be open
    const stillOpen = entries.find(e => e.id === "TD-002");
    assertEq(stillOpen!.status, "open", "TD-002 still open");
  } finally {
    cleanup();
  }
}

// ─── Tests: resolveDebt — non-existent ID ─────────────────────────────────────

console.log("\n=== resolveDebt — non-existent ID ===");

{
  const dir = setup();
  try {
    logDebt(makeEntry(), { cwd: dir });

    const result = resolveDebt("TD-999", undefined, { cwd: dir });
    assertEq(result.written, false, "resolveDebt fails for non-existent ID");
    assertEq(result.reason, "error", "reason is error");
  } finally {
    cleanup();
  }
}

// ─── Tests: resolveDebt — invalid ID format ──────────────────────────────────

console.log("\n=== resolveDebt — invalid ID format ===");

{
  const dir = setup();
  try {
    const result1 = resolveDebt("", undefined, { cwd: dir });
    assertEq(result1.written, false, "empty ID rejected");
    assertEq(result1.reason, "invalid_entry", "reason is invalid_entry for empty ID");

    const result2 = resolveDebt("bad-id", undefined, { cwd: dir });
    assertEq(result2.written, false, "malformed ID rejected");
    assertEq(result2.reason, "invalid_entry", "reason is invalid_entry for malformed ID");
  } finally {
    cleanup();
  }
}

// ─── Tests: listDebt — status filter ──────────────────────────────────────────

console.log("\n=== listDebt — status filter ===");

{
  const dir = setup();
  try {
    logDebt(makeEntry({ title: "Open bug" }), { cwd: dir });
    logDebt(makeEntry({ title: "Resolved bug" }), { cwd: dir });
    resolveDebt("TD-002", { date: "2026-03-12" }, { cwd: dir });

    const openOnly = listDebt({ status: "open" }, { cwd: dir });
    assertEq(openOnly.length, 1, "status:open returns 1 entry");
    assertEq(openOnly[0].id, "TD-001", "open entry is TD-001");

    const resolvedOnly = listDebt({ status: "resolved" }, { cwd: dir });
    assertEq(resolvedOnly.length, 1, "status:resolved returns 1 entry");
    if (resolvedOnly.length > 0) {
      assertEq(resolvedOnly[0].id, "TD-002", "resolved entry is TD-002");
    }

    const all = listDebt(undefined, { cwd: dir });
    assertEq(all.length, 2, "no filter returns all entries");
  } finally {
    cleanup();
  }
}

// ─── Tests: lenient parsing — missing fields ──────────────────────────────────

console.log("\n=== listDebt — lenient parsing: missing fields ===");

{
  const dir = setup();
  try {
    mkdirSync(join(dir, ".gsd"), { recursive: true });
    // Entry with missing severity and component
    writeFileSync(join(dir, ".gsd", "TECH-DEBT.md"), `# Tech Debt Register

## TD-001: Incomplete entry
- **Type:** bug
- **Status:** open
- **Description:** Missing some fields
`);

    const entries = listDebt(undefined, { cwd: dir });
    assertEq(entries.length, 1, "entry parsed despite missing fields");
    assertEq(entries[0].id, "TD-001", "ID parsed");
    assertEq(entries[0].type, "bug", "type parsed");
    assertEq(entries[0].severity, "medium", "severity defaults to medium");
    assertEq(entries[0].component, "unknown", "component defaults to unknown");
  } finally {
    cleanup();
  }
}

// ─── Tests: lenient parsing — extra whitespace ────────────────────────────────

console.log("\n=== listDebt — lenient parsing: extra whitespace ===");

{
  const dir = setup();
  try {
    mkdirSync(join(dir, ".gsd"), { recursive: true });
    // Entry with extra whitespace around fields
    writeFileSync(join(dir, ".gsd", "TECH-DEBT.md"), `# Tech Debt Register

## TD-001:   Whitespace title   
-   **Type:**   design   
-  **Severity:**   high  
- **Component:**   src/foo.ts   
- **Status:**   open  
-  **Logged:**   M001/S01/T01  
- **Description:**   Some description with spaces  
`);

    const entries = listDebt(undefined, { cwd: dir });
    assertEq(entries.length, 1, "entry parsed with extra whitespace");
    assertEq(entries[0].title, "Whitespace title", "title trimmed");
    assertEq(entries[0].type, "design", "type trimmed");
    assertEq(entries[0].severity, "high", "severity trimmed");
    assertEq(entries[0].component, "src/foo.ts", "component trimmed");
  } finally {
    cleanup();
  }
}

// ─── Tests: lenient parsing — malformed entries skipped ───────────────────────

console.log("\n=== listDebt — lenient parsing: malformed entries skipped ===");

{
  const dir = setup();
  try {
    mkdirSync(join(dir, ".gsd"), { recursive: true });
    // Mix of valid and malformed entries
    writeFileSync(join(dir, ".gsd", "TECH-DEBT.md"), `# Tech Debt Register

Some random text that isn't an entry.

## TD-001: Valid entry
- **Type:** bug
- **Severity:** high
- **Component:** foo.ts
- **Status:** open
- **Logged:** M001/S01/T01
- **Description:** Valid entry

## Not a valid heading

## TD-002: Another valid entry
- **Type:** design
- **Description:** Also valid
`);

    const entries = listDebt(undefined, { cwd: dir });
    assertEq(entries.length, 2, "only valid TD-NNN entries parsed");
    assertEq(entries[0].id, "TD-001", "first valid entry");
    assertEq(entries[1].id, "TD-002", "second valid entry");
  } finally {
    cleanup();
  }
}

// ─── Tests: non-throwing on I/O errors ────────────────────────────────────────

console.log("\n=== non-throwing on I/O errors ===");

{
  // logDebt with bad path
  const result1 = logDebt(makeEntry(), { cwd: "/nonexistent/path/that/should/not/exist" });
  assertEq(result1.written, false, "logDebt does not throw on bad path");
  assertEq(result1.reason, "error", "logDebt returns error reason");

  // listDebt with bad path
  const entries = listDebt(undefined, { cwd: "/nonexistent/path/that/should/not/exist" });
  assertEq(entries.length, 0, "listDebt returns [] on bad path");

  // resolveDebt with bad path
  const result2 = resolveDebt("TD-001", undefined, { cwd: "/nonexistent/path/that/should/not/exist" });
  assertEq(result2.written, false, "resolveDebt does not throw on bad path");
  assertEq(result2.reason, "error", "resolveDebt returns error reason");
}

// ─── Tests: empty/nonexistent file returns empty array ────────────────────────

console.log("\n=== listDebt — empty/nonexistent file ===");

{
  const dir = setup();
  try {
    // No TECH-DEBT.md exists
    const entries1 = listDebt(undefined, { cwd: dir });
    assertEq(entries1.length, 0, "nonexistent file returns empty array");

    // Create empty file
    mkdirSync(join(dir, ".gsd"), { recursive: true });
    writeFileSync(join(dir, ".gsd", "TECH-DEBT.md"), "");
    const entries2 = listDebt(undefined, { cwd: dir });
    assertEq(entries2.length, 0, "empty file returns empty array");

    // Header-only file
    writeFileSync(join(dir, ".gsd", "TECH-DEBT.md"), "# Tech Debt Register\n");
    const entries3 = listDebt(undefined, { cwd: dir });
    assertEq(entries3.length, 0, "header-only file returns empty array");
  } finally {
    cleanup();
  }
}

// ─── Tests: logDebt — invalid entry rejected ─────────────────────────────────

console.log("\n=== logDebt — invalid entry rejected ===");

{
  const dir = setup();
  try {
    // Missing title
    const r1 = logDebt(makeEntry({ title: "" }), { cwd: dir });
    assertEq(r1.written, false, "empty title rejected");
    assertEq(r1.reason, "invalid_entry", "reason is invalid_entry for empty title");

    // Invalid type
    const r2 = logDebt(makeEntry({ type: "invalid" as any }), { cwd: dir });
    assertEq(r2.written, false, "invalid type rejected");
    assertEq(r2.reason, "invalid_entry", "reason is invalid_entry for invalid type");

    // Invalid severity
    const r3 = logDebt(makeEntry({ severity: "ultra" as any }), { cwd: dir });
    assertEq(r3.written, false, "invalid severity rejected");
    assertEq(r3.reason, "invalid_entry", "reason is invalid_entry for invalid severity");

    // Empty description
    const r4 = logDebt(makeEntry({ description: "" }), { cwd: dir });
    assertEq(r4.written, false, "empty description rejected");
    assertEq(r4.reason, "invalid_entry", "reason is invalid_entry for empty description");

    // No entries should have been written
    const entries = listDebt(undefined, { cwd: dir });
    assertEq(entries.length, 0, "no entries written for invalid inputs");
  } finally {
    cleanup();
  }
}

// ─── Tests: resolveDebt — without resolution context ──────────────────────────

console.log("\n=== resolveDebt — without resolution context ===");

{
  const dir = setup();
  try {
    logDebt(makeEntry({ title: "Simple resolve" }), { cwd: dir });

    const result = resolveDebt("TD-001", undefined, { cwd: dir });
    assert(result.written === true, "resolveDebt succeeds without resolution context");

    const entries = listDebt(undefined, { cwd: dir });
    assertEq(entries[0].status, "resolved", "status updated to resolved");
    assert(entries[0].resolved !== undefined, "resolved date auto-set");
    assert(entries[0].resolution === undefined, "no resolution context when not provided");
  } finally {
    cleanup();
  }
}

// ─── Tests: file header present ───────────────────────────────────────────────

console.log("\n=== logDebt — file header ===");

{
  const dir = setup();
  try {
    logDebt(makeEntry(), { cwd: dir });

    const content = readFileSync(join(dir, ".gsd", "TECH-DEBT.md"), "utf-8");
    assert(content.startsWith("# Tech Debt Register"), "file starts with header");
  } finally {
    cleanup();
  }
}

// ─── Tests: lenient parsing — invalid type/severity defaults ──────────────────

console.log("\n=== listDebt — lenient parsing: invalid type/severity get defaults ===");

{
  const dir = setup();
  try {
    mkdirSync(join(dir, ".gsd"), { recursive: true });
    writeFileSync(join(dir, ".gsd", "TECH-DEBT.md"), `# Tech Debt Register

## TD-001: Entry with bad type
- **Type:** not-a-real-type
- **Severity:** ultra-critical
- **Component:** foo.ts
- **Status:** open
- **Logged:** M001
- **Description:** Has invalid type and severity
`);

    const entries = listDebt(undefined, { cwd: dir });
    assertEq(entries.length, 1, "entry parsed despite invalid type/severity");
    assertEq(entries[0].type, "bug", "invalid type defaults to bug");
    assertEq(entries[0].severity, "medium", "invalid severity defaults to medium");
  } finally {
    cleanup();
  }
}

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed ✓");
}
