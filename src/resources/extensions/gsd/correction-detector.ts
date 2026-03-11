/**
 * GSD Correction Detector — Programmatic detection of corrections from session traces
 *
 * Analyzes session data (tool call entries) and produces CorrectionEntry objects
 * for retries, stuck loops, timeout recoveries, and revert patterns.
 *
 * Detection is conservative — prefers false negatives over false positives.
 * A session with 1 error or 1 file rewrite is normal; only clear patterns are flagged.
 *
 * Never throws — returns empty array on any error.
 */

import {
  type CorrectionEntry,
  type DiagnosisCategory,
  isValidEntry,
} from "./correction-types.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Input session shape for the detector. */
export interface DetectionSession {
  session_id: string;
  phase?: string;
  entries: SessionEntry[];
  unit_type?: string;
  unit_id?: string;
}

/** A single session entry — tool call with result. */
export interface SessionEntry {
  type: string;
  tool?: string;
  input?: Record<string, unknown>;
  result?: string;
  timestamp?: string;
}

/** A detected correction — just a CorrectionEntry. */
export type DetectionResult = CorrectionEntry;

// ─── Thresholds (conservative) ────────────────────────────────────────────────

/** Minimum identical command runs to flag as retry. */
const RETRY_THRESHOLD = 3;

/** Minimum oscillating edits on same file to flag as stuck. */
const STUCK_THRESHOLD = 3;

/** Minimum times a file must be written to flag as revert pattern. */
const REVERT_FILE_WRITE_THRESHOLD = 3;

// ─── Entry Builder ────────────────────────────────────────────────────────────

function buildCorrectionEntry(fields: {
  correction_from: string;
  correction_to: string;
  diagnosis_category: DiagnosisCategory;
  diagnosis_text: string;
  session_id: string;
  phase: string;
  unit_type?: string;
  unit_id?: string;
}): CorrectionEntry | null {
  const entry: CorrectionEntry = {
    correction_from: fields.correction_from,
    correction_to: fields.correction_to,
    diagnosis_category: fields.diagnosis_category,
    diagnosis_text: fields.diagnosis_text,
    scope: "project",
    phase: fields.phase,
    timestamp: new Date().toISOString(),
    session_id: fields.session_id,
    source: "programmatic",
    ...(fields.unit_type ? { unit_type: fields.unit_type } : {}),
    ...(fields.unit_id ? { unit_id: fields.unit_id } : {}),
  };

  return isValidEntry(entry) ? entry : null;
}

// ─── Detection Signals ────────────────────────────────────────────────────────

/**
 * Detect retry pattern: same command run multiple times with failures.
 * Threshold: ≥ RETRY_THRESHOLD runs of the same command.
 */
function detectRetries(entries: SessionEntry[], session: DetectionSession): CorrectionEntry[] {
  const results: CorrectionEntry[] = [];

  // Count command executions (bash tool calls)
  const commandCounts = new Map<string, { total: number; failures: number }>();

  for (const entry of entries) {
    if (entry.tool === "bash" && entry.input?.command) {
      const cmd = String(entry.input.command);
      const existing = commandCounts.get(cmd) || { total: 0, failures: 0 };
      existing.total++;
      // Check if result indicates failure
      if (entry.result && /fail|error|exit code [1-9]|FAIL/i.test(entry.result)) {
        existing.failures++;
      }
      commandCounts.set(cmd, existing);
    }
  }

  for (const [cmd, counts] of commandCounts) {
    if (counts.total >= RETRY_THRESHOLD && counts.failures >= 1) {
      const truncatedCmd = cmd.length > 60 ? cmd.slice(0, 60) + "…" : cmd;
      const entry = buildCorrectionEntry({
        correction_from: `Retried command ${counts.total} times: ${truncatedCmd}`,
        correction_to: "Command eventually succeeded or session ended",
        diagnosis_category: "process.implementation_bug",
        diagnosis_text: `Command retried ${counts.total} times with ${counts.failures} failures, indicating trial-and-error debugging rather than targeted fix`,
        session_id: session.session_id,
        phase: session.phase || "executing",
        unit_type: session.unit_type,
        unit_id: session.unit_id,
      });
      if (entry) results.push(entry);
    }
  }

  return results;
}

/**
 * Detect stuck/oscillation pattern: same file edited back and forth.
 * Looks for edits where content oscillates (A→B→A→B pattern).
 */
