/**
 * GSD Observer Engine — analyzePatterns for skill refinement suggestions.
 *
 * Aggregates corrections cross-scope, enforces bounded learning guardrails,
 * and writes skill refinement suggestions. The observer reads corrections,
 * deduplicates against active preferences and a watermark, groups by category
 * (not scope), enforces guardrails, generates suggestions with skill mapping,
 * and auto-dismisses expired suggestions.
 *
 * All I/O is non-fatal — errors are caught and returned as structured results,
 * never thrown. This module must never break the calling code path.
 *
 * Diagnostic surfaces:
 * - AnalyzeResult.suggestions_written tells callers how many suggestions were created
 * - suggestions.json metadata.skipped_suggestions records guardrail-blocked suggestions
 * - suggestions.json metadata.last_analyzed_at tracks watermark for dedup
 * - Dismissed suggestions retain dismiss_reason for inspection
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
import { readCorrections } from "./corrections.ts";
import { readPreferences } from "./pattern-preferences.ts";
import type { CorrectionEntry } from "./correction-types.ts";
import type { DiagnosisCategory } from "./correction-types.ts";
import type {
  AnalyzeResult,
  SkippedSuggestion,
  SuggestionEntry,
  SuggestionsDocument,
} from "./preference-types.ts";

// ─── Constants ─────────────────────────────────────────────────────────────

const PATTERNS_DIR = ".gsd/patterns";
const SUGGESTIONS_FILE = "suggestions.json";

/** Default config values for analysis */
const DEFAULT_CONFIG = {
  minOccurrences: 3,
  cooldownDays: 7,
  autoDismissAfterDays: 30,
} as const;

/**
 * Maps correction categories to gsd2 skill names.
 * null = no matching skill → produces 'new_skill_needed' suggestion type.
 */
const CATEGORY_SKILL_MAP: Record<string, string | null> = {
  "code.wrong_pattern": null,
  "code.missing_context": null,
  "code.stale_knowledge": null,
  "code.over_engineering": null,
  "code.under_engineering": null,
  "code.style_mismatch": "frontend-design",
  "code.scope_drift": null,
  "process.planning_error": null,
  "process.research_gap": null,
  "process.implementation_bug": "debug-like-expert",
  "process.integration_miss": null,
  "process.convention_violation": null,
  "process.requirement_misread": null,
  "process.regression": "debug-like-expert",
};

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AnalyzeOptions {
  cwd?: string;
  minOccurrences?: number;
  cooldownDays?: number;
  autoDismissAfterDays?: number;
}

interface GuardrailResult {
  pass: boolean;
  reason?: string;
  cooldown_expires?: string;
}

interface CorrectionGroup {
  category: string;
  scopes: Set<string>;
  corrections: CorrectionEntry[];
}

// ─── analyzePatterns (main export) ─────────────────────────────────────────

/**
 * Analyze correction patterns and generate skill refinement suggestions.
 *
 * Steps:
 * 1. Load config, ensure patterns dir exists
 * 2. Load or create suggestions.json
 * 3. Auto-dismiss expired pending suggestions
 * 4. Read corrections and active preferences
 * 5. Filter corrections by watermark and active-preference dedup
 * 6. Group remaining corrections by category (cross-scope)
 * 7. For each group at threshold, enforce guardrails and generate suggestions
 * 8. Update watermark, write suggestions.json atomically
 *
 * Never throws. Returns AnalyzeResult.
 */
