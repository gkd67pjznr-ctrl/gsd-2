/**
 * GSD Cross-Project Preference Promotion — promoteToUserLevel(), readUserPreferences().
 *
 * Tracks which projects contribute the same category+scope preference pattern.
 * When 3+ distinct projects contribute, the preference is promoted (promoted_at set)
 * to the user-level preferences.json in ~/.gsd/ (or GSD_HOME).
 *
 * All I/O is non-fatal — errors are caught and returned as structured results,
 * never thrown. This module must never break the calling code path.
 *
 * Diagnostic surfaces:
 * - PromoteToUserResult.reason tells callers exactly why promotion didn't happen
 * - PromoteToUserResult.projectCount shows current cross-project count
 * - readUserPreferences() returns safe default on any error
 * - ~/.gsd/preferences.json is a human-readable inspection surface
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── Types ─────────────────────────────────────────────────────────────────

/** Result from promoteToUserLevel(). Always returned — never throws. */
export interface PromoteToUserResult {
  /** Whether the preference reached promotion threshold (3+ projects) */
  promoted: boolean;
  /** Current number of distinct projects contributing this pattern */
  projectCount?: number;
  /** Reason for non-promotion or error */
  reason?: "missing_fields" | "error";
}

/** A single entry in the user-level preferences.json */
export interface UserPreferenceEntry {
  category: string;
  scope: string;
  preference_text: string;
  confidence: number;
  source_projects: string[];
  promoted_at: string | null;
  updated_at: string;
}

/** The full user-level preferences.json document */
export interface UserPreferencesDocument {
  version: string;
  preferences: UserPreferenceEntry[];
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PREFERENCES_FILE = "preferences.json";
const PROMOTION_THRESHOLD = 3;

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Resolve the GSD home directory. Supports GSD_HOME env var for testability. */
function getGsdHome(): string {
  return process.env.GSD_HOME || join(homedir(), ".gsd");
}

// ─── readUserPreferences ───────────────────────────────────────────────────

/**
 * Reads ~/.gsd/preferences.json (or GSD_HOME/preferences.json).
 * Returns { version: '1.0', preferences: [] } if the file is missing,
 * unreadable, or malformed.
 */
export function readUserPreferences(): UserPreferencesDocument {
  const filePath = join(getGsdHome(), PREFERENCES_FILE);
  try {
    const raw = readFileSync(filePath, "utf-8");
    const doc = JSON.parse(raw);
    return doc && Array.isArray(doc.preferences)
      ? doc
      : { version: "1.0", preferences: [] };
  } catch {
    return { version: "1.0", preferences: [] };
  }
}

// ─── writeUserPreferences ──────────────────────────────────────────────────

/**
 * Writes preferences doc to ~/.gsd/preferences.json atomically via tmp+rename.
 * Creates the GSD home directory if it does not exist.
 */
function writeUserPreferences(doc: UserPreferencesDocument): void {
  const gsdHome = getGsdHome();
  mkdirSync(gsdHome, { recursive: true });
  const filePath = join(gsdHome, PREFERENCES_FILE);
  const tmpPath = filePath + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(doc, null, 2) + "\n");
  renameSync(tmpPath, filePath);
}

// ─── promoteToUserLevel ────────────────────────────────────────────────────

/**
 * Tracks cross-project preference contributions and promotes when 3+ distinct
 * projects contribute the same category+scope pattern.
 *
 * - First call for a category+scope creates a new entry with the projectId
 * - Subsequent calls add the projectId to source_projects (deduped)
 * - Confidence always takes max(existing, incoming)
 * - promoted_at is set exactly once when source_projects.length reaches 3
 * - Already-promoted entries are not re-timestamped (idempotent)
 *
 * Never throws. Returns structured PromoteToUserResult.
 *
 * @param preference - { category, scope, preference_text, confidence }
 * @param options - { projectId } identifying the contributing project
 */
export function promoteToUserLevel(
  preference: {
    category: string;
    scope: string;
    preference_text: string;
    confidence: number;
  },
  options?: { projectId?: string },
): PromoteToUserResult {
  try {
    const projectId = options?.projectId;

    // Validate required fields
    if (!projectId || !preference?.category || !preference?.scope) {
      return { promoted: false, reason: "missing_fields" };
    }

    const doc = readUserPreferences();
    const now = new Date().toISOString();

    // Find existing entry by category+scope
    let entry = doc.preferences.find(
      (p) => p.category === preference.category && p.scope === preference.scope,
    );

    if (!entry) {
      // Create new entry
      entry = {
        category: preference.category,
        scope: preference.scope,
        preference_text: preference.preference_text || "",
        confidence: preference.confidence || 0.5,
        source_projects: [projectId],
        promoted_at: null,
        updated_at: now,
      };
      doc.preferences.push(entry);
    } else {
      // Upsert: add project, take max confidence, update text
      if (!entry.source_projects.includes(projectId)) {
        entry.source_projects.push(projectId);
      }
      entry.preference_text = preference.preference_text || entry.preference_text;
      entry.confidence = Math.max(entry.confidence || 0, preference.confidence || 0);
      entry.updated_at = now;
    }

    // Promote when 3+ distinct projects contribute — set promoted_at only once
    if (entry.source_projects.length >= PROMOTION_THRESHOLD && !entry.promoted_at) {
      entry.promoted_at = now;
    }

    writeUserPreferences(doc);

    return {
      promoted: entry.source_projects.length >= PROMOTION_THRESHOLD,
      projectCount: entry.source_projects.length,
    };
  } catch {
    return { promoted: false, reason: "error" };
  }
}
