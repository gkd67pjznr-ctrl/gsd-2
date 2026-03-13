/**
 * GSD Status Bar Helper — unified status key for all GSD modes.
 *
 * Replaces per-feature status keys ("gsd-auto") with a single "gsd-mode"
 * key (D051). Exports `isAutoActive()` so other modules can check if
 * auto-mode owns the session without importing auto.ts.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

type GSDMode = "idle" | "chat" | "quick" | "auto";

let currentMode: GSDMode = "idle";

/**
 * Set the current GSD mode and update the status bar.
 * When mode is 'idle', the status bar key is cleared (set to undefined).
 */
export function setGSDStatus(ctx: ExtensionContext, mode: GSDMode): void {
  currentMode = mode;
  ctx.ui.setStatus("gsd-mode", mode === "idle" ? undefined : mode);
}

/**
 * Returns true only when the current mode is 'auto'.
 * Used by before_agent_start to decide whether to inject recall.
 */
export function isAutoActive(): boolean {
  return currentMode === "auto";
}

/**
 * Returns the current GSD mode. Primarily for testing.
 */
export function getGSDMode(): GSDMode {
  return currentMode;
}

/**
 * Reset mode to idle without a context (for testing only).
 */
export function _resetMode(): void {
  currentMode = "idle";
}