export function analyzePatterns(options?: AnalyzeOptions): AnalyzeResult {
  try {
    const cwd = options?.cwd ?? process.cwd();
    const minOccurrences = options?.minOccurrences ?? DEFAULT_CONFIG.minOccurrences;
    const cooldownDays = options?.cooldownDays ?? DEFAULT_CONFIG.cooldownDays;
    const autoDismissAfterDays = options?.autoDismissAfterDays ?? DEFAULT_CONFIG.autoDismissAfterDays;

    // Ensure patterns directory exists
    const patternsDir = join(cwd, PATTERNS_DIR);
    mkdirSync(patternsDir, { recursive: true });

    // Load existing suggestions document or create fresh
    const suggestionsPath = join(patternsDir, SUGGESTIONS_FILE);
    let doc = loadSuggestionsDoc(suggestionsPath);

    // Read watermark
    const watermark = doc.metadata.last_analyzed_at;

    // Auto-dismiss expired pending suggestions
    autoDismissExpired(doc, autoDismissAfterDays);

    // Read all active corrections
    const corrections = readCorrections({ status: "active" }, { cwd });

    // Read active preferences for dedup
    const preferences = readPreferences({ status: "active" }, { cwd });

    // Build dedup set from active preferences (category:scope pairs)
    const prefDedupSet = new Set<string>();
    for (const pref of preferences) {
      prefDedupSet.add(`${pref.category}:${pref.scope}`);
    }

    // Filter corrections: remove promoted (category:scope in dedup set) and pre-watermark
    const filtered = corrections.filter(c => {
      // Remove corrections whose category:scope already has an active preference
      if (prefDedupSet.has(`${c.diagnosis_category}:${c.scope}`)) {
        return false;
      }
      // Remove corrections at or before watermark
      if (watermark && c.timestamp <= watermark) {
        return false;
      }
      return true;
    });

    // Group remaining by category (cross-scope)
    const groups = groupByCategory(filtered);

    // Generate suggestions for groups at or above threshold
    let suggestionsWritten = 0;
    const existingIds = new Set(doc.suggestions.map(s => s.id));

    for (const group of groups.values()) {
      if (group.corrections.length < minOccurrences) {
        continue;
      }

      const category = group.category;

      // Check no-duplicate-pending: skip if pending suggestion for same category exists
      const hasPending = doc.suggestions.some(
        s => s.category === category && s.status === "pending",
      );
      if (hasPending) {
        continue;
      }

      // Map category to target skill
      const targetSkill = CATEGORY_SKILL_MAP[category] ?? null;

      // Check cooldown guardrail
      const guardrail = checkGuardrails(category, targetSkill, doc, cooldownDays);
      if (!guardrail.pass) {
        // Record in skipped_suggestions
        const skipped: SkippedSuggestion = {
          category: category as DiagnosisCategory,
          target_skill: targetSkill,
          reason: guardrail.reason || "cooldown_active",
          skipped_at: new Date().toISOString(),
        };
        if (guardrail.cooldown_expires) {
          skipped.cooldown_expires = guardrail.cooldown_expires;
        }
        doc.metadata.skipped_suggestions.push(skipped);
        continue;
      }

      // Determine suggestion type based on skill existence
      const suggestionType = determineSuggestionType(targetSkill);

      // Build scope summary
      const scopeSummary = buildScopeSummary(group.scopes);

      // Sample corrections (up to 3)
      const sampleCorrections = group.corrections
        .slice(0, 3)
        .map(c => c.correction_to || c.correction_from);

      // Generate unique ID
      const id = generateSuggestionId(existingIds);
      existingIds.add(id);

      const suggestion: SuggestionEntry = {
        id,
        type: suggestionType,
        target_skill: targetSkill,
        category: category as DiagnosisCategory,
        scope_summary: scopeSummary,
        correction_count: group.corrections.length,
        sample_corrections: sampleCorrections,
        status: "pending",
        created_at: new Date().toISOString(),
        accepted_at: null,
        dismissed_at: null,
        dismiss_reason: null,
        refined_at: null,
      };

      doc.suggestions.push(suggestion);
      suggestionsWritten++;
    }

    // Update watermark to current time
    doc.metadata.last_analyzed_at = new Date().toISOString();

    // Write suggestions.json atomically (tmp+rename)
    const tmpPath = suggestionsPath + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(doc, null, 2) + "\n");
    renameSync(tmpPath, suggestionsPath);

    return { analyzed: true, suggestions_written: suggestionsWritten };
  } catch {
    return { analyzed: false, reason: "error" };
  }
}

// ─── Internal Helpers ──────────────────────────────────────────────────────

/**
 * Load suggestions.json from disk, or return a fresh document if missing/invalid.
 */
function loadSuggestionsDoc(filePath: string): SuggestionsDocument {
  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf-8");
      const doc = JSON.parse(content) as SuggestionsDocument;
      // Ensure required structure
      if (!doc.metadata) {
        doc.metadata = { last_analyzed_at: null, version: 1, skipped_suggestions: [] };
      }
      if (!Array.isArray(doc.metadata.skipped_suggestions)) {
        doc.metadata.skipped_suggestions = [];
      }
      if (!Array.isArray(doc.suggestions)) {
        doc.suggestions = [];
      }
      return doc;
    }
  } catch {
    // Fall through to fresh document
  }

  return {
    metadata: {
      last_analyzed_at: null,
      version: 1,
      skipped_suggestions: [],
    },
    suggestions: [],
  };
}

