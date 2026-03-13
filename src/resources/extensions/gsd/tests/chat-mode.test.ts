/**
 * Tests for GSD chat mode — status transitions, guards, pendingChatEnd flag,
 * error recovery, and correction capture.
 */

import { startChat, endChat, checkChatEnd, isChatPending, _resetChat } from "../chat.ts";
import { getGSDMode, setGSDStatus, _resetMode } from "../status.ts";
import { loadPrompt } from "../prompt-loader.ts";
import { mkdirSync, rmSync } from "node:fs";
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

// ─── Prompt template loading ──────────────────────────────────────────────────

console.log("── Prompt template ──");

{
  const prompt = loadPrompt("chat-session", {
    quality: "standard quality instructions",
    outputDir: "/tmp/gsd-test-chat",
  });
  assert(prompt.includes("standard quality instructions"), "prompt contains quality");
  assert(prompt.includes("/tmp/gsd-test-chat"), "prompt contains output dir");
  assert(prompt.includes("tasks.md"), "prompt references tasks.md");
  assert(prompt.includes("- [ ]"), "prompt shows checkbox format");
  assert(prompt.includes("summary.md"), "prompt references summary.md");
}

// ─── Status transitions ──────────────────────────────────────────────────────

console.log("── Status transitions ──");

{
  _resetMode();
  _resetChat();

  const notifications: string[] = [];
  const messages: { customType: string; content: string }[] = [];

  const mockCtx = {
    ui: {
      notify: (msg: string) => notifications.push(msg),
      setStatus: () => {},
    },
    sessionManager: {
      getEntries: () => [],
    },
  } as any;

  const mockPi = {
    sendMessage: (msg: any) => messages.push(msg),
  } as any;

  const origCwd = process.cwd();
  const tempDir = join(tmpdir(), `gsd-chat-test-${Date.now()}`);
  mkdirSync(join(tempDir, ".gsd"), { recursive: true });
  process.chdir(tempDir);

  try {
    // startChat sets mode to "chat"
    await startChat(mockCtx, mockPi);
    assertEq(getGSDMode(), "chat", "startChat sets mode to chat");
    assert(messages.length > 0, "message sent to pi");
    assert(messages[0].customType === "gsd-chat", "message has gsd-chat customType");

    // startChat guards against double-start
    const prevNotifCount = notifications.length;
    await startChat(mockCtx, mockPi);
    assert(notifications.length > prevNotifCount, "double-start shows notification");
    assert(
      notifications[notifications.length - 1].includes("already active"),
      "double-start notification mentions already active",
    );

    // endChat sets pendingChatEnd flag
    await endChat(mockCtx, mockPi);
    assert(isChatPending(), "endChat sets pendingChatEnd flag");

    // checkChatEnd resets mode to idle
    await checkChatEnd(mockCtx, mockPi);
    assertEq(getGSDMode(), "idle", "checkChatEnd resets mode to idle");
    assert(!isChatPending(), "checkChatEnd clears pendingChatEnd");

    // checkChatEnd only runs when pendingChatEnd is set
    _resetMode();
    _resetChat();
    setGSDStatus(mockCtx, "chat");
    // pendingChatEnd is false, so checkChatEnd should be a no-op
    await checkChatEnd(mockCtx, mockPi);
    assertEq(getGSDMode(), "chat", "checkChatEnd is no-op when pendingChatEnd not set");
  } finally {
    process.chdir(origCwd);
    try { rmSync(tempDir, { recursive: true }); } catch {}
  }
}

// ─── Error recovery ─────────────────────────────────────────────────────────

console.log("── Error recovery ──");

{
  _resetMode();
  _resetChat();

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
  const tempDir = join(tmpdir(), `gsd-chat-err-${Date.now()}`);
  mkdirSync(join(tempDir, ".gsd"), { recursive: true });
  process.chdir(tempDir);

  try {
    await startChat(mockCtx, mockPi);
    assertEq(getGSDMode(), "chat", "mode is chat before error");

    // Manually set pendingChatEnd to simulate endChat
    await endChat(mockCtx, mockPi);

    // checkChatEnd should reset even when session throws
    await checkChatEnd(mockCtx, mockPi);
    assertEq(getGSDMode(), "idle", "status resets to idle even on session error");
    assert(!isChatPending(), "pending cleared even on error");
  } finally {
    process.chdir(origCwd);
    try { rmSync(tempDir, { recursive: true }); } catch {}
  }
}

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
