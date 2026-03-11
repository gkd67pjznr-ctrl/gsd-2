/**
 * GSD Tech Debt Register — Log, List, Resolve structured tech debt entries.
 *
 * Persistence layer for the tech debt tracking system. Entries are written as
 * structured markdown sections in `.gsd/TECH-DEBT.md` with sequential TD-NNN IDs.
 * The file is designed to be human-readable and browsable during planning.
 *
 * All I/O is non-fatal — errors are caught and returned as structured results,
 * never thrown. This module must never break the calling code path.
 *
 * Diagnostic surfaces:
 * - WriteResult.reason tells callers exactly why a write failed
 * - listDebt() returns [] on any error (safe default)
 * - resolveDebt() returns WriteResult with reason on failure
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// ─── Types ─────────────────────────────────────────────────────────────────

export type DebtType = "bug" | "design" | "test-gap" | "doc-gap";

export type DebtSeverity = "critical" | "high" | "medium" | "low";

export type DebtStatus = "open" | "resolved" | "deferred";

export interface TechDebtEntry {
  id: string;
  title: string;
  type: DebtType;
  severity: DebtSeverity;
  component: string;
  status: DebtStatus;
  logged: string;         // provenance string, e.g. "M001/S05/T01"
  description: string;
  resolved?: string;      // optional date string, e.g. "2026-03-12"
  resolution?: string;    // optional resolution context
}

export interface WriteResult {
  written: boolean;
  reason?: "invalid_entry" | "error";
}

export interface LogDebtInput {
  title: string;
  type: DebtType;
  severity: DebtSeverity;
  component: string;
  logged: string;
  description: string;
}

export interface DebtFilters {
  status?: DebtStatus;
}

export interface DebtOptions {
  cwd?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const TECH_DEBT_FILE = ".gsd/TECH-DEBT.md";
const FILE_HEADER = "# Tech Debt Register\n";

const VALID_TYPES = new Set<string>(["bug", "design", "test-gap", "doc-gap"]);
const VALID_SEVERITIES = new Set<string>(["critical", "high", "medium", "low"]);

// ─── logDebt ───────────────────────────────────────────────────────────────

/**
 * Log a new tech debt entry to `.gsd/TECH-DEBT.md`.
 *
 * Reads the existing file (if any) to determine the next sequential TD-NNN ID,
 * then appends a structured markdown section. Creates the file with a header
 * if it doesn't exist.
 *
 * Never throws. Returns a structured WriteResult.
 */
export function logDebt(entry: LogDebtInput, options?: DebtOptions): WriteResult {
  try {
    // Validate required fields
    if (
      !entry ||
      typeof entry.title !== "string" || entry.title.trim() === "" ||
      typeof entry.type !== "string" || !VALID_TYPES.has(entry.type) ||
      typeof entry.severity !== "string" || !VALID_SEVERITIES.has(entry.severity) ||
      typeof entry.component !== "string" || entry.component.trim() === "" ||
      typeof entry.logged !== "string" || entry.logged.trim() === "" ||
      typeof entry.description !== "string" || entry.description.trim() === ""
    ) {
      return { written: false, reason: "invalid_entry" };
    }

    const cwd = options?.cwd ?? process.cwd();
    const filePath = join(cwd, TECH_DEBT_FILE);

    // Ensure .gsd/ directory exists
    mkdirSync(join(cwd, ".gsd"), { recursive: true });

    // Read existing content or start fresh
    let content = "";
    if (existsSync(filePath)) {
      content = readFileSync(filePath, "utf-8");
    }

    // Determine next ID
    const nextId = nextDebtId(content);

    // Build new entry section
    const section = formatEntry({
      id: nextId,
      title: entry.title,
      type: entry.type,
      severity: entry.severity,
      component: entry.component,
      status: "open",
      logged: entry.logged,
      description: entry.description,
    });

    // Write file
    if (content === "") {
      // New file: header + entry
      writeFileSync(filePath, FILE_HEADER + "\n" + section);
    } else {
      // Append to existing file
      const separator = content.endsWith("\n") ? "\n" : "\n\n";
      writeFileSync(filePath, content + separator + section);
    }

    return { written: true };
  } catch {
    return { written: false, reason: "error" };
  }
}

