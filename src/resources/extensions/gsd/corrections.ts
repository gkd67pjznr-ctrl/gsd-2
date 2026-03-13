/**
 * GSD Corrections I/O — Write, Read, Rotate for correction JSONL files.
 *
 * Persistence layer for the correction capture system. Entries are validated,
 * truncated, and appended to .gsd/patterns/corrections.jsonl. When the active
 * file exceeds a threshold, it is rotated to a dated archive. Archive files
 * older than the retention window are cleaned up.
 *
 * All I/O is non-fatal — errors are caught and returned as structured results,
 * never thrown. This module must never break the calling code path.
 *
 * Diagnostic surfaces:
 * - WriteResult.reason tells callers exactly why a write failed
 * - readCorrections() returns [] on any error (safe default)
 * - rotateCorrections() is silent on all errors
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CorrectionEntry } from "./correction-types.ts";
import { isValidEntry } from "./correction-types.ts";
import { rotateVectorIndex } from "./vector-index.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WriteResult {
  written: boolean;
  reason?: "invalid_entry" | "capture_disabled" | "error";
}

export interface WriteOptions {
  cwd?: string;
  maxEntries?: number;
  retentionDays?: number;
}

export interface ReadFilters {
  status?: "active" | "retired";
}

export interface ReadOptions {
  cwd?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const ACTIVE_FILE = "corrections.jsonl";
const PATTERNS_DIR = ".gsd/patterns";
const DEFAULT_MAX_ENTRIES = 1000;
const DEFAULT_RETENTION_DAYS = 90;
const VALID_QUALITY_LEVELS = new Set(["fast", "standard", "strict"]);
const FIELD_MAX_LENGTH = 200;

// ─── Write ─────────────────────────────────────────────────────────────────

/**
 * Validate, truncate, and append a correction entry to corrections.jsonl.
 *
 * Never throws. Returns a structured WriteResult indicating success or
 * the specific reason for failure.
 *
 * Steps:
 * 1. Check kill switch (correction_capture preference)
 * 2. Validate via isValidEntry()
 * 3. Truncate correction_from/correction_to to 200 chars
 * 4. Strip invalid quality_level
 * 5. Create .gsd/patterns/ directory if needed
 * 6. Check line count — rotate if at threshold
 * 7. Append JSON line
 */
export function writeCorrection(entry: unknown, options?: WriteOptions): WriteResult {
  try {
    const cwd = options?.cwd ?? process.cwd();
    const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    const retentionDays = options?.retentionDays ?? DEFAULT_RETENTION_DAYS;

    // Kill switch: check correction_capture preference from project or global prefs
    if (isCaptureDisabled(cwd)) {
      return { written: false, reason: "capture_disabled" };
    }

    // Validate
    if (!isValidEntry(entry)) {
      return { written: false, reason: "invalid_entry" };
    }

    // Create a shallow copy to avoid mutating the caller's object
    const safeEntry = { ...entry };

    // Truncate long fields
    if (safeEntry.correction_from.length > FIELD_MAX_LENGTH) {
      safeEntry.correction_from = safeEntry.correction_from.slice(0, FIELD_MAX_LENGTH);
    }
    if (safeEntry.correction_to.length > FIELD_MAX_LENGTH) {
      safeEntry.correction_to = safeEntry.correction_to.slice(0, FIELD_MAX_LENGTH);
    }

    // Strip invalid quality_level
    if (
      safeEntry.quality_level !== undefined &&
      !VALID_QUALITY_LEVELS.has(safeEntry.quality_level as string)
    ) {
      delete (safeEntry as Record<string, unknown>).quality_level;
    }

    // Ensure patterns directory exists
    const patternsDir = join(cwd, PATTERNS_DIR);
    mkdirSync(patternsDir, { recursive: true });

    const filePath = join(patternsDir, ACTIVE_FILE);

    // Check line count for rotation
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf-8");
      const lineCount = content.split("\n").filter(l => l.trim() !== "").length;
      if (lineCount >= maxEntries) {
        rotateCorrections({ cwd, threshold: 0, retentionDays });
      }
    }

    // Append
    appendFileSync(filePath, JSON.stringify(safeEntry) + "\n");

    return { written: true };
  } catch {
    return { written: false, reason: "error" };
  }
}

// ─── Read ──────────────────────────────────────────────────────────────────

/**
 * Read correction entries from the active file and all archive files.
 *
 * Applies optional status filter:
 * - 'active': exclude entries where retired_at is truthy
 * - 'retired': include only entries where retired_at is truthy
 * - undefined: return all entries
 *
 * Returns entries sorted by timestamp descending (most recent first).
 * Returns empty array on any error.
 */
