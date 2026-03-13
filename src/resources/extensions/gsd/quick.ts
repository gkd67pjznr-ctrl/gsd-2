/**
 * GSD Quick Mode — single-session task dispatch.
 *
 * `/gsd quick --fix the login button` dispatches a one-shot task:
 * parse description, create output dir, set status, load prompt, send message.
 * On agent_end, capture corrections and reset status.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { setGSDStatus, getGSDMode } from "./status.js";
import { loadPrompt } from "./prompt-loader.js";
import { resolveQualityLevel, buildQualityInstructions } from "./quality-gating.js";
import { transformSessionEntries } from "./auto.js";
import { detectCorrections } from "./correction-detector.js";
import type { SessionEntry as DetectorSessionEntry } from "./correction-detector.js";
import { writeCorrection } from "./corrections.js";
import { checkAndPromote } from "./pattern-preferences.js";

// ─── State ────────────────────────────────────────────────────────────────────

let pendingQuickDir: string | null = null;

/**
 * Parse the task description from raw /gsd quick args.
 * Strips leading "quick", strips leading "--", trims.
 */
export function parseQuickDescription(rawArgs: string): string {
  let desc = rawArgs.trim();
  // Strip leading "quick" (the subcommand itself)
  if (desc.startsWith("quick")) {
    desc = desc.slice(5).trim();
  }
  // Strip leading "--" separator
  if (desc.startsWith("--")) {
    desc = desc.slice(2).trim();
  }
  return desc;
}

/**
 * Start a quick mode session.
 */
export async function startQuick(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  rawArgs: string,
): Promise<void> {
  const description = parseQuickDescription(rawArgs);

  if (!description) {
    ctx.ui.notify("Usage: /gsd quick --describe the task", "warning");
    return;
  }

  // Create output directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const basePath = process.cwd();
  const quickDir = join(basePath, ".gsd", "quick", timestamp);
  mkdirSync(quickDir, { recursive: true });
  pendingQuickDir = quickDir;

  // Set status
  setGSDStatus(ctx, "quick");

  // Build quality instructions
  const level = resolveQualityLevel();
  const quality = buildQualityInstructions(level);

  // Load and send prompt
  const prompt = loadPrompt("quick-task", {
    description,
    quality,
    outputDir: quickDir,
  });

  pi.sendMessage(
    { customType: "gsd-quick", content: prompt, display: false },
    { triggerTurn: true },
  );
}

/**
 * Called from agent_end to capture corrections and reset status.
 */
export async function checkQuickEnd(
  ctx: ExtensionContext,
  _pi: ExtensionAPI,
): Promise<void> {
  if (getGSDMode() !== "quick") return;

  try {
    // Capture corrections from the session
    const basePath = process.cwd();
    try {
      const piEntries = ctx.sessionManager.getEntries();
      if (piEntries && piEntries.length > 0) {
        const detectorEntries = transformSessionEntries(piEntries);
        if (detectorEntries.length > 0) {
          const corrections = detectCorrections({
            session_id: `quick-${Date.now()}`,
            phase: "quick",
            entries: detectorEntries,
            unit_type: "quick",
            unit_id: pendingQuickDir ?? "unknown",
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
    pendingQuickDir = null;
  }
}

/**
 * Returns true if a quick session is currently pending.
 */
export function isQuickPending(): boolean {
  return pendingQuickDir !== null;
}

/**
 * Get the current quick output directory (for testing).
 */
export function _getQuickDir(): string | null {
  return pendingQuickDir;
}

/**
 * Reset quick state (for testing).
 */
export function _resetQuick(): void {
  pendingQuickDir = null;
}
