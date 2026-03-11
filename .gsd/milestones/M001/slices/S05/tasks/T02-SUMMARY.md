---
id: T02
parent: S05
milestone: M001
provides:
  - tech debt auto-logging instructions in quality-gating standard/strict levels
  - passive-monitor.ts with diffPlanVsSummary() for plan-vs-summary drift detection
  - DriftObservation, DriftResult, DriftKind exported types
key_files:
  - src/resources/extensions/gsd/quality-gating.ts
  - src/resources/extensions/gsd/passive-monitor.ts
  - src/resources/extensions/gsd/tests/passive-monitor.test.ts
  - src/resources/extensions/gsd/tests/quality-gating-integration.test.ts
key_decisions:
  - Extracted summary task IDs from frontmatter.id, title, and whatHappened text rather than requiring a structured task list in summaries
  - Used test runner npx tsx instead of node --experimental-strip-types because transitive .js imports in files.ts chain prevent strip-types from resolving modules
patterns_established:
  - Drift detection via set comparison of plan task IDs vs summary-mentioned task IDs with deviation exclusion
  - Summary task ID extraction from unstructured text using regex matching on T\d+ patterns
observability_surfaces:
  - diffPlanVsSummary() returns structured DriftResult with typed observations array, planTaskCount, summaryTaskCount
  - DriftResult.observations empty array on any parse failure — never throws
  - buildQualityInstructions('standard') output now includes tech debt logging text
duration: 20m
verification_result: passed
completed_at: 2026-03-11
blocker_discovered: false
---

# T02: Wire tech debt auto-logging into quality gating and build passive-monitor.ts

**Extended quality-gating instructions with tech debt auto-logging at standard/strict levels and built passive-monitor.ts for plan-vs-summary drift detection**

## What Happened

Two deliverables completed:

1. **Quality gating extension:** Added tech debt auto-logging bullet to both `STANDARD_INSTRUCTIONS` (critical/high severity) and `STRICT_INSTRUCTIONS` (all severities) in `quality-gating.ts`. Each adds ~20 tokens referencing `.gsd/TECH-DEBT.md` and the structured format. Fast level remains empty — zero behavioral change.

2. **Passive monitor module:** Created `passive-monitor.ts` with `diffPlanVsSummary(planContent, summaryContent)` that compares plan task IDs (from `parsePlan()`) against summary-mentioned task IDs (extracted via regex from frontmatter, title, and whatHappened sections). Detects three drift types: expansion (tasks in summary not in plan), contraction (planned tasks missing from summary), and shift (both expansion + contraction). Documented deviations (task IDs mentioned in the summary's Deviations section) are excluded from drift observations. Function is non-throwing — returns empty `DriftResult` on any parse failure.

3. **Test suites:** Created `passive-monitor.test.ts` with 34 assertions covering all drift types, clean case, documented deviation exclusion, partial deviation exclusion, empty/malformed input, plan with no tasks, result type correctness, and non-throwing guarantee. Extended `quality-gating-integration.test.ts` with 11 new assertions verifying tech debt text appears in standard/strict and is absent from fast.

## Verification

- `npx tsx src/resources/extensions/gsd/tests/passive-monitor.test.ts` — 34 passed, 0 failed
- `npx tsx src/resources/extensions/gsd/tests/quality-gating.test.ts` — 59 passed, 0 failed (no regression)
- `npx tsx src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — 65 passed, 0 failed (54 existing + 11 new)
- `node --experimental-strip-types src/resources/extensions/gsd/tests/tech-debt.test.ts` — 94 passed, 0 failed
- `npx tsc --noEmit` — clean compilation
- Grep confirms `TECH-DEBT.md` referenced in quality instructions

Note: Tests use `npx tsx` instead of `node --experimental-strip-types` because the transitive import chain through `files.ts` → `paths.js` uses `.js` extensions that `--experimental-strip-types` can't resolve. This matches how other tests like `parsers.test.ts` work in the codebase.

## Diagnostics

- `diffPlanVsSummary(planContent, summaryContent)` — returns `DriftResult` with typed observations. Empty `{ observations: [], planTaskCount: 0, summaryTaskCount: 0 }` on any parse error.
- `buildQualityInstructions('standard')` — now includes tech debt logging text. Inspect output to verify.
- `buildQualityInstructions('fast')` — returns empty string (verify no tech debt text leaks to fast level).

## Deviations

Used `npx tsx` for test execution instead of `node --experimental-strip-types` as specified in slice verification. The `--experimental-strip-types` runner cannot resolve `.js` extension imports in the `files.ts` → `paths.js` chain. This is a pre-existing issue affecting all tests that transitively import `files.ts`. `npx tsx` handles the `.js` → `.ts` rewriting correctly.

## Known Issues

None

## Files Created/Modified

- `src/resources/extensions/gsd/quality-gating.ts` — added tech debt auto-logging bullet to STANDARD_INSTRUCTIONS and STRICT_INSTRUCTIONS constants
- `src/resources/extensions/gsd/passive-monitor.ts` — new module with diffPlanVsSummary(), DriftObservation, DriftResult, DriftKind types
- `src/resources/extensions/gsd/tests/passive-monitor.test.ts` — 34-assertion test suite for drift detection
- `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — extended with 11 new tech debt instruction assertions