export function readCorrections(filters?: ReadFilters, options?: ReadOptions): CorrectionEntry[] {
  try {
    const cwd = options?.cwd ?? process.cwd();
    const patternsDir = join(cwd, PATTERNS_DIR);

    // Gather all correction files: active + archives
    const files: string[] = [];

    // Always try the active file
    files.push(ACTIVE_FILE);

    // Find archive files
    try {
      const dirFiles = readdirSync(patternsDir);
      for (const f of dirFiles) {
        if (f.startsWith("corrections-") && f.endsWith(".jsonl")) {
          files.push(f);
        }
      }
    } catch {
      // No archive files or patternsDir missing — proceed with just active file
    }

    let entries: CorrectionEntry[] = [];

    for (const file of files) {
      try {
        const content = readFileSync(join(patternsDir, file), "utf-8");
        const lines = content.split("\n").filter(l => l.trim() !== "");
        for (const line of lines) {
          try {
            entries.push(JSON.parse(line) as CorrectionEntry);
          } catch {
            // Skip malformed lines
          }
        }
      } catch {
        // Skip unreadable files silently
      }
    }

    // Apply status filter
    if (filters?.status === "active") {
      entries = entries.filter(e => !e.retired_at);
    } else if (filters?.status === "retired") {
      entries = entries.filter(e => !!e.retired_at);
    }

    // Sort by timestamp descending (most recent first)
    entries.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

    return entries;
  } catch {
    return [];
  }
}

// ─── Rotate ────────────────────────────────────────────────────────────────

/**
 * Rotate the active corrections file to a dated archive if it exceeds the threshold.
 * Then clean up archive files older than retentionDays.
 *
 * Archive naming: corrections-YYYY-MM-DD.jsonl, with -N suffix for same-day collisions.
 *
 * Silent on all errors — rotation must never break callers.
 */
export function rotateCorrections(options?: {
  cwd?: string;
  threshold?: number;
  retentionDays?: number;
}): void {
  try {
    const cwd = options?.cwd ?? process.cwd();
    const threshold = options?.threshold ?? DEFAULT_MAX_ENTRIES;
    const retentionDays = options?.retentionDays ?? DEFAULT_RETENTION_DAYS;

    const patternsDir = join(cwd, PATTERNS_DIR);
    const filePath = join(patternsDir, ACTIVE_FILE);

    if (!existsSync(filePath)) return;

    // Check line count
    const content = readFileSync(filePath, "utf-8");
    const lineCount = content.split("\n").filter(l => l.trim() !== "").length;

    if (lineCount >= threshold) {
      // Rename to dated archive
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
      let archiveName = `corrections-${dateStr}.jsonl`;
      let archivePath = join(patternsDir, archiveName);

      // Handle same-day collisions
      let seq = 1;
      while (existsSync(archivePath)) {
        archiveName = `corrections-${dateStr}-${seq}.jsonl`;
        archivePath = join(patternsDir, archiveName);
        seq++;
      }

      renameSync(filePath, archivePath);

      // Rotate vector index alongside JSONL — fire-and-forget (async, silent on errors)
      const vectorPath = join(patternsDir, 'vectors');
      rotateVectorIndex(vectorPath).catch(() => {/* silent per D013 */});
    }

    // Clean up old archives
    cleanupArchives(patternsDir, retentionDays);
  } catch {
    // Silent on all errors
  }
}

// ─── Internal Helpers ──────────────────────────────────────────────────────

/**
 * Check if correction capture is disabled via preferences.
 *
 * Reads the correction_capture field from project preferences (.gsd/preferences.md
 * relative to cwd) or global preferences (~/.gsd/preferences.md). Returns true
 * only if the field is explicitly set to false.
 *
 * Silent on all errors — defaults to capture enabled.
 */
function isCaptureDisabled(cwd: string): boolean {
  try {
    // Check project preferences first, then global
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
        // Simple check: look for correction_capture: false in frontmatter
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

/**
 * Delete archive files older than retentionDays based on file mtime.
 * Silent on all errors.
 */
function cleanupArchives(patternsDir: string, retentionDays: number): void {
  try {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const files = readdirSync(patternsDir);
    for (const file of files) {
      if (!file.startsWith("corrections-") || !file.endsWith(".jsonl")) continue;
      const filePath = join(patternsDir, file);
      try {
        const stat = statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          unlinkSync(filePath);
        }
      } catch {
        // Silent on individual file errors
      }
    }
  } catch {
    // Silent on directory read errors
  }
}
