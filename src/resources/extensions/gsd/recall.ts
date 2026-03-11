/**
 * GSD Recall Block Assembly — buildRecallBlock, estimateTokens.
 *
 * Replaces static self-report text with dynamic, context-filtered recall of
 * past corrections and preferences. Core implementation for R007 (Live Recall
 * Injection).
 *
 * `buildRecallBlock()` is synchronous and non-throwing (required by loadPrompt()
 * vars object in auto.ts). It reads active preferences and corrections,
 * deduplicates, applies slot allocation (preferences first, 10 max), enforces
 * a ~3K token budget with word-based estimation, and appends self-report
 * instructions at the end.
 *
 * Diagnostic surfaces:
 * - Return value is the observable output — inspectable via {{corrections}} var
 * - Returns "" on any error (matches existing buildCorrectionsVar() contract)
 * - No partial outputs — either full assembly succeeds or empty string is returned
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { readCorrections } from "./corrections.ts";
import { readPreferences } from "./pattern-preferences.ts";
import type { CorrectionEntry } from "./correction-types.ts";
import type { PreferenceEntry } from "./preference-types.ts";

// ─── Constants ─────────────────────────────────────────────────────────────

const MAX_ENTRIES = 10;
const MAX_TOKENS = 3000;
const FOOTER_RESERVE = 20;

/**
 * Self-report instruction block — tells the executing agent how to log
 * corrections when it catches its own mistakes. Appended after dynamic recall
 * content in every non-empty output.
 */
const SELF_REPORT_INSTRUCTIONS = `
10a. **Self-report corrections:** When you catch yourself making a mistake — wrong approach, bad pattern, misread requirement, stale assumption — log a correction entry so the system can learn from it. Append a single JSON line to \`.gsd/patterns/corrections.jsonl\` using \`bash\`:
    \`\`\`
    echo '{"correction_from":"<what you did wrong>","correction_to":"<what the fix was>","diagnosis_category":"<category>","diagnosis_text":"<1-2 sentence explanation>","scope":"<file|filetype|phase|project|global>","phase":"executing","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","session_id":"auto","source":"self_report"}' >> .gsd/patterns/corrections.jsonl
    \`\`\`
    Valid categories: \`code.wrong_pattern\`, \`code.missing_context\`, \`code.stale_knowledge\`, \`code.over_engineering\`, \`code.under_engineering\`, \`code.style_mismatch\`, \`code.scope_drift\`, \`process.planning_error\`, \`process.research_gap\`, \`process.implementation_bug\`, \`process.integration_miss\`, \`process.convention_violation\`, \`process.requirement_misread\`, \`process.regression\`.
    Only log genuine corrections, not routine iterations. Keep \`diagnosis_text\` under 100 words.
`.trim();

// ─── Token Estimation ──────────────────────────────────────────────────────

/**
 * Estimate token count from text using word-based approximation.
 * Formula: ceil(word_count / 0.75) — conservative enough to stay under
 * real token limits while being simple and deterministic.
 *
 * Exported for test verification.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length / 0.75);
}

// ─── Kill Switch ───────────────────────────────────────────────────────────

/**
 * Check if correction capture is disabled via preferences.md kill switch.
 * Reads project preferences first, then global. Returns true only if
 * correction_capture is explicitly set to false.
 *
 * Silent on all errors — defaults to capture enabled.
 */
