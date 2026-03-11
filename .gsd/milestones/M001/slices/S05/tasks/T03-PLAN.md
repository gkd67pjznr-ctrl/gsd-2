---
estimated_steps: 5
estimated_files: 3
---

# T03: Wire passive monitoring into auto.ts and final integration

**Slice:** S05 — Tech Debt & Passive Monitoring
**Milestone:** M001

## Description

Connect passive monitoring into the auto-mode dispatch loop and run the full verification suite. This is the final wiring task — after it completes, the entire S05 surface is live and verified.

The passive monitoring hook goes in auto.ts's post-completion block (around line 910, after the existing pattern analysis call). It runs only after `complete-slice` units finish and merge, reads the plan and summary from disk, calls `diffPlanVsSummary()`, and writes drift observations as corrections via `writeCorrection()`. The hook is gated by the `correction_capture` kill switch and wrapped in a non-fatal try/catch.

## Steps

1. Import `diffPlanVsSummary` from `passive-monitor.ts` in auto.ts. Import `resolveSliceFile` and `loadFile` (already available in auto.ts) for reading plan and summary files.

2. Add the passive monitoring call in the post-completion block, after the pattern analysis block (around line 910). Gate on: (a) `correction_capture !== false` kill switch (same check as pattern analysis), (b) `currentUnit.type === 'complete-slice'` (only run after slice completions, not task completions). Read plan via `resolveSliceFile(basePath, mid, sid, 'PLAN')` and summary via `resolveSliceFile(basePath, mid, sid, 'SUMMARY')`. Call `diffPlanVsSummary(planContent, summaryContent)`. For each observation, call `writeCorrection()` with `source: 'programmatic'`, `diagnosis_category: 'code.scope_drift'` for expansion/contraction and `'process.planning_error'` for shift, `scope: 'project'`, `phase: 'completing'`.

3. Wrap the entire passive monitoring block in try/catch — non-fatal, must never block dispatch. Log nothing on error (matches pattern analysis block behavior).

4. Run all S05 test suites to verify no regressions: `tech-debt.test.ts`, `passive-monitor.test.ts`, `quality-gating.test.ts`, `quality-gating-integration.test.ts`. Run existing test suites: `corrections-io.test.ts`, `recall.test.ts`. Run `npx tsc --noEmit` for clean compilation.

5. Run grep verification checks from slice plan: confirm `passive-monitor` import in auto.ts, confirm `tech-debt` auto-logging text in quality instructions, confirm `.gsd/TECH-DEBT.md` referenced in quality instruction text.

## Must-Haves

- [ ] `diffPlanVsSummary` imported and called in auto.ts post-completion block
- [ ] Passive monitoring runs only after `complete-slice` units (not after every task)
- [ ] Kill switch (`correction_capture: false`) gates passive monitoring
- [ ] Drift observations written as corrections via `writeCorrection()`
- [ ] Non-fatal try/catch — passive monitoring never blocks dispatch
- [ ] All S05 test suites pass
- [ ] All existing test suites pass (no regression)
- [ ] `npx tsc --noEmit` clean

## Verification

- `npx tsc --noEmit` — clean compilation
- `node --experimental-strip-types src/resources/extensions/gsd/tests/tech-debt.test.ts` — all pass
- `node --experimental-strip-types src/resources/extensions/gsd/tests/passive-monitor.test.ts` — all pass
- `node --experimental-strip-types src/resources/extensions/gsd/tests/quality-gating.test.ts` — all pass (no regression)
- `node --experimental-strip-types src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — all pass
- `node --experimental-strip-types src/resources/extensions/gsd/tests/corrections-io.test.ts` — all pass (no regression)
- Grep: `grep -c "passive-monitor" src/resources/extensions/gsd/auto.ts` returns ≥1
- Grep: `grep -c "TECH-DEBT" src/resources/extensions/gsd/quality-gating.ts` returns ≥1

## Observability Impact

- Signals added/changed: Passive monitoring observations appear in `.gsd/patterns/corrections.jsonl` with `source: 'programmatic'` and scope drift / planning error categories — visible to correction-based downstream consumers (recall, preferences, observer)
- How a future agent inspects this: `readCorrections({ status: 'active' })` returns drift observations alongside other corrections; filter by `source === 'programmatic'` and `diagnosis_category.includes('scope_drift')` for passive monitoring entries specifically
- Failure state exposed: Passive monitoring failures are swallowed (try/catch) — consistent with all other post-completion hooks. No silent data loss risk since the plan and summary are already committed on disk.

## Inputs

- `src/resources/extensions/gsd/passive-monitor.ts` — `diffPlanVsSummary()` from T02
- `src/resources/extensions/gsd/corrections.ts` — `writeCorrection()` from S01
- `src/resources/extensions/gsd/auto.ts` — post-completion block (~line 885-920) where pattern analysis runs
- `src/resources/extensions/gsd/quality-gating.ts` — updated with tech debt instructions from T02

## Expected Output

- `src/resources/extensions/gsd/auto.ts` — updated with passive monitoring import and post-completion hook
- All test suites passing, all grep checks passing — slice verification complete
