/**
 * GSD Chat Mode — brainstorming session with recall.
 *
 * `/gsd chat` starts a brainstorming session. The agent has full recall
 * (injected automatically via before_agent_start). When the user types
 * `/gsd chat end`, the agent summarizes the conversation and writes
 * `summary.md` and `tasks.md` to `.gsd/conversations/<timestamp>/`.
 *
 * `/gsd quick` can then discover and execute those task lists.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { setGSDStatus, getGSDMode } from "./status.js";
import { loadPrompt } from "./prompt-loader.js";
import { resolveQualityLevel, buildQualityInstructions } from "./quality-gating.js";
import { transformSessionEntries } from "./auto.js";
import { detectCorrections } from "./correction-detector.js";
import { writeCorrection } from "./corrections.js";
import { checkAndPromote } from "./pattern-preferences.js";

// ─── State ────────────────────────────────────────────────────────────────────

let pendingChatEnd = false;
let chatDir: string | null = null;

/**
 * Start a chat mode session.
 */
export async function startChat(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
): Promise<void> {
  if (getGSDMode() === "chat") {
    ctx.ui.notify("A chat session is already active. Use /gsd chat end to finish it.", "warning");
    return;
  }

  // Create output directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const basePath = process.cwd();
  chatDir = join(basePath, ".gsd", "conversations", timestamp);
  mkdirSync(chatDir, { recursive: true });

  // Set status
  setGSDStatus(ctx, "chat");

  // Build quality instructions
  const level = resolveQualityLevel();
  const quality = buildQualityInstructions(level);

  // Load and send prompt
  const prompt = loadPrompt("chat-session", {
    quality,
    outputDir: chatDir,
  });

  pi.sendMessage(
    { customType: "gsd-chat", content: prompt, display: false },
    { triggerTurn: true },
  );
}

/**
 * End a chat session — sets the pendingChatEnd flag so agent_end handles cleanup.
 */
export async function endChat(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
): Promise<void> {
  if (getGSDMode() !== "chat") {
    ctx.ui.notify("No active chat session to end.", "warning");
    return;
  }

  pendingChatEnd = true;

  // Send a message to trigger the agent to summarize
  const outputDir = chatDir ?? ".gsd/conversations/unknown";
  pi.sendMessage(
    {
      customType: "gsd-chat-end",
      content: `The user has ended the chat session. Write your summary and task list now to \`${outputDir}/summary.md\` and \`${outputDir}/tasks.md\`. Follow the format from your system instructions.`,
      display: false,
    },
    { triggerTurn: true },
  );
}

/**
 * Called from agent_end to capture corrections and reset status.
 */
export async function checkChatEnd(
  ctx: ExtensionContext,
  _pi: ExtensionAPI,
): Promise<void> {
  if (!pendingChatEnd) return;

  try {
    // Capture corrections from the session
    const basePath = process.cwd();
    try {
      const piEntries = ctx.sessionManager.getEntries();
      if (piEntries && piEntries.length > 0) {
        const detectorEntries = transformSessionEntries(piEntries);
        if (detectorEntries.length > 0) {
          const corrections = detectCorrections({
            session_id: `chat-${Date.now()}`,
            phase: "chat",
            entries: detectorEntries,
            unit_type: "chat",
            unit_id: chatDir ?? "unknown",
          });

          for (const correction of corrections) {
            writeCorrection(correction, { cwd: basePath });
            try {
              checkAndPromote(
                { category: correction.diagnosis_category, scope: correction.scope },
                { cwd: basePath },
              );
            } catch {
              // Non-fatal
            }
          }
        }
      }
    } catch {
      // Non-fatal — correction capture must never block status reset
    }
  } finally {
    // Always reset status
    setGSDStatus(ctx, "idle");
    pendingChatEnd = false;
    chatDir = null;
  }
}

/**
 * Returns true if a chat end is pending (waiting for agent_end).
 */
export function isChatPending(): boolean {
  return pendingChatEnd;
}

/**
 * Find the most recent tasks.md from `.gsd/conversations/`.
 * Returns the absolute path or null if none found.
 */
export function findRecentTaskList(basePath?: string): string | null {
  const cwd = basePath ?? process.cwd();
  const conversationsDir = join(cwd, ".gsd", "conversations");

  if (!existsSync(conversationsDir)) return null;

  let dirs: string[];
  try {
    dirs = readdirSync(conversationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .reverse(); // Most recent first (ISO timestamps sort lexicographically)
  } catch {
    return null;
  }

  for (const dir of dirs) {
    const tasksPath = join(conversationsDir, dir, "tasks.md");
    if (existsSync(tasksPath)) {
      return tasksPath;
    }
  }

  return null;
}

/**
 * Reset chat state (for testing).
 */
export function _resetChat(): void {
  pendingChatEnd = false;
  chatDir = null;
}
