/**
 * Tests for passive-monitor module — diffPlanVsSummary drift detection.
 *
 * 20+ assertions covering:
 * - Scope expansion detected (extra tasks in summary)
 * - Scope contraction detected (planned tasks missing from summary)
 * - Scope shift (both expansion + contraction)
 * - Clean case (no drift)
 * - Documented deviations excluded from drift
 * - Empty/malformed input returns empty observations
 * - Plan with no tasks and summary with tasks
 *
 * Uses fixture strings with the same markdown format as real plan/summary files.
 */

import { diffPlanVsSummary } from "../passive-monitor.ts";
import type { DriftResult, DriftObservation } from "../passive-monitor.ts";

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

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makePlan(tasks: { id: string; title: string; done: boolean }[]): string {
  const taskLines = tasks
    .map(
      (t) =>
        `- [${t.done ? "x" : " "}] **${t.id}: ${t.title}** \`est:30m\``,
    )
    .join("\n");

  return `# S01: Test Slice

**Goal:** Test the drift detection module
**Demo:** After slice completes, drift is detected

## Must-Haves

- Everything works

## Tasks

${taskLines}

## Files Likely Touched

- \`test.ts\`
`;
}

function makeSummary(opts: {
  taskId?: string;
  title?: string;
  whatHappened?: string;
  deviations?: string;
}): string {
  const taskId = opts.taskId || "T01";
  const title = opts.title || "Test Task";
  const whatHappened = opts.whatHappened || `Completed ${taskId} successfully.`;
  const deviations = opts.deviations || "None";

  return `---
id: ${taskId}
parent: S01
milestone: M001
provides:
  - test output
key_files:
  - test.ts
key_decisions:
  - used standard approach
patterns_established: []
observability_surfaces: []
duration: 30m
verification_result: passed
completed_at: 2026-03-11
blocker_discovered: false
---

# ${taskId}: ${title}

**Built the test thing**

## What Happened

${whatHappened}

## Verification

All tests passed.

## Diagnostics

None

## Deviations

${deviations}

## Known Issues

None

## Files Created/Modified

- \`test.ts\` — test file
`;
}

// ─── Tests: Clean Case ────────────────────────────────────────────────────

console.log("--- Drift Detection: clean case (no drift) ---");

{
  const plan = makePlan([
    { id: "T01", title: "First task", done: true },
    { id: "T02", title: "Second task", done: true },
  ]);
  const summary = makeSummary({
    taskId: "S01",
    title: "Test Slice",
    whatHappened: "Completed T01 and T02 as planned.",
  });

  const result = diffPlanVsSummary(plan, summary);
  assertEq(result.observations.length, 0, "no drift when plan and summary match");
  assertEq(result.planTaskCount, 2, "plan task count is 2");
  assertEq(result.summaryTaskCount, 2, "summary task count is 2 (T01 and T02)");
}

// ─── Tests: Expansion ──────────────────────────────────────────────────────

console.log("--- Drift Detection: scope expansion ---");

{
  const plan = makePlan([
    { id: "T01", title: "First task", done: true },
  ]);
  const summary = makeSummary({
    taskId: "S01",
    title: "Test Slice",
    whatHappened: "Completed T01 as planned. Also added T02 for extra functionality and T03 for cleanup.",
  });

  const result = diffPlanVsSummary(plan, summary);

  const expansions = result.observations.filter((o) => o.kind === "expansion");
  assert(expansions.length >= 2, "expansion detected for T02 and T03");
  assert(
    expansions.some((o) => o.taskId === "T02"),
    "expansion observation includes T02",
  );
  assert(
    expansions.some((o) => o.taskId === "T03"),
    "expansion observation includes T03",
  );
  assertEq(result.planTaskCount, 1, "plan has 1 task");
}

// ─── Tests: Contraction ────────────────────────────────────────────────────

console.log("--- Drift Detection: scope contraction ---");

