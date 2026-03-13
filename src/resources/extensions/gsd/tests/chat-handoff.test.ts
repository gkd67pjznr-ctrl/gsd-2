/**
 * Tests for GSD chat handoff — findRecentTaskList discovery,
 * empty directory handling, and sort order.
 */

import { findRecentTaskList, _resetChat } from "../chat.ts";
import { startQuick, _resetQuick } from "../quick.ts";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
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

// ─── findRecentTaskList ───────────────────────────────────────────────────────

console.log("── findRecentTaskList ──");

{
  const tempDir = join(tmpdir(), `gsd-chat-handoff-${Date.now()}`);

  try {
    // Returns null when no conversations directory exists
    assertEq(findRecentTaskList(tempDir), null, "returns null when no conversations dir");

    // Returns null when conversations exist but none have tasks.md
    const convDir = join(tempDir, ".gsd", "conversations");
    mkdirSync(join(convDir, "2026-01-01T00-00-00-000Z"), { recursive: true });
    writeFileSync(join(convDir, "2026-01-01T00-00-00-000Z", "summary.md"), "# Summary\n");
    assertEq(findRecentTaskList(tempDir), null, "returns null when no tasks.md in any conversation");

    // Returns path to tasks.md when it exists
    const dir2 = "2026-01-02T00-00-00-000Z";
    mkdirSync(join(convDir, dir2), { recursive: true });
    const tasksPath = join(convDir, dir2, "tasks.md");
    writeFileSync(tasksPath, "- [ ] First task\n- [ ] Second task\n");
    assertEq(findRecentTaskList(tempDir), tasksPath, "returns path to most recent tasks.md");

    // Sorts by directory name descending (most recent first)
    const dir3 = "2026-01-03T00-00-00-000Z";
    mkdirSync(join(convDir, dir3), { recursive: true });
    const newerTasksPath = join(convDir, dir3, "tasks.md");
    writeFileSync(newerTasksPath, "- [ ] Newer task\n");
    assertEq(findRecentTaskList(tempDir), newerTasksPath, "returns most recent (sorted descending)");

    // Skips directories without tasks.md even if newer
    const dir4 = "2026-01-04T00-00-00-000Z";
    mkdirSync(join(convDir, dir4), { recursive: true });
    writeFileSync(join(convDir, dir4, "summary.md"), "# No tasks\n");
    assertEq(findRecentTaskList(tempDir), newerTasksPath, "skips dirs without tasks.md");

    // Returns the newest dir that HAS tasks.md
    const dir5 = "2026-01-05T00-00-00-000Z";
    mkdirSync(join(convDir, dir5), { recursive: true });
    const newestTasksPath = join(convDir, dir5, "tasks.md");
    writeFileSync(newestTasksPath, "- [ ] Newest task\n");
    assertEq(findRecentTaskList(tempDir), newestTasksPath, "returns newest dir with tasks.md");
  } finally {
    try { rmSync(tempDir, { recursive: true }); } catch {}
  }
}

// ─── Quick mode task list integration ─────────────────────────────────────────

console.log("\n── Quick mode + chat task list handoff ──");

{
  const tempDir = join(tmpdir(), `gsd-quick-handoff-${Date.now()}`);
  const origCwd = process.cwd();

  try {
    // Setup: create a conversations dir with a task list
    const convDir = join(tempDir, ".gsd", "conversations", "2026-03-12T00-00-00-000Z");
    mkdirSync(convDir, { recursive: true });
    mkdirSync(join(tempDir, ".gsd", "quick"), { recursive: true });
    writeFileSync(join(convDir, "tasks.md"), "- [ ] Refactor auth module\n- [x] Done task\n- [ ] Add tests\n");

    // Mock ctx and pi
    let notifyMsg = "";
    let notifyType = "";
    let sentMessage: any = null;
    const mockCtx = {
      ui: { notify: (msg: string, type: string) => { notifyMsg = msg; notifyType = type; }, setStatus: () => {} },
      sessionManager: { getEntries: () => [] },
    } as any;
    const mockPi = {
      sendMessage: (msg: any, opts: any) => { sentMessage = msg; },
    } as any;

    // Test: bare /gsd quick with task list discovers and formats undone items
    process.chdir(tempDir);
    _resetQuick();
    await startQuick(mockCtx, mockPi, "quick");
    assert(sentMessage !== null, "bare /gsd quick with task list sends a message");
    assert(
      sentMessage?.content?.includes("Execute task list from chat"),
      "prompt contains 'Execute task list from chat' prefix",
    );
    assert(
      sentMessage?.content?.includes("Refactor auth module"),
      "prompt includes undone task: Refactor auth module",
    );
    assert(
      sentMessage?.content?.includes("Add tests"),
      "prompt includes undone task: Add tests",
    );
    assert(
      !sentMessage?.content?.includes("Done task"),
      "prompt excludes done task",
    );
    _resetQuick();

    // Test: bare /gsd quick with no task list shows usage notification
    const emptyDir = join(tmpdir(), `gsd-quick-empty-${Date.now()}`);
    mkdirSync(join(emptyDir, ".gsd"), { recursive: true });
    process.chdir(emptyDir);
    notifyMsg = "";
    sentMessage = null;
    await startQuick(mockCtx, mockPi, "quick");
    assert(sentMessage === null, "no message sent when no task list");
    assert(notifyMsg.includes("Usage"), "shows usage notification when no task list");
    assertEq(notifyType, "warning", "usage notification is a warning");
    _resetQuick();

    try { rmSync(emptyDir, { recursive: true }); } catch {}
  } finally {
    process.chdir(origCwd);
    try { rmSync(tempDir, { recursive: true }); } catch {}
  }
}

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