// ─── listDebt ──────────────────────────────────────────────────────────────

/**
 * Read and parse tech debt entries from `.gsd/TECH-DEBT.md`.
 *
 * Uses lenient regex parsing — handles missing fields, extra whitespace,
 * and inconsistent formatting. Malformed entries are skipped gracefully.
 *
 * Returns empty array on any error.
 */
export function listDebt(filters?: DebtFilters, options?: DebtOptions): TechDebtEntry[] {
  try {
    const cwd = options?.cwd ?? process.cwd();
    const filePath = join(cwd, TECH_DEBT_FILE);

    if (!existsSync(filePath)) {
      return [];
    }

    const content = readFileSync(filePath, "utf-8");
    let entries = parseEntries(content);

    // Apply status filter
    if (filters?.status) {
      entries = entries.filter(e => e.status === filters.status);
    }

    return entries;
  } catch {
    return [];
  }
}

// ─── resolveDebt ───────────────────────────────────────────────────────────

/**
 * Resolve a tech debt entry by TD-NNN ID.
 *
 * Updates the entry's status from any state to `resolved`, adds a resolved
 * date, and optionally adds resolution context.
 *
 * Never throws. Returns a structured WriteResult.
 */
export function resolveDebt(
  id: string,
  resolvedInfo?: { date?: string; resolution?: string },
  options?: DebtOptions,
): WriteResult {
  try {
    if (!id || typeof id !== "string" || !/^TD-\d{3,}$/.test(id)) {
      return { written: false, reason: "invalid_entry" };
    }

    const cwd = options?.cwd ?? process.cwd();
    const filePath = join(cwd, TECH_DEBT_FILE);

    if (!existsSync(filePath)) {
      return { written: false, reason: "error" };
    }

    const content = readFileSync(filePath, "utf-8");

    // Find the entry section by ID — split into sections and find the right one
    const sections = content.split(/(?=^## TD-\d{3,}:)/m);
    const sectionIndex = sections.findIndex(s =>
      new RegExp(`^## ${escapeRegex(id)}:`, "m").test(s),
    );

    if (sectionIndex === -1) {
      return { written: false, reason: "error" };
    }

    let section = sections[sectionIndex];
    const resolvedDate = resolvedInfo?.date ?? new Date().toISOString().slice(0, 10);

    // Update status
    section = section.replace(
      /^- \*\*Status:\*\*\s*.+$/m,
      `- **Status:** resolved`,
    );

    // Add or update resolved date
    if (/^- \*\*Resolved:\*\*/m.test(section)) {
      section = section.replace(
        /^- \*\*Resolved:\*\*\s*.+$/m,
        `- **Resolved:** ${resolvedDate}`,
      );
    } else {
      // Insert resolved line after status
      section = section.replace(
        /^(- \*\*Status:\*\*\s*.+)$/m,
        `$1\n- **Resolved:** ${resolvedDate}`,
      );
    }

    // Add resolution context if provided
    if (resolvedInfo?.resolution) {
      if (/^- \*\*Resolution:\*\*/m.test(section)) {
        section = section.replace(
          /^- \*\*Resolution:\*\*\s*.+$/m,
          `- **Resolution:** ${resolvedInfo.resolution}`,
        );
      } else {
        // Insert after resolved line
        section = section.replace(
          /^(- \*\*Resolved:\*\*\s*.+)$/m,
          `$1\n- **Resolution:** ${resolvedInfo.resolution}`,
        );
      }
    }

    // Replace the section in content
    sections[sectionIndex] = section;
    const updatedContent = sections.join("");
    writeFileSync(filePath, updatedContent);

    return { written: true };
  } catch {
    return { written: false, reason: "error" };
  }
}

// ─── nextDebtId ────────────────────────────────────────────────────────────

/**
 * Parse existing TECH-DEBT.md content to find the next sequential TD-NNN ID.
 *
 * Handles gaps — uses max existing ID + 1, not count + 1.
 * If no entries exist, returns "TD-001".
 */
export function nextDebtId(content: string): string {
  const idPattern = /## TD-(\d{3,}):/g;
  let maxId = 0;
  let match: RegExpExecArray | null;

  while ((match = idPattern.exec(content)) !== null) {
    const num = parseInt(match[1], 10);
    if (num > maxId) {
      maxId = num;
    }
  }

  const nextNum = maxId + 1;
  return `TD-${String(nextNum).padStart(3, "0")}`;
}

// ─── Internal Helpers ──────────────────────────────────────────────────────

/**
 * Format a TechDebtEntry as a structured markdown section.
 */
function formatEntry(entry: TechDebtEntry): string {
  let section = `## ${entry.id}: ${entry.title}\n`;
  section += `- **Type:** ${entry.type}\n`;
  section += `- **Severity:** ${entry.severity}\n`;
  section += `- **Component:** ${entry.component}\n`;
  section += `- **Status:** ${entry.status}\n`;
  section += `- **Logged:** ${entry.logged}\n`;
  if (entry.resolved) {
    section += `- **Resolved:** ${entry.resolved}\n`;
  }
  if (entry.resolution) {
    section += `- **Resolution:** ${entry.resolution}\n`;
  }
  section += `- **Description:** ${entry.description}\n`;
  return section;
}

/**
 * Parse TECH-DEBT.md content into TechDebtEntry array.
 *
 * Lenient parsing: handles missing fields, extra whitespace, inconsistent
 * formatting. Entries that can't be parsed at all are skipped.
 */
function parseEntries(content: string): TechDebtEntry[] {
  const entries: TechDebtEntry[] = [];

  // Split on entry headings (## TD-NNN: ...)
  const sections = content.split(/(?=^## TD-\d{3,}:)/m);

  for (const section of sections) {
    // Must start with an entry heading
    const headerMatch = section.match(/^## (TD-\d{3,}):\s*(.+)/m);
    if (!headerMatch) continue;

    const id = headerMatch[1];
    const title = headerMatch[2].trim();

    // Extract fields leniently — missing fields get defaults
    const type = extractField(section, "Type") as DebtType | null;
    const severity = extractField(section, "Severity") as DebtSeverity | null;
    const component = extractField(section, "Component");
    const status = extractField(section, "Status") as DebtStatus | null;
    const logged = extractField(section, "Logged");
    const description = extractField(section, "Description");
    const resolved = extractField(section, "Resolved");
    const resolution = extractField(section, "Resolution");

    // Require at minimum: id and title. Everything else gets defaults.
    const entry: TechDebtEntry = {
      id,
      title,
      type: type && VALID_TYPES.has(type) ? type : "bug",
      severity: severity && VALID_SEVERITIES.has(severity) ? severity : "medium",
      component: component || "unknown",
      status: status && isValidStatus(status) ? status : "open",
      logged: logged || "unknown",
      description: description || "",
    };

    if (resolved) {
      entry.resolved = resolved;
    }
    if (resolution) {
      entry.resolution = resolution;
    }

    entries.push(entry);
  }

  return entries;
}

/**
 * Extract a markdown field value leniently.
 * Handles: `- **Field:** value`, `- **Field**: value`, `- **Field** value`, extra whitespace.
 */
function extractField(section: string, fieldName: string): string | null {
  // Try standard format: - **Field:** value
  const pattern = new RegExp(
    `^-\\s*\\*\\*${escapeRegex(fieldName)}:?\\*\\*:?\\s*(.+)$`,
    "mi",
  );
  const match = section.match(pattern);
  if (match) {
    return match[1].trim();
  }
  return null;
}

function isValidStatus(s: string): s is DebtStatus {
  return s === "open" || s === "resolved" || s === "deferred";
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
