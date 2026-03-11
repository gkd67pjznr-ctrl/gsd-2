// GSD Extension — Correction Type Definitions & Validation Helpers
// Pure type definitions and validation for the 14-category correction taxonomy.
// No runtime dependencies beyond basic JS. Consumed by correction I/O, detection, and reporting modules.

// ─── Diagnosis Taxonomy (14 categories: 7 code + 7 process) ────────────────

export type DiagnosisCategory =
  // Code categories
  | 'code.wrong_pattern'
  | 'code.missing_context'
  | 'code.stale_knowledge'
  | 'code.over_engineering'
  | 'code.under_engineering'
  | 'code.style_mismatch'
  | 'code.scope_drift'
  // Process categories
  | 'process.planning_error'
  | 'process.research_gap'
  | 'process.implementation_bug'
  | 'process.integration_miss'
  | 'process.convention_violation'
  | 'process.requirement_misread'
  | 'process.regression';

/** Runtime set of all 14 valid diagnosis categories. */
export const VALID_CATEGORIES: Set<string> = new Set<string>([
  'code.wrong_pattern',
  'code.missing_context',
  'code.stale_knowledge',
  'code.over_engineering',
  'code.under_engineering',
  'code.style_mismatch',
  'code.scope_drift',
  'process.planning_error',
  'process.research_gap',
  'process.implementation_bug',
  'process.integration_miss',
  'process.convention_violation',
  'process.requirement_misread',
  'process.regression',
]);

// ─── Enums & Unions ────────────────────────────────────────────────────────

export type CorrectionScope = 'file' | 'filetype' | 'phase' | 'project' | 'global';

export type CorrectionSource = 'self_report' | 'programmatic' | 'user_correction';

// ─── CorrectionEntry Interface ─────────────────────────────────────────────

export interface CorrectionEntry {
  // Required fields
  correction_from: string;
  correction_to: string;
  diagnosis_category: DiagnosisCategory;
  diagnosis_text: string;
  scope: CorrectionScope;
  phase: string;
  timestamp: string;
  session_id: string;
  source: CorrectionSource;
  // Optional fields
  secondary_category?: DiagnosisCategory | null;
  quality_level?: 'fast' | 'standard' | 'strict';
  file_path?: string;
  unit_type?: string;
  unit_id?: string;
  retired_at?: string;
  retired_by?: string;
}

// ─── Required Fields ───────────────────────────────────────────────────────

/** The 9 required field names on a CorrectionEntry. */
export const REQUIRED_FIELDS: string[] = [
  'correction_from',
  'correction_to',
  'diagnosis_category',
  'diagnosis_text',
  'scope',
  'phase',
  'timestamp',
  'session_id',
  'source',
];

// ─── Validation Helpers ────────────────────────────────────────────────────

/** Returns true if `category` is one of the 14 valid diagnosis categories. */
export function isValidCategory(category: string): category is DiagnosisCategory {
  return VALID_CATEGORIES.has(category);
}

/**
 * Type guard — validates that `entry` is a well-formed CorrectionEntry.
 *
 * Checks:
 * - entry is a non-null object
 * - all 9 required fields are present and non-empty
 * - diagnosis_category is in the 14-category taxonomy
 * - diagnosis_text word count ≤ 100
 */
export function isValidEntry(entry: unknown): entry is CorrectionEntry {
  if (!entry || typeof entry !== 'object') return false;

  const obj = entry as Record<string, unknown>;

  // Check all required fields are present and non-empty
  for (const field of REQUIRED_FIELDS) {
    const val = obj[field];
    if (val === undefined || val === null || val === '') return false;
  }

  // Validate diagnosis_category is in the taxonomy
  if (!VALID_CATEGORIES.has(obj.diagnosis_category as string)) return false;

  // Validate diagnosis_text word count ≤ 100
  const wordCount = String(obj.diagnosis_text).trim().split(/\s+/).length;
  if (wordCount > 100) return false;

  return true;
}
