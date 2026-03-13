/**
 * Tests for GSD quick mode — arg parsing, directory creation, prompt loading,
 * status transitions, correction capture, and error recovery.
 */

import { parseQuickDescription, startQuick, checkQuickEnd, isQuickPending, _resetQuick, _getQuickDir } from "../quick.ts";
import { getGSDMode, setGSDStatus, _resetMode } from "../status.ts";
import { loadPrompt } from "../prompt-loader.ts";
import { transformSessionEntries } from "../auto.ts";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

// ─── Arg Parsing ──────────────────────────────────────────────────────────────

console.log("── Arg parsing ──");

assertEq(
  parseQuickDescription("quick --fix the login button"),
  "fix the login button",
  "strips 'quick --' prefix",
);

assertEq(
  parseQuickDescription("quick fix login"),
  "fix login",
  "strips 'quick' without '--'",
);

assertEq(
  parseQuickDescription("quick"),
  "",
  "bare 'quick' returns empty string",
);

assertEq(
  parseQuickDescription("quick --  spaces around  "),
  "spaces around",
  "trims whitespace after '--'",
);

assertEq(
  parseQuickDescription("quick -- --double dashes"),
  "--double dashes",
  "only strips first '--'",
);

// ─── Prompt template loading ──────────────────────────────────────────────────

console.log("── Prompt template ──");

{
  const prompt = loadPrompt("quick-task", {
    description: "fix the login button",
    quality: "standard quality instructions",
    outputDir: "/tmp/gsd-test-quick",
  });
  assert(prompt.includes("fix the login button"), "prompt contains description");
  assert(prompt.includes("standard quality instructions"), "prompt contains quality");
  assert(prompt.includes("/tmp/gsd-test-quick"), "prompt contains output dir");
  assert(prompt.includes("Research"), "prompt has research step");
  assert(prompt.includes("Verify"), "prompt has verify step");
  assert(prompt.includes("summary.md"), "prompt references summary.md");
}

// ─── Status transitions ──────────────────────────────────────────────────────

console.log("── Status transitions ──");

{
  _resetMode();
  _resetQuick();

  // Mock ctx and pi
  const notifications: string[] = [];
  const messages: { customType: string; content: string }[] = [];
  const statusUpdates: Record<string, unknown> = {};

  const mockCtx = {
    ui: {
      notify: (msg: string) => notifications.push(msg),
      setStatus: (key: string, value: unknown) => { statusUpdates[key] = value; },
    },
    sessionManager: {
      getEntries: () => [],
    },
  } as any;

  const mockPi = {
    sendMessage: (msg: any) => messages.push(msg),
  } as any;

  // Save original cwd, use temp dir
  const origCwd = process.cwd();
  const tempDir = join(tmpdir(), `gsd-quick-test-${Date.now()}`);
  mkdirSync(join(tempDir, ".gsd"), { recursive: true });
  process.chdir(tempDir);

  try {
    // startQuick with empty description should notify, not dispatch
    await startQuick(mockCtx, mockPi, "quick");
    assertEq(getGSDMode(), "idle", "empty description does not change mode");
    assert(notifications.length > 0, "empty description shows notification");

    // startQuick with real description
    await startQuick(mockCtx, mockPi, "quick --fix the login button");
    assertEq(getGSDMode(), "quick", "status set to quick after startQuick");
    assert(isQuickPending(), "quick is pending after startQuick");
    assert(messages.length > 0, "message sent to pi");
    assert(messages[0].customType === "gsd-quick", "message has gsd-quick customType");

    // Verify directory was created
    const quickDir = _getQuickDir();
    assert(quickDir !== null, "quick dir is set");
    assert(existsSync(quickDir!), "quick output directory exists");

    // checkQuickEnd resets status
    await checkQuickEnd(mockCtx, mockPi);
    assertEq(getGSDMode(), "idle", "status reset to idle after checkQuickEnd");
    assert(!isQuickPending(), "quick not pending after checkQuickEnd");
  } finally {
    process.chdir(origCwd);
    try { rmSync(tempDir, { recursive: true }); } catch {}
  }
}

// ─── Error recovery ─────────────────────────────────────────────────────────

console.log("── Error recovery ──");

{
  _resetMode();
  _resetQuick();

  const mockCtx = {
    ui: {
      notify: () => {},
      setStatus: () => {},
    },
    sessionManager: {
      getEntries: () => { throw new Error("session error"); },
    },
  } as any;

  const mockPi = {
    sendMessage: () => {},
  } as any;

  const origCwd = process.cwd();
  const tempDir = join(tmpdir(), `gsd-quick-err-${Date.now()}`);
  mkdirSync(join(tempDir, ".gsd"), { recursive: true });
  process.chdir(tempDir);

  try {
    // Start quick to set mode
    await startQuick(mockCtx, mockPi, "quick --test error recovery");
    assertEq(getGSDMode(), "quick", "mode is quick before error");

    // checkQuickEnd should reset even when session throws
    await checkQuickEnd(mockCtx, mockPi);
    assertEq(getGSDMode(), "idle", "status resets to idle even on session error");
    assert(!isQuickPending(), "pending cleared even on error");
  } finally {
    process.chdir(origCwd);
    try { rmSync(tempDir, { recursive: true }); } catch {}
  }
}

// ─── transformSessionEntries export ─────────────────────────────────────────

console.log("── transformSessionEntries export ──");

assert(typeof transformSessionEntries === "function", "transformSessionEntries is exported from auto.ts");

{
  const result = transformSessionEntries([]);
  assert(Array.isArray(result), "transformSessionEntries returns array for empty input");
  assertEq(result.length, 0, "transformSessionEntries returns empty array for empty input");
}

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
