/**
 * GSD Quality Gating — resolveQualityLevel, buildQualityInstructions, gate events.
 *
 * Configurable quality enforcement for dispatch prompts. Three levels:
 * - `fast`: zero behavioral change — no instructions injected, no gate events
 * - `standard`: pre-task codebase scan + context7 lookup; post-task diff review + test check
 * - `strict`: all standard checks plus mandatory context7 for all APIs, test baseline, full suite, line-by-line diff
 *
 * Quality instructions are injected into dispatch prompts via the `{{quality}}` template variable.
 * Gate events are recorded in memory and flushed to the metrics ledger by the caller.
 *
 * All public functions are synchronous and non-throwing (required by loadPrompt template vars).
 *
 * Diagnostic surfaces:
 * - `getGateEvents()` returns current pending events for inspection
 * - `resolveQualityLevel()` silently falls back to "fast" on any error
 * - `recordGateEvent()` silently drops invalid events — never throws
 */

import { loadEffectiveGSDPreferences } from "./preferences.ts";

// ─── Types ─────────────────────────────────────────────────────────────────

export type QualityLevel = "fast" | "standard" | "strict";

export type GateName =
  | "codebase_scan"
  | "context7_lookup"
  | "test_baseline"
  | "test_gate"
  | "diff_review";

export type GateOutcome = "passed" | "warned" | "skipped" | "blocked";

export interface GateEvent {
  gate: GateName;
  outcome: GateOutcome;
  level: QualityLevel;
  timestamp: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

export const VALID_QUALITY_LEVELS = new Set<QualityLevel>([
  "fast",
  "standard",
  "strict",
]);

export const VALID_GATES = new Set<GateName>([
  "codebase_scan",
  "context7_lookup",
  "test_baseline",
  "test_gate",
  "diff_review",
]);

export const VALID_OUTCOMES = new Set<GateOutcome>([
  "passed",
  "warned",
  "skipped",
  "blocked",
]);

export const DEFAULT_QUALITY_LEVEL: QualityLevel = "fast";

// ─── Quality Level Resolution ──────────────────────────────────────────────

/**
 * Resolve the effective quality level from preferences.
 *
 * Reads `quality_level` from the effective GSD preferences (project overrides global).
 * Returns "fast" if the field is missing, invalid, or any error occurs.
 *
 * Non-throwing: wraps in try/catch, returns "fast" on any error.
 */
export function resolveQualityLevel(cwd?: string): QualityLevel {
  try {
    const prefs = loadEffectiveGSDPreferences();
    if (!prefs) return DEFAULT_QUALITY_LEVEL;

    // quality_level may not be on the typed interface yet — read it safely
    const raw = (prefs.preferences as Record<string, unknown>).quality_level;
    if (typeof raw !== "string") return DEFAULT_QUALITY_LEVEL;

    if (VALID_QUALITY_LEVELS.has(raw as QualityLevel)) {
      return raw as QualityLevel;
    }

    return DEFAULT_QUALITY_LEVEL;
  } catch {
    return DEFAULT_QUALITY_LEVEL;
  }
}

// ─── Quality Instructions ──────────────────────────────────────────────────

/**
 * Build quality sentinel instructions for prompt injection.
 *
 * Synchronous, non-throwing (required by loadPrompt template vars).
 *
 * - "fast" → empty string (zero content, zero behavioral change)
 * - "standard" → pre-task codebase scan + context7 for new deps; post-task diff + test check (~200-400 tokens)
 * - "strict" → all standard + mandatory context7, test baseline, full suite, line-by-line diff (~400-600 tokens)
 */
export function buildQualityInstructions(level: QualityLevel): string {
  if (level === "fast") return "";

  if (level === "standard") return STANDARD_INSTRUCTIONS;

  if (level === "strict") return STRICT_INSTRUCTIONS;

  // Unknown level — treat as fast (no instructions)
  return "";
}

const STANDARD_INSTRUCTIONS = `## Pre-Task Quality Gates
Before implementing, perform these checks:
- **Codebase scan:** Use \`rg\` or \`find\` to check if similar functionality, patterns, or utilities already exist in the codebase. Do not duplicate existing code.
- **Context7 lookup:** If this task involves a new external dependency or library you haven't used in this project before, use \`resolve_library\` + \`get_library_docs\` to verify API assumptions before coding.

## Post-Task Quality Gates
After implementation, before writing the task summary:
- **Diff review:** Run \`git diff --stat\` and scan the diff for naming conflicts, leftover TODOs, debug logging, unhandled error paths, and accidental file changes.
- **Test check:** If you created new exported functions or classes, verify that tests cover them. Add tests for untested exports.
- **Tech debt logging:** Log any critical or high severity code issues you noticed (bugs, design problems, test gaps, doc gaps) to \`.gsd/TECH-DEBT.md\` using the structured format.`;

const STRICT_INSTRUCTIONS = `## Pre-Task Quality Gates (Strict)
Before implementing, perform ALL of these checks:
- **Codebase scan:** Use \`rg\` or \`find\` to check if similar functionality, patterns, or utilities already exist in the codebase. Do not duplicate existing code.
- **Context7 lookup (mandatory):** Use \`resolve_library\` + \`get_library_docs\` for ALL library and framework APIs used in this task, not just new ones. Verify current API signatures and behavior.
- **Test baseline:** Run the existing test suite before making any changes. Record which tests pass. If any tests fail before your changes, note them explicitly.

## Post-Task Quality Gates (Strict)
After implementation, before writing the task summary:
- **Full test suite:** Run ALL tests — both new tests and the full existing test suite. Every test must pass. If any test fails, fix it before proceeding.
- **Diff review (line-by-line):** Run \`git diff\` and review every changed line for logic correctness, not just naming and style. Check for edge cases, off-by-one errors, missing null checks, and incorrect assumptions.
- **Test check:** If you created new exported functions or classes, verify that tests cover them. Add tests for untested exports.
- **Tech debt logging (all severities):** Log ALL code issues discovered during this task (critical, high, medium, low) to \`.gsd/TECH-DEBT.md\` using the structured format.`;

// ─── Gate Event Management ─────────────────────────────────────────────────

let pendingGateEvents: GateEvent[] = [];

/**
 * Record a gate event. Validates gate name and outcome against known sets.
 * Invalid events are silently dropped (non-throwing).
 *
 * @param gate - The gate name (must be in VALID_GATES)
 * @param outcome - The gate outcome (must be in VALID_OUTCOMES)
 * @param level - The quality level under which the gate ran
 */
export function recordGateEvent(
  gate: string,
  outcome: string,
  level: QualityLevel,
): void {
  try {
    if (!VALID_GATES.has(gate as GateName)) return;
    if (!VALID_OUTCOMES.has(outcome as GateOutcome)) return;

    pendingGateEvents.push({
      gate: gate as GateName,
      outcome: outcome as GateOutcome,
      level,
      timestamp: Date.now(),
    });
  } catch {
    // Non-throwing: silently drop on any error
  }
}

/**
 * Get a copy of all pending gate events.
 * Returns a shallow copy to prevent external mutation of the internal array.
 */
export function getGateEvents(): GateEvent[] {
  return [...pendingGateEvents];
}

/**
 * Clear all pending gate events.
 * Called after flushing events to the metrics ledger.
 */
export function clearGateEvents(): void {
  pendingGateEvents = [];
}
