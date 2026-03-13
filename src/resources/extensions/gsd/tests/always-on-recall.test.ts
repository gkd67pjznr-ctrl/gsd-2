/**
 * Tests for always-on recall injection in before_agent_start.
 *
 * Verifies:
 * - Recall block is appended when auto is not active
 * - Recall block is skipped when auto is active
 * - Handles empty recall gracefully
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildRecallBlock } from "../recall.ts";
import { setGSDStatus, isAutoActive, _resetMode } from "../status.ts";

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

function mockCtx() {
  return {
    ui: {
      setStatus(_key: string, _value: string | undefined) {},
    },
  } as any;
}

// ── Recall block appended when auto is NOT active ────────────────────────

{
  _resetMode();
  assert(!isAutoActive(), "precondition: auto should not be active");

  // buildRecallBlock with an empty .gsd dir should return self-report instructions
  const tmp = mkdtempSync(join(tmpdir(), "recall-inject-"));
  mkdirSync(join(tmp, ".gsd", "patterns"), { recursive: true });

  const result = await buildRecallBlock({ cwd: tmp });
  // With no corrections/preferences, it returns self-report instructions
  assert(result.length > 0, "recall block should be non-empty (self-report instructions)");
  assert(result.includes("Self-report corrections"), "should contain self-report instructions");

  rmSync(tmp, { recursive: true, force: true });
}

// ── Recall block skipped when auto IS active ─────────────────────────────
// This tests the gating logic: when isAutoActive() is true, the index.ts
// hook skips calling buildRecallBlock. We simulate the condition check.

{
  const ctx = mockCtx();
  setGSDStatus(ctx, "auto");
  assert(isAutoActive() === true, "auto should be active after setGSDStatus(auto)");

  // The actual gating in index.ts: if (!isAutoActive()) { buildRecallBlock() }
  // When auto is active, recall is NOT injected (auto-mode handles its own).
  let recallInjected = false;
  if (!isAutoActive()) {
    recallInjected = true;
  }
  assert(!recallInjected, "recall should NOT be injected when auto is active");

  _resetMode();
}

// ── Recall injection happens when auto is NOT active ─────────────────────

{
  _resetMode();
  let recallInjected = false;
  if (!isAutoActive()) {
    recallInjected = true;
  }
  assert(recallInjected, "recall SHOULD be injected when auto is not active");
}

// ── Empty recall (kill switch active) handled gracefully ─────────────────

{
  _resetMode();
  const tmp = mkdtempSync(join(tmpdir(), "recall-kill-"));
  mkdirSync(join(tmp, ".gsd"), { recursive: true });
  // Write preferences.md with kill switch
  writeFileSync(
    join(tmp, ".gsd", "preferences.md"),
    "---\ncorrection_capture: false\n---\n",
  );

  const result = await buildRecallBlock({ cwd: tmp });
  assert(result === "", "recall should return empty string when kill switch is active");

  // Simulating the index.ts logic: empty recall → no append
  let recallBlock = "";
  if (!isAutoActive()) {
    const recall = await buildRecallBlock({ cwd: tmp });
    if (recall) recallBlock = `\n\n${recall}`;
  }
  assert(recallBlock === "", "empty recall should produce empty recallBlock");

  rmSync(tmp, { recursive: true, force: true });
}

// ── Non-empty recall produces content for system prompt ──────────────────

{
  _resetMode();
  const tmp = mkdtempSync(join(tmpdir(), "recall-content-"));
  mkdirSync(join(tmp, ".gsd", "patterns"), { recursive: true });
  // Write a correction so recall has content
  writeFileSync(
    join(tmp, ".gsd", "patterns", "corrections.jsonl"),
    JSON.stringify({
      correction_from: "wrong approach",
      correction_to: "better approach",
      diagnosis_category: "code.wrong_pattern",
      diagnosis_text: "test",
      scope: "project",
      status: "active",
      timestamp: new Date().toISOString(),
    }) + "\n",
  );

  const result = await buildRecallBlock({ cwd: tmp });
  assert(result.includes("system-reminder"), "non-empty recall should contain system-reminder tags");
  assert(result.includes("better approach"), "recall should contain correction content");

  // Simulating index.ts injection
  let recallBlock = "";
  if (!isAutoActive()) {
    const recall = await buildRecallBlock({ cwd: tmp });
    if (recall) recallBlock = `\n\n${recall}`;
  }
  assert(recallBlock.length > 0, "non-empty recall should produce recallBlock for system prompt");

  rmSync(tmp, { recursive: true, force: true });
}

// ── Report ───────────────────────────────────────────────────────────────

console.log(`\nalways-on-recall: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
