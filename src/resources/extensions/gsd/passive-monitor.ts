/**
 * GSD Passive Monitoring — Plan-vs-Summary drift detection.
 *
 * Compares a slice plan against its summary to detect scope drift:
 * - Expansion: tasks/work in summary not in plan
 * - Contraction: planned tasks missing from summary
 * - Shift: both expansion and contraction (significant scope change)
 *
 * Documented deviations (already noted in the summary's Deviations section)
 * are excluded from drift observations since they represent intentional,
 * acknowledged changes.
 *
 * Diagnostic surfaces:
 * - `diffPlanVsSummary()` returns structured `DriftResult` with typed observations
 * - Non-throwing: returns empty result on any parse error
 */

import { parsePlan, parseSummary } from "./files.ts";

// ─── Types ─────────────────────────────────────────────────────────────────

export type DriftKind = "expansion" | "contraction" | "shift";

export interface DriftObservation {
  kind: DriftKind;
  details: string;
  taskId?: string;
}

export interface DriftResult {
  observations: DriftObservation[];
  planTaskCount: number;
  summaryTaskCount: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Extract task IDs mentioned in a deviations text block.
 * Looks for patterns like T01, T02, etc.
 */
function extractDeviationTaskIds(deviations: string): Set<string> {
  const ids = new Set<string>();
  if (!deviations) return ids;
  const matches = deviations.matchAll(/\b(T\d+)\b/g);
  for (const m of matches) {
    ids.add(m[1]);
  }
  return ids;
}

/**
 * Extract task IDs from summary "What Happened" or "Files Created/Modified" sections.
 * Looks for task ID patterns (T01, T02, etc.) mentioned in the summary body.
 */
function extractSummaryTaskIds(summary: ReturnType<typeof parseSummary>): Set<string> {
  const ids = new Set<string>();

  // Extract from frontmatter id field (e.g., "T01" or "S01/T01")
  if (summary.frontmatter.id) {
    const idMatch = summary.frontmatter.id.match(/\b(T\d+)\b/);
    if (idMatch) ids.add(idMatch[1]);
  }

  // Extract from title
  if (summary.title) {
    const titleMatch = summary.title.match(/\b(T\d+)\b/);
    if (titleMatch) ids.add(titleMatch[1]);
  }

  // Extract from what happened section
  if (summary.whatHappened) {
    const matches = summary.whatHappened.matchAll(/\b(T\d+)\b/g);
    for (const m of matches) {
      ids.add(m[1]);
    }
  }

  return ids;
}

// ─── Core ──────────────────────────────────────────────────────────────────

/**
 * Compare a slice plan against its summary to detect scope drift.
 *
 * Non-throwing — returns empty result on any parse failure.
 *
 * @param planContent - Raw markdown content of the slice plan file
 * @param summaryContent - Raw markdown content of the slice summary file
 * @returns DriftResult with observations array and task counts
 */
export function diffPlanVsSummary(
  planContent: string,
  summaryContent: string,
): DriftResult {
  const emptyResult: DriftResult = {
    observations: [],
    planTaskCount: 0,
    summaryTaskCount: 0,
  };

  try {
    if (!planContent || !summaryContent) return emptyResult;

    const plan = parsePlan(planContent);
    const summary = parseSummary(summaryContent);

    const planTaskIds = new Set(plan.tasks.map((t) => t.id));
    const summaryTaskIds = extractSummaryTaskIds(summary);
    const deviationTaskIds = extractDeviationTaskIds(summary.deviations);

    const observations: DriftObservation[] = [];

    // Detect expansion: tasks in summary not in plan
    for (const summaryId of summaryTaskIds) {
      if (!planTaskIds.has(summaryId) && !deviationTaskIds.has(summaryId)) {
        observations.push({
          kind: "expansion",
          details: `Task ${summaryId} appears in summary but was not in the original plan`,
          taskId: summaryId,
        });
      }
    }

    // Detect contraction: planned tasks missing from summary
    for (const planId of planTaskIds) {
      if (!summaryTaskIds.has(planId) && !deviationTaskIds.has(planId)) {
        observations.push({
          kind: "contraction",
          details: `Task ${planId} was planned but not mentioned in the summary`,
          taskId: planId,
        });
      }
    }

    // Detect shift: if both expansion and contraction exist, add a shift observation
    const hasExpansion = observations.some((o) => o.kind === "expansion");
    const hasContraction = observations.some((o) => o.kind === "contraction");
    if (hasExpansion && hasContraction) {
      observations.push({
        kind: "shift",
        details: `Scope shift detected: plan had ${planTaskIds.size} tasks, summary references ${summaryTaskIds.size} tasks with both additions and removals`,
      });
    }

    return {
      observations,
      planTaskCount: plan.tasks.length,
      summaryTaskCount: summaryTaskIds.size,
    };
  } catch {
    // Non-throwing: return empty result on any error
    return emptyResult;
  }
}