/**
 * Auto-dismiss pending suggestions older than autoDismissAfterDays.
 * Mutates the document in place.
 */
function autoDismissExpired(doc: SuggestionsDocument, autoDismissAfterDays: number): void {
  const cutoff = Date.now() - autoDismissAfterDays * 24 * 60 * 60 * 1000;

  for (const suggestion of doc.suggestions) {
    if (suggestion.status !== "pending") continue;

    const createdMs = new Date(suggestion.created_at).getTime();
    if (createdMs < cutoff) {
      suggestion.status = "dismissed";
      suggestion.dismissed_at = new Date().toISOString();
      suggestion.dismiss_reason = "auto_expired";
    }
  }
}

/**
 * Check guardrails for a category's target skill.
 * Returns { pass: false, reason, cooldown_expires } if blocked by cooldown.
 * Returns { pass: true } if clear.
 *
 * Cooldown check: find most recent accepted/refined suggestion for the
 * same target skill within cooldownDays window.
 */
function checkGuardrails(
  _category: string,
  targetSkill: string | null,
  doc: SuggestionsDocument,
  cooldownDays: number,
): GuardrailResult {
  // If there's no target skill, cooldown is per-category for accepted/refined suggestions
  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const s of doc.suggestions) {
    if (s.status !== "accepted" && s.status !== "refined") continue;

    // Match by target skill if set, otherwise match by the suggestion's own target_skill being the same
    const matches = targetSkill !== null
      ? s.target_skill === targetSkill
      : s.category === _category;

    if (!matches) continue;

    // Check the timestamp of acceptance/refinement
    const actionTs = s.accepted_at || s.refined_at;
    if (!actionTs) continue;

    const actionMs = new Date(actionTs).getTime();
    if (now - actionMs < cooldownMs) {
      const expiresMs = actionMs + cooldownMs;
      return {
        pass: false,
        reason: "cooldown_active",
        cooldown_expires: new Date(expiresMs).toISOString(),
      };
    }
  }

  return { pass: true };
}

/**
 * Group corrections by category (cross-scope — same category, different scopes
 * merge into one group).
 */
function groupByCategory(corrections: CorrectionEntry[]): Map<string, CorrectionGroup> {
  const groups = new Map<string, CorrectionGroup>();

  for (const c of corrections) {
    const cat = c.diagnosis_category;
    let group = groups.get(cat);
    if (!group) {
      group = { category: cat, scopes: new Set(), corrections: [] };
      groups.set(cat, group);
    }
    group.scopes.add(c.scope);
    group.corrections.push(c);
  }

  return groups;
}

/**
 * Generate a unique suggestion ID: epoch seconds + zero-padded counter.
 * Guaranteed unique within the provided set of existing IDs.
 */
function generateSuggestionId(existingIds: Set<string>): string {
  const epochSec = Math.floor(Date.now() / 1000);
  let counter = 0;
  let id: string;

  do {
    id = `sug-${epochSec}-${String(counter).padStart(3, "0")}`;
    counter++;
  } while (existingIds.has(id));

  return id;
}

/**
 * Determine suggestion type based on skill existence.
 * If targetSkill is null or the skill file doesn't exist → 'new_skill_needed'
 * If the skill file exists → 'refine_skill'
 *
 * Uses the well-known agent dir path (~/.gsd/agent/skills/<name>/SKILL.md),
 * matching the pattern in skill-discovery.ts.
 */
function determineSuggestionType(targetSkill: string | null): "refine_skill" | "new_skill_needed" {
  if (!targetSkill) return "new_skill_needed";

  try {
    const skillPath = join(homedir(), ".gsd", "agent", "skills", targetSkill, "SKILL.md");
    if (existsSync(skillPath)) {
      return "refine_skill";
    }
  } catch {
    // Fall through — any I/O error defaults to new_skill_needed
  }

  return "new_skill_needed";
}

/**
 * Build a human-readable scope summary from a set of scopes.
 */
function buildScopeSummary(scopes: Set<string>): string {
  const scopeArr = Array.from(scopes).sort();
  if (scopeArr.length === 1) return `Scope: ${scopeArr[0]}`;
  return `Scopes: ${scopeArr.join(", ")}`;
}