function detectStuckLoops(entries: SessionEntry[], session: DetectionSession): CorrectionEntry[] {
  const results: CorrectionEntry[] = [];

  // Track edit sequences per file
  const fileEdits = new Map<string, Array<{ oldText?: string; newText?: string; content?: string }>>();

  for (const entry of entries) {
    if ((entry.tool === "edit" || entry.tool === "write") && entry.input?.path) {
      const path = String(entry.input.path);
      const edits = fileEdits.get(path) || [];
      edits.push({
        oldText: entry.input.oldText ? String(entry.input.oldText) : undefined,
        newText: entry.input.newText ? String(entry.input.newText) : undefined,
        content: entry.input.content ? String(entry.input.content) : undefined,
      });
      fileEdits.set(path, edits);
    }
  }

  for (const [filePath, edits] of fileEdits) {
    if (edits.length < STUCK_THRESHOLD) continue;

    // Check for oscillation in edits: A→B→A pattern
    let oscillations = 0;
    for (let i = 2; i < edits.length; i++) {
      const current = edits[i]!;
      const prev = edits[i - 2]!;

      // For edit tool: check if newText matches a previous oldText (reverting)
      if (current.newText && prev.newText && current.newText === prev.newText) {
        oscillations++;
      }
      // For write tool: check if content matches a previous write
      if (current.content && prev.content && current.content === prev.content) {
        oscillations++;
      }
    }

    if (oscillations >= 1) {
      const truncatedPath = filePath.length > 60 ? "…" + filePath.slice(-59) : filePath;
      const entry = buildCorrectionEntry({
        correction_from: `Oscillating edits on ${truncatedPath} (${edits.length} edits, ${oscillations} reversals)`,
        correction_to: "Final state after oscillation",
        diagnosis_category: "code.wrong_pattern",
        diagnosis_text: `File ${truncatedPath} was edited ${edits.length} times with oscillating changes, suggesting stuck loop or trial-and-error approach`,
        session_id: session.session_id,
        phase: session.phase || "executing",
        unit_type: session.unit_type,
        unit_id: session.unit_id,
      });
      if (entry) results.push(entry);
    }
  }

  return results;
}

/**
 * Detect timeout recovery: tool calls that timed out.
 * Looks for timeout indicators in tool results or input.
 */
function detectTimeouts(entries: SessionEntry[], session: DetectionSession): CorrectionEntry[] {
  const results: CorrectionEntry[] = [];

  let timeoutCount = 0;
  const timeoutCommands: string[] = [];

  for (const entry of entries) {
    const hasTimeoutResult = entry.result &&
      /timed?\s*out|timeout|ETIMEDOUT|deadline exceeded/i.test(entry.result);
    const hasTimeoutInput = entry.input?.timeout !== undefined;

    if (hasTimeoutResult) {
      timeoutCount++;
      const cmd = entry.input?.command
        ? String(entry.input.command)
        : (entry.tool || "unknown");
      const truncated = cmd.length > 60 ? cmd.slice(0, 60) + "…" : cmd;
      timeoutCommands.push(truncated);
    }
  }

  if (timeoutCount >= 1) {
    const entry = buildCorrectionEntry({
      correction_from: `Tool call timed out: ${timeoutCommands.slice(0, 3).join(", ")}`,
      correction_to: "Recovered after timeout with retry or alternate approach",
      diagnosis_category: "process.planning_error",
      diagnosis_text: `${timeoutCount} timeout(s) detected in session, indicating incorrect assumptions about execution time or resource availability`,
      session_id: session.session_id,
      phase: session.phase || "executing",
      unit_type: session.unit_type,
      unit_id: session.unit_id,
    });
    if (entry) results.push(entry);
  }

  return results;
}

/**
 * Detect revert pattern: same file written multiple times.
 * Only flags files written ≥ REVERT_FILE_WRITE_THRESHOLD times,
 * since a single rewrite is normal.
 */
function detectReverts(entries: SessionEntry[], session: DetectionSession): CorrectionEntry[] {
  const results: CorrectionEntry[] = [];

  // Count write operations per file
  const writeCounts = new Map<string, number>();

  for (const entry of entries) {
    if ((entry.tool === "write" || entry.tool === "edit") && entry.input?.path) {
      const path = String(entry.input.path);
      writeCounts.set(path, (writeCounts.get(path) || 0) + 1);
    }
  }

  for (const [filePath, count] of writeCounts) {
    if (count >= REVERT_FILE_WRITE_THRESHOLD) {
      const truncatedPath = filePath.length > 60 ? "…" + filePath.slice(-59) : filePath;
      const entry = buildCorrectionEntry({
        correction_from: `File ${truncatedPath} rewritten ${count} times`,
        correction_to: "Final version after multiple rewrites",
        diagnosis_category: "code.wrong_pattern",
        diagnosis_text: `File rewritten ${count} times suggesting revert or uncertainty about correct implementation`,
        session_id: session.session_id,
        phase: session.phase || "executing",
        unit_type: session.unit_type,
        unit_id: session.unit_id,
      });
      if (entry) results.push(entry);
    }
  }

  return results;
}

// ─── Main Detection Function ──────────────────────────────────────────────────

/**
 * Detect corrections from a session's tool call entries.
 *
 * Analyzes the entries for retry patterns, stuck loops, timeout recoveries,
 * and revert patterns. Returns well-formed CorrectionEntry objects for each
 * detected signal.
 *
 * Never throws — returns empty array on any error.
 *
 * @param session - Session data with entries, session_id, and optional metadata
 * @returns Array of detected CorrectionEntry objects (all pass isValidEntry())
 */
export function detectCorrections(session: DetectionSession): CorrectionEntry[] {
  try {
    if (!session || !Array.isArray(session.entries) || session.entries.length === 0) {
      return [];
    }

    const entries = session.entries;
    const corrections: CorrectionEntry[] = [];

    // Run all detection signals
    corrections.push(...detectRetries(entries, session));
    corrections.push(...detectStuckLoops(entries, session));
    corrections.push(...detectTimeouts(entries, session));
    corrections.push(...detectReverts(entries, session));

    // Final validation — only return entries that pass isValidEntry()
    return corrections.filter(entry => isValidEntry(entry));
  } catch {
    // Never throw — conservative detection
    return [];
  }
}
