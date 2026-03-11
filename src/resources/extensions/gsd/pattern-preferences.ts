/**
 * GSD Preference Promotion Engine — checkAndPromote, writePreference, readPreferences.
 *
 * Transforms repeated corrections into durable preferences. When ≥3 corrections
 * share the same category+scope, a preference is promoted with a confidence score
 * of count/(count+2).
 *
 * All I/O is non-fatal — errors are caught and returned as structured results,
 * never thrown. This module must never break the calling code path.
 *
 * Diagnostic surfaces:
 * - PromoteResult.reason tells callers exactly why promotion failed
 * - WritePreferenceResult.reason tells callers why a write failed
 * - readPreferences() returns [] on any error (safe default)
 * - preferences.jsonl is a human-readable inspection surface
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import type { DiagnosisCategory, CorrectionScope, CorrectionEntry } from "./correction-types.ts";
import { VALID_CATEGORIES } from "./correction-types.ts";
import { readCorrections } from "./corrections.ts";
import { promoteToUserLevel } from "./promote-preference.js";
import type {
  PreferenceEntry,
  PromoteResult,
  WritePreferenceResult,
} from "./preference-types.ts";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PreferenceReadFilters {
  scope?: CorrectionScope;
  status?: "active" | "retired";
}

export interface PreferenceOptions {
  cwd?: string;
}

export interface PromoteInput {
  category: DiagnosisCategory | string;
  scope: CorrectionScope | string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PATTERNS_DIR = ".gsd/patterns";
const PREFERENCES_FILE = "preferences.jsonl";
const PROMOTION_THRESHOLD = 3;

// ─── writePreference ───────────────────────────────────────────────────────

/**
 * Upsert a preference entry into preferences.jsonl using tmp+rename atomic writes.
 * Matches existing entries by category+scope. On match, merges fields while
 * preserving created_at and retired_at from the existing entry. On no match,
 * appends a new entry.
 *
 * Never throws. Returns a structured WritePreferenceResult.
 */
export function writePreference(
  preference: PreferenceEntry,
  options?: PreferenceOptions,
): WritePreferenceResult {
  try {
    const cwd = options?.cwd ?? process.cwd();
    const patternsDir = join(cwd, PATTERNS_DIR);
    const filePath = join(patternsDir, PREFERENCES_FILE);
    const tmpPath = filePath + ".tmp";

    // Ensure patterns directory exists
    mkdirSync(patternsDir, { recursive: true });

    // Read existing lines
    let rawLines: string[] = [];
    try {
      const content = readFileSync(filePath, "utf-8");
      rawLines = content.split("\n").filter(l => l.trim() !== "");
    } catch {
      // File doesn't exist yet — start fresh
    }

    // Parse and upsert
    let found = false;
    const updatedLines = rawLines.map(line => {
      try {
        const existing = JSON.parse(line) as PreferenceEntry;
        if (existing.category === preference.category && existing.scope === preference.scope) {
          found = true;
          // Merge: preserve created_at and retired_at from existing, update everything else
          const merged: PreferenceEntry = {
            ...existing,
            ...preference,
            created_at: existing.created_at,
            retired_at: existing.retired_at,
            retired_by: existing.retired_by,
            updated_at: preference.updated_at,
          };
          return JSON.stringify(merged);
        }
        return line;
      } catch {
        // Preserve malformed lines as-is (don't lose data)
        return line;
      }
    });

    if (!found) {
      updatedLines.push(JSON.stringify(preference));
    }

    // Write to temp file then rename (atomic on most filesystems)
    writeFileSync(tmpPath, updatedLines.join("\n") + "\n");
    renameSync(tmpPath, filePath);

    return { written: true };
  } catch {
    return { written: false, reason: "error" };
  }
}

// ─── readPreferences ───────────────────────────────────────────────────────

/**
 * Read preference entries from preferences.jsonl with optional scope and status filters.
 *
 * Filters:
 * - scope: filter by correction scope (file, filetype, phase, project, global)
 * - status: 'active' excludes entries with retired_at, 'retired' includes only those
 *
 * Returns [] on missing file, parse errors, or any other error.
 */