{
  const plan = makePlan([
    { id: "T01", title: "First task", done: true },
    { id: "T02", title: "Second task", done: true },
    { id: "T03", title: "Third task", done: false },
  ]);
  const summary = makeSummary({
    taskId: "T01",
    title: "First task only",
    whatHappened: "Only completed T01.",
  });

  const result = diffPlanVsSummary(plan, summary);

  const contractions = result.observations.filter(
    (o) => o.kind === "contraction",
  );
  assert(contractions.length >= 2, "contraction detected for T02 and T03");
  assert(
    contractions.some((o) => o.taskId === "T02"),
    "contraction observation includes T02",
  );
  assert(
    contractions.some((o) => o.taskId === "T03"),
    "contraction observation includes T03",
  );
  assertEq(result.planTaskCount, 3, "plan has 3 tasks");
}

// ─── Tests: Shift ──────────────────────────────────────────────────────────

console.log("--- Drift Detection: scope shift ---");

{
  const plan = makePlan([
    { id: "T01", title: "First task", done: true },
    { id: "T02", title: "Second task", done: true },
  ]);
  // Summary references T01 and T03 (not T02) — T02 missing, T03 added
  // Note: whatHappened must NOT mention T02 or it'll be counted as present
  const summary = makeSummary({
    taskId: "S01",
    title: "Test Slice",
    whatHappened: "Completed T01 and added T03 for extra functionality.",
  });

  const result = diffPlanVsSummary(plan, summary);

  const shifts = result.observations.filter((o) => o.kind === "shift");
  assert(shifts.length === 1, "shift detected when both expansion and contraction exist");
  assert(
    shifts[0].details.includes("Scope shift"),
    "shift observation describes the scope change",
  );

  const expansions = result.observations.filter((o) => o.kind === "expansion");
  assert(
    expansions.some((o) => o.taskId === "T03"),
    "expansion for T03 present in shift scenario",
  );

  const contractions = result.observations.filter(
    (o) => o.kind === "contraction",
  );
  assert(
    contractions.some((o) => o.taskId === "T02"),
    "contraction for T02 present in shift scenario",
  );
}

// ─── Tests: Documented Deviations Excluded ─────────────────────────────────

console.log("--- Drift Detection: documented deviations excluded ---");

{
  const plan = makePlan([
    { id: "T01", title: "First task", done: true },
    { id: "T02", title: "Second task", done: true },
  ]);
  // Summary mentions T03 (not in plan) but deviations document it
  const summary = makeSummary({
    taskId: "S01",
    title: "Test Slice",
    whatHappened: "Completed T01 and added T03 for cleanup. T02 was deferred.",
    deviations:
      "Added T03 as a cleanup task. Deferred T02 to next slice due to dependency issues.",
  });

  const result = diffPlanVsSummary(plan, summary);

  // T03 expansion should be excluded (documented in deviations)
  const expansions = result.observations.filter((o) => o.kind === "expansion");
  assert(
    !expansions.some((o) => o.taskId === "T03"),
    "T03 expansion excluded because documented in deviations",
  );

  // T02 contraction should also be excluded (documented in deviations)
  const contractions = result.observations.filter(
    (o) => o.kind === "contraction",
  );
  assert(
    !contractions.some((o) => o.taskId === "T02"),
    "T02 contraction excluded because documented in deviations",
  );

  assertEq(
    result.observations.length,
    0,
    "no observations when all drift is documented in deviations",
  );
}

// ─── Tests: Partial Deviation Exclusion ─────────────────────────────────────

console.log("--- Drift Detection: partial deviation exclusion ---");

