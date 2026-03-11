---
estimated_steps: 5
estimated_files: 4
---

# T02: Wire tech debt auto-logging into quality gating and build passive-monitor.ts

**Slice:** S05 — Tech Debt & Passive Monitoring
**Milestone:** M001

## Description

Two deliverables: (1) Extend quality gating instructions to include tech debt auto-logging text at standard/strict levels (R014), and (2) create the passive monitoring module for plan-vs-summary drift detection (R015).

The quality instructions extension is small — append ~50 tokens of tech debt auto-logging text to the existing post-task sections in `STANDARD_INSTRUCTIONS` and `STRICT_INSTRUCTIONS` constants. This follows D030 (single `{{quality}}` variable pattern) and stays within the token budget (S04 measured ~130/~200 tokens, budget is 400/600).

The passive monitor uses `parsePlan()` and `parseSummary()` from files.ts to compare plan tasks against summary outcomes. It detects three drift types: expansion (tasks/work in summary not in plan), contraction (planned tasks missing from summary), and shift (significant scope change). Documented deviations (already in the summary's Deviations section) are excluded from drift observations.

## Steps

1. Extend `STANDARD_INSTRUCTIONS` in `quality-gating.ts` to add tech debt auto-logging text after the existing post-task diff review bullet: "**Tech debt logging:** Log any critical or high severity code issues you noticed (bugs, design problems, test gaps, doc gaps) to `.gsd/TECH-DEBT.md` using the structured format."

2. Extend `STRICT_INSTRUCTIONS` similarly: "**Tech debt logging (all severities):** Log ALL code issues discovered during this task (critical, high, medium, low) to `.gsd/TECH-DEBT.md` using the structured format."

3. Create `passive-monitor.ts` with `DriftObservation` type (kind: `'expansion' | 'contraction' | 'shift'`, details string, taskId optional) and `DriftResult` type (observations array, planTaskCount, summaryTaskCount). Implement `diffPlanVsSummary(planContent: string, summaryContent: string): DriftResult` — calls `parsePlan()` and `parseSummary()`, compares task ID sets, checks for documented deviations to exclude, returns observations. Non-throwing — returns empty result on parse failure.

4. Create `passive-monitor.test.ts` with assertions following the established test pattern: scope expansion detected (extra tasks in summary), scope contraction detected (planned tasks missing), scope shift (both expansion + contraction), clean case (no drift), documented deviations excluded from drift, empty/malformed input returns empty observations, plan with no tasks and summary with tasks.

5. Update `quality-gating-integration.test.ts` to add assertions verifying tech debt auto-logging text appears in standard and strict instructions output, and does NOT appear in fast output.

## Must-Haves

- [ ] `STANDARD_INSTRUCTIONS` includes tech debt auto-logging text for critical/high severity
- [ ] `STRICT_INSTRUCTIONS` includes tech debt auto-logging text for all severities
- [ ] Fast level instructions remain empty (zero behavioral change)
- [ ] `diffPlanVsSummary()` detects expansion, contraction, and shift
- [ ] Documented deviations are excluded from drift observations
- [ ] `passive-monitor.ts` is non-throwing — returns empty result on parse failure
- [ ] All existing quality-gating tests still pass (no regression)
- [ ] New test suites pass

## Verification

- `node --experimental-strip-types src/resources/extensions/gsd/tests/passive-monitor.test.ts` — all assertions pass
- `node --experimental-strip-types src/resources/extensions/gsd/tests/quality-gating.test.ts` — no regression
- `node --experimental-strip-types src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — existing + new tech debt assertions pass
- `npx tsc --noEmit` — clean compilation

## Observability Impact

- Signals added/changed: `DriftResult` structured return from `diffPlanVsSummary()` provides typed observations with kind, details, and optional task ID; quality instruction text now mentions `.gsd/TECH-DEBT.md` at standard/strict levels
- How a future agent inspects this: call `diffPlanVsSummary(planContent, summaryContent)` to get structured drift analysis; inspect `buildQualityInstructions('standard')` output to see tech debt instructions
- Failure state exposed: `diffPlanVsSummary()` returns `{ observations: [], planTaskCount: 0, summaryTaskCount: 0 }` on any parse error — never throws

## Inputs

- `src/resources/extensions/gsd/quality-gating.ts` — `STANDARD_INSTRUCTIONS` and `STRICT_INSTRUCTIONS` constants to extend
- `src/resources/extensions/gsd/files.ts` — `parsePlan()` and `parseSummary()` for structured comparison
- `src/resources/extensions/gsd/types.ts` — `SlicePlan`, `TaskPlanEntry`, `Summary` types
- `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — existing test suite to extend
- T01 output — `tech-debt.ts` module exists and is importable

## Expected Output

- `src/resources/extensions/gsd/quality-gating.ts` — updated with tech debt auto-logging instructions in standard/strict sections
- `src/resources/extensions/gsd/passive-monitor.ts` — new module with `diffPlanVsSummary()`, drift types
- `src/resources/extensions/gsd/tests/passive-monitor.test.ts` — passing test suite for drift detection
- `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — extended with tech debt instruction assertions
