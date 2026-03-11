/**
 * GSD Retirement Module — retireByCategory().
 *
 * Marks corrections and preferences matching a diagnosis category as retired
 * after a skill refinement is confirmed. Non-destructive: adds retired_at +
 * retired_by fields without deleting JSONL entries. Updates the matching
 * suggestion status to 'refined'.
 *
 * Processes corrections.jsonl AND all corrections-*.jsonl archive files.
 * Writes atomically using tmp+rename pattern.
 * Never throws — all errors caught silently.
 *
 * Diagnostic surfaces:
 * - Retirement is visible via retired_at/retired_by fields on JSONL entries
 * - Suggestion status change is visible in suggestions.json
 * - Function returns void and silently no-ops on any error
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// ─── Constants ─────────────────────────────────────────────────────────────

const PATTERNS_DIR = ".gsd/patterns";
const ACTIVE_FILE = "corrections.jsonl";
const PREFERENCES_FILE = "preferences.jsonl";
const SUGGESTIONS_FILE = "suggestions.json";

// ─── retireByCategory ──────────────────────────────────────────────────────

/**
 * Marks all active corrections and preferences matching `category` as retired,
 * and updates the matching suggestion in suggestions.json to status 'refined'.
 *
 * Processes corrections.jsonl AND all corrections-*.jsonl archive files.
 * Writes atomically using tmp+rename pattern.
 * Never throws — all errors caught silently.
 *
 * @param category - diagnosis_category value to match (e.g. 'code.style_mismatch')
 * @param suggestionId - ID of the accepted suggestion (written to retired_by)
 * @param options - optional cwd override
 */
export function retireByCategory(
  category: string,
  suggestionId: string,
  options?: { cwd?: string },
): void {
  try {
    const cwd = options?.cwd ?? process.cwd();
    const patternsDir = join(cwd, PATTERNS_DIR);
    const now = new Date().toISOString();

    // --- Retire corrections (active file + all archive files) ---
    const corrFiles: string[] = [ACTIVE_FILE];
    try {
      const dirFiles = readdirSync(patternsDir);
      for (const f of dirFiles) {
        if (f.startsWith("corrections-") && f.endsWith(".jsonl")) {
          corrFiles.push(f);
        }
      }
    } catch {
      // patterns dir missing or unreadable — nothing to retire
      return;
    }

    for (const fileName of corrFiles) {
      retireJsonlFile(
        join(patternsDir, fileName),
        "diagnosis_category",
        category,
        suggestionId,
        now,
      );
    }

    // --- Retire preferences ---
    retireJsonlFile(
      join(patternsDir, PREFERENCES_FILE),
      "category",
      category,
      suggestionId,
      now,
    );

    // --- Update suggestions.json: mark suggestion as refined ---
    updateSuggestionStatus(join(patternsDir, SUGGESTIONS_FILE), suggestionId, now);
  } catch {
    // Non-throwing contract: silently no-op on any error
  }
}

// ─── Internal Helpers ──────────────────────────────────────────────────────

/**
 * Processes a single JSONL file: marks entries where `matchField === matchValue`
 * with retired_at/retired_by. Skips already-retired entries. Preserves malformed
 * lines unchanged. Writes atomically via tmp+rename only if changes were made.
 */
function retireJsonlFile(
  filePath: string,
  matchField: string,
  matchValue: string,
  suggestionId: string,
  now: string,
): void {
  try {
    if (!existsSync(filePath)) return;

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter(l => l.trim() !== "");
    if (lines.length === 0) return;

    let changed = false;
    const updated = lines.map(line => {
      try {
        const entry = JSON.parse(line);
        if (
          entry[matchField] === matchValue &&
          !entry.retired_at
        ) {
          entry.retired_at = now;
          entry.retired_by = suggestionId;
          changed = true;
          return JSON.stringify(entry);
        }
        return line;
      } catch {
        // Malformed line — pass through unchanged
        return line;
      }
    });

    if (changed) {
      const tmpPath = filePath + ".tmp";
      writeFileSync(tmpPath, updated.join("\n") + "\n");
      renameSync(tmpPath, filePath);
    }
  } catch {
    // File missing or unreadable — skip
  }
}

/**
 * Updates suggestion status in suggestions.json. Finds the suggestion with
 * matching id and sets status to 'refined' with refined_at timestamp.
 * Writes atomically via tmp+rename only if changes were made.
 */
function updateSuggestionStatus(
  filePath: string,
  suggestionId: string,
  now: string,
): void {
  try {
    if (!existsSync(filePath)) return;

    const content = readFileSync(filePath, "utf-8");
    const doc = JSON.parse(content);
    if (!doc || !Array.isArray(doc.suggestions)) return;

    let changed = false;
    for (const s of doc.suggestions) {
      if (s.id === suggestionId && s.status !== "refined") {
        s.status = "refined";
        s.refined_at = now;
        changed = true;
      }
    }

    if (changed) {
      const tmpPath = filePath + ".tmp";
      writeFileSync(tmpPath, JSON.stringify(doc, null, 2));
      renameSync(tmpPath, filePath);
    }
  } catch {
    // No suggestions.json or malformed — skip
  }
}