{
  const plan = makePlan([
    { id: "T01", title: "First task", done: true },
    { id: "T02", title: "Second task", done: true },
  ]);
  // T03 added (not documented), T02 missing (documented in deviations)
  const summary = makeSummary({
    taskId: "S01",
    title: "Test Slice",
    whatHappened: "Completed T01 and added T03. T02 was deferred.",
    deviations: "Deferred T02 to next slice.",
  });

  const result = diffPlanVsSummary(plan, summary);

  // T02 contraction excluded (documented)
  const contractions = result.observations.filter(
    (o) => o.kind === "contraction",
  );
  assert(
    !contractions.some((o) => o.taskId === "T02"),
    "T02 contraction excluded because documented",
  );

  // T03 expansion NOT excluded (not documented)
  const expansions = result.observations.filter((o) => o.kind === "expansion");
  assert(
    expansions.some((o) => o.taskId === "T03"),
    "T03 expansion not excluded because not documented",
  );
}

// ─── Tests: Empty / Malformed Input ─────────────────────────────────────────

console.log("--- Drift Detection: empty/malformed input ---");

{
  const result1 = diffPlanVsSummary("", "");
  assertEq(result1.observations.length, 0, "empty strings → empty observations");
  assertEq(result1.planTaskCount, 0, "empty strings → zero plan tasks");
  assertEq(result1.summaryTaskCount, 0, "empty strings → zero summary tasks");
}

{
  const result2 = diffPlanVsSummary("not valid markdown", "also not valid");
  assertEq(
    result2.observations.length,
    0,
    "malformed input → empty observations",
  );
  assertEq(result2.planTaskCount, 0, "malformed plan → zero plan tasks");
  assertEq(result2.summaryTaskCount, 0, "malformed summary → zero summary tasks");
}

{
  const plan = makePlan([{ id: "T01", title: "Task", done: true }]);
  const result3 = diffPlanVsSummary(plan, "");
  assertEq(
    result3.observations.length,
    0,
    "valid plan + empty summary → empty observations",
  );
}

{
  const summary = makeSummary({ taskId: "T01", whatHappened: "Did T01" });
  const result4 = diffPlanVsSummary("", summary);
  assertEq(
    result4.observations.length,
    0,
    "empty plan + valid summary → empty observations",
  );
}

// ─── Tests: Plan with No Tasks + Summary with Tasks ─────────────────────────

console.log("--- Drift Detection: plan with no tasks ---");

{
  // Plan with no task checkbox lines
  const emptyPlan = `# S01: Test Slice

**Goal:** Test empty plan handling
**Demo:** Should detect expansion

## Must-Haves

- Nothing

## Tasks

No tasks defined yet.

## Files Likely Touched

- \`test.ts\`
`;

  const summary = makeSummary({
    taskId: "S01",
    title: "Test Slice",
    whatHappened: "Implemented T01 and T02 even though no tasks were planned.",
  });

  const result = diffPlanVsSummary(emptyPlan, summary);
  assertEq(result.planTaskCount, 0, "plan with no tasks has 0 plan task count");

  const expansions = result.observations.filter((o) => o.kind === "expansion");
  assert(expansions.length >= 1, "expansion detected when plan has no tasks but summary does");
}

// ─── Tests: DriftResult types ──────────────────────────────────────────────

console.log("--- Drift Detection: result type correctness ---");

{
  const plan = makePlan([
    { id: "T01", title: "Task one", done: true },
  ]);
  const summary = makeSummary({
    taskId: "T01",
    title: "Task one",
    whatHappened: "Completed T01.",
  });

  const result = diffPlanVsSummary(plan, summary);
  assert(Array.isArray(result.observations), "observations is an array");
  assert(typeof result.planTaskCount === "number", "planTaskCount is a number");
  assert(
    typeof result.summaryTaskCount === "number",
    "summaryTaskCount is a number",
  );
}

// ─── Tests: Non-throwing guarantee ──────────────────────────────────────────

console.log("--- Drift Detection: non-throwing guarantee ---");

{
  // Verify the function doesn't throw even with completely wrong content
  let threw = false;
  try {
    diffPlanVsSummary(
      "---\n\x00\nbroken: yaml\n---\n# Broken",
      "---\n\x00\nbroken: yaml\n---\n# Broken",
    );
  } catch {
    threw = true;
  }
  assert(!threw, "diffPlanVsSummary does not throw on broken input");
}

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
