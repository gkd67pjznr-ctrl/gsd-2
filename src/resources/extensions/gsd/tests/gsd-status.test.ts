/**
 * Tests for status.ts — setGSDStatus, isAutoActive, getGSDMode.
 */

import { setGSDStatus, isAutoActive, getGSDMode, _resetMode } from "../status.ts";

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

// Mock ExtensionContext
function mockCtx() {
  const calls: Array<{ key: string; value: string | undefined }> = [];
  return {
    ctx: {
      ui: {
        setStatus(key: string, value: string | undefined) {
          calls.push({ key, value });
        },
      },
    } as any,
    calls,
  };
}

// Reset before each logical group
_resetMode();

// ── setGSDStatus calls setStatus with correct key/value ──────────────────

{
  const { ctx, calls } = mockCtx();
  setGSDStatus(ctx, "auto");
  assert(calls.length === 1, "setGSDStatus should call setStatus once");
  assert(calls[0].key === "gsd-mode", `key should be "gsd-mode", got "${calls[0].key}"`);
  assert(calls[0].value === "auto", `value should be "auto", got "${calls[0].value}"`);
}

{
  const { ctx, calls } = mockCtx();
  setGSDStatus(ctx, "idle");
  assert(calls[0].key === "gsd-mode", "idle: key should be gsd-mode");
  assert(calls[0].value === undefined, `idle: value should be undefined, got "${calls[0].value}"`);
}

{
  const { ctx, calls } = mockCtx();
  setGSDStatus(ctx, "chat");
  assert(calls[0].value === "chat", `chat: value should be "chat"`);
}

{
  const { ctx, calls } = mockCtx();
  setGSDStatus(ctx, "quick");
  assert(calls[0].value === "quick", `quick: value should be "quick"`);
}

// ── isAutoActive reflects mode ───────────────────────────────────────────

{
  const { ctx } = mockCtx();
  setGSDStatus(ctx, "auto");
  assert(isAutoActive() === true, "isAutoActive should be true when mode is auto");

  setGSDStatus(ctx, "chat");
  assert(isAutoActive() === false, "isAutoActive should be false when mode is chat");

  setGSDStatus(ctx, "idle");
  assert(isAutoActive() === false, "isAutoActive should be false when mode is idle");

  setGSDStatus(ctx, "quick");
  assert(isAutoActive() === false, "isAutoActive should be false when mode is quick");
}

// ── getGSDMode returns current mode ──────────────────────────────────────

{
  const { ctx } = mockCtx();
  setGSDStatus(ctx, "auto");
  assert(getGSDMode() === "auto", `getGSDMode should return "auto"`);

  setGSDStatus(ctx, "idle");
  assert(getGSDMode() === "idle", `getGSDMode should return "idle"`);

  setGSDStatus(ctx, "chat");
  assert(getGSDMode() === "chat", `getGSDMode should return "chat"`);
}

// ── _resetMode resets to idle ────────────────────────────────────────────

{
  const { ctx } = mockCtx();
  setGSDStatus(ctx, "auto");
  _resetMode();
  assert(getGSDMode() === "idle", "_resetMode should reset to idle");
  assert(isAutoActive() === false, "_resetMode should make isAutoActive false");
}

// ── Report ───────────────────────────────────────────────────────────────

console.log(`\ngsd-status: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