export function readPreferences(
  filters?: PreferenceReadFilters,
  options?: PreferenceOptions,
): PreferenceEntry[] {
  try {
    const cwd = options?.cwd ?? process.cwd();
    const filePath = join(cwd, PATTERNS_DIR, PREFERENCES_FILE);

    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      return [];
    }

    let entries: PreferenceEntry[] = content
      .split("\n")
      .filter(l => l.trim() !== "")
      .map(l => {
        try {
          return JSON.parse(l) as PreferenceEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is PreferenceEntry => e !== null);

    // Apply scope filter
    if (filters?.scope) {
      entries = entries.filter(e => e.scope === filters.scope);
    }

    // Apply status filter
    if (filters?.status === "active") {
      entries = entries.filter(e => !e.retired_at);
    } else if (filters?.status === "retired") {
      entries = entries.filter(e => !!e.retired_at);
    }

    return entries;
  } catch {
    return [];
  }
}

// ─── Internal: countMatchingCorrections ────────────────────────────────────

/**
 * Count corrections matching both category and scope across all correction files
 * (active + archives). Also tracks the latest timestamp and correction_to text.
 *
 * Uses readCorrections() from corrections.ts to gather all entries.
 */
function countMatchingCorrections(
  cwd: string,
  category: string,
  scope: string,
): { count: number; latestTs: string | null; latestText: string | null } {
  try {
    const entries = readCorrections(undefined, { cwd });
    let count = 0;
    let latestTs: string | null = null;
    let latestText: string | null = null;

    for (const entry of entries) {
      if (entry.diagnosis_category === category && entry.scope === scope) {
        count++;
        if (!latestTs || entry.timestamp > latestTs) {
          latestTs = entry.timestamp;
          latestText = entry.correction_to;
        }
      }
    }

    return { count, latestTs, latestText };
  } catch {
    return { count: 0, latestTs: null, latestText: null };
  }
}

// ─── Internal: isCaptureDisabled ───────────────────────────────────────────

/**
 * Check if correction capture is disabled via preferences.md kill switch.
 * Matches D016 pattern from corrections.ts.
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

// ─── checkAndPromote ───────────────────────────────────────────────────────

/**
 * Check if a category+scope pattern has met the promotion threshold (≥3 corrections).
 * If so, upsert a preference entry in preferences.jsonl.
 *
 * Validates the input has a valid category and scope. Checks the kill switch.
 * Counts matching corrections. If threshold met, computes confidence and writes.
 *
 * Confidence formula: count / (count + 2)
 *   - 3 corrections → 0.6
 *   - 5 corrections → ~0.714
 *   - 10 corrections → ~0.833
 *
 * Never throws. Returns a structured PromoteResult with reason codes for all
 * failure paths.
 */
export function checkAndPromote(
  entry: PromoteInput,
  options?: PreferenceOptions,
): PromoteResult {
  try {
    const cwd = options?.cwd ?? process.cwd();

    // Validate entry has required fields
    if (
      !entry ||
      typeof entry.category !== "string" ||
      entry.category === "" ||
      typeof entry.scope !== "string" ||
      entry.scope === ""
    ) {
      return { promoted: false, reason: "invalid_entry" };
    }

    // Validate category is in the taxonomy
    if (!VALID_CATEGORIES.has(entry.category)) {
      return { promoted: false, reason: "invalid_entry" };
    }

    // Kill switch check
    if (isCaptureDisabled(cwd)) {
      return { promoted: false, reason: "capture_disabled" as PromoteResult["reason"] };
    }

    // Count matching corrections
    const { count, latestTs, latestText } = countMatchingCorrections(
      cwd,
      entry.category,
      entry.scope,
    );

    if (count < PROMOTION_THRESHOLD) {
      return { promoted: false, reason: "below_threshold", count };
    }

    // Build preference object
    const now = new Date().toISOString();
    const confidence = count / (count + 2);

    const preference: PreferenceEntry = {
      category: entry.category as DiagnosisCategory,
      scope: entry.scope as CorrectionScope,
      preference_text: latestText || "",
      confidence,
      source_count: count,
      last_correction_ts: latestTs || now,
      created_at: now,
      updated_at: now,
      retired_at: null,
      retired_by: null,
    };

    // Write preference
    const writeResult = writePreference(preference, { cwd });
    if (!writeResult.written) {
      return { promoted: false, reason: "error" };
    }

    // Cross-project promotion — non-fatal
    try {
      promoteToUserLevel(
        {
          category: preference.category,
          scope: preference.scope,
          preference_text: preference.preference_text,
          confidence: preference.confidence,
        },
        { projectId: basename(cwd) },
      );
    } catch (_) {
      /* promotion failure must never block preference write success */
    }

    return { promoted: true, count, confidence };
  } catch {
    return { promoted: false, reason: "error" };
  }
}