function isCaptureDisabled(cwd: string): boolean {
  try {
    const paths = [
      join(cwd, ".gsd", "preferences.md"),
      join(homedir(), ".gsd", "preferences.md"),
    ];

    for (const prefsPath of paths) {
      try {
        if (!existsSync(prefsPath)) continue;
        const raw = readFileSync(prefsPath, "utf-8");
        const match = raw.match(/^---\n([\s\S]*?)\n---/);
        if (!match) continue;
        const frontmatter = match[1];
        const captureMatch = frontmatter.match(/^correction_capture:\s*(.+)$/m);
        if (captureMatch && captureMatch[1].trim() === "false") {
          return true;
        }
      } catch {
        // Skip unreadable preference files
      }
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Build Recall Block ────────────────────────────────────────────────────

/**
 * Build the recall block for dispatch prompt injection.
 *
 * Assembly order:
 * 1. Check kill switch — return "" if disabled
 * 2. Read active preferences and corrections
 * 3. Deduplicate — exclude corrections whose category:scope matches a preference
 * 4. Slot allocation — preferences first, corrections fill remaining (max 10)
 * 5. Token budget — assemble lines checking against 3000 token limit
 * 6. Wrap dynamic recall in <system-reminder> tags
 * 7. Append self-report instructions after the recall block
 *
 * Returns:
 * - "" if kill switch is active
 * - Self-report instructions only (no <system-reminder>) if no recall data exists
 * - Full recall block + self-report instructions if recall data exists
 *
 * Never throws. Returns "" on any error.
 */
export function buildRecallBlock(options?: { cwd?: string }): string {
  try {
    const cwd = options?.cwd ?? process.cwd();

    // Kill switch check
    if (isCaptureDisabled(cwd)) {
      return "";
    }

    // Read active data
    const preferences = readPreferences({ status: "active" }, { cwd });
    const corrections = readCorrections({ status: "active" }, { cwd });

    // Dedup: build Set of category:scope from preferences
    const promotedKeys = new Set<string>();
    for (const p of preferences) {
      if (p.category && p.scope) {
        promotedKeys.add(`${p.category}:${p.scope}`);
      }
    }

    // Filter corrections: exclude those already captured as a preference
    const filteredCorrections = corrections.filter((c: CorrectionEntry) => {
      if (!c.diagnosis_category || !c.scope) return true; // keep malformed entries
      return !promotedKeys.has(`${c.diagnosis_category}:${c.scope}`);
    });

    // Sort corrections chronologically (ascending) for stable, fair recall ordering.
    // readCorrections() returns descending; we reverse so oldest corrections get
    // their slot first rather than always being displaced by recent ones.
    filteredCorrections.sort((a, b) =>
      (a.timestamp || "").localeCompare(b.timestamp || ""),
    );

    // Slot allocation: preferences get priority, then corrections fill remaining
    const selectedPrefs = preferences.slice(0, MAX_ENTRIES);
    const remainingSlots = Math.max(0, MAX_ENTRIES - selectedPrefs.length);
    const selectedCorrs = filteredCorrections.slice(0, remainingSlots);

    // Empty state: no recall data → self-report instructions only
    if (selectedPrefs.length === 0 && selectedCorrs.length === 0) {
      return SELF_REPORT_INSTRUCTIONS;
    }

    // Token budget assembly
    let tokenCount = 0;
    let skipped = 0;
    const prefLines: string[] = [];
    const corrLines: string[] = [];

    const headerText = "<system-reminder>\n## Correction Recall\n\nPreferences (learned):";
    tokenCount += estimateTokens(headerText);

    for (const p of selectedPrefs) {
      const line = `- [${p.category || "unknown"}] ${p.preference_text || ""}`;
      const cost = estimateTokens(line);
      if (tokenCount + cost + FOOTER_RESERVE > MAX_TOKENS) {
        skipped++;
        continue;
      }
      prefLines.push(line);
      tokenCount += cost;
    }

    const corrHeader = "\nRecent corrections:";
    tokenCount += estimateTokens(corrHeader);

    for (const c of selectedCorrs) {
      const line = `- [${c.diagnosis_category || "unknown"}] ${c.correction_to || ""}`;
      const cost = estimateTokens(line);
      if (tokenCount + cost + FOOTER_RESERVE > MAX_TOKENS) {
        skipped++;
        continue;
      }
      corrLines.push(line);
      tokenCount += cost;
    }

    // Build final recall block
    let body = headerText + "\n" + prefLines.join("\n") + corrHeader + "\n" + corrLines.join("\n");
    if (skipped > 0) {
      body += `\n\n(+${skipped} more corrections not shown -- see corrections.jsonl)`;
    }
    body += "\n</system-reminder>";

    // Combine recall block + self-report instructions
    return body.trim() + "\n\n" + SELF_REPORT_INSTRUCTIONS;
  } catch {
    // Non-throwing: return empty string on any error
    return "";
  }
}
