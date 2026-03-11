---
id: T03
parent: S05
milestone: M001
provides:
  - Passive monitoring hook in auto.ts post-completion block writing drift corrections
  - Full S05 integration verified — all test suites pass, all grep checks pass
key_files:
  - src/resources/extensions/gsd/auto.ts
key_decisions:
  - Mapped drift kind to diagnosis_category: expansion/contraction → code.scope_drift, shift → process.planning_error — matches the correction taxonomy's semantic intent
patterns_established:
  - Post-completion hook pattern: gate on correction_capture kill switch + unit type check, try/catch wrapper, non-fatal
observability_surfaces:
  - Drift observations appear in .gsd/patterns/corrections.jsonl with source:'programmatic', filterable via readCorrections() + diagnosis_category includes 'scope_drift' or 'planning_error'
duration: 15m
verification_result: passed
completed_at: 2026-03-11
blocker_discovered: false
---

# T03: Wire passive monitoring into auto.ts and final integration

**Wired diffPlanVsSummary into auto.ts post-completion block with kill switch gating, non-fatal try/catch, and complete-slice-only filtering — all S05 verification passes.**

## What Happened

Added the passive monitoring hook in `auto.ts` immediately after the pattern analysis block in the post-completion section of `dispatchNextUnit()`. The hook:

1. Checks `correction_capture !== false` kill switch (same pattern as pattern analysis)
2. Only runs when `currentUnit.type === "complete-slice"` — skips task completions
3. Extracts `mid`/`sid` from `currentUnit.id` (format: `M001/S01`)
4. Reads the slice plan and summary from disk via `resolveSliceFile()` + `loadFile()`
5. Calls `diffPlanVsSummary(planContent, summaryContent)` from `passive-monitor.ts`
6. Writes each drift observation as a correction via `writeCorrection()` with:
   - `source: 'programmatic'`
   - `diagnosis_category`: `code.scope_drift` for expansion/contraction, `process.planning_error` for shift
   - `scope: 'project'`, `phase: 'completing'`
7. Entire block wrapped in try/catch — non-fatal, never blocks dispatch

## Verification

- `npx tsc --noEmit` — clean compilation ✅
- `node --experimental-strip-types src/resources/extensions/gsd/tests/tech-debt.test.ts` — 94 passed ✅
- `npx tsx src/resources/extensions/gsd/tests/passive-monitor.test.ts` — 34 passed ✅
- `npx tsx src/resources/extensions/gsd/tests/quality-gating.test.ts` — 59 passed ✅
- `npx tsx src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — 65 passed ✅
- `npx tsx src/resources/extensions/gsd/tests/corrections-io.test.ts` — 26 passed ✅
- `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` — 22 passed ✅
- `grep -c "passive-monitor" auto.ts` → 1 ✅
- `grep -c "TECH-DEBT" quality-gating.ts` → 2 ✅

Slice-level note: The slice verification mentions `tech-debt` imported in auto.ts, but tech debt auto-logging is instruction-based (injected into prompts via quality-gating.ts), not a direct code import in auto.ts. This is by design from T02.

## Diagnostics

- `readCorrections({ status: 'active' }, { cwd })` — returns all corrections including drift observations
- Filter by `source === 'programmatic'` and `diagnosis_category` containing `scope_drift` for passive monitoring entries
- Drift observations include unit_type `complete-slice` and unit_id `MID/SID` for provenance
- Failures are swallowed (try/catch) — consistent with all other post-completion hooks

## Deviations

None.

## Known Issues

- Some test files (passive-monitor, quality-gating) require `npx tsx` instead of `node --experimental-strip-types` due to transitive `.js` imports in files.ts chain. This is a pre-existing condition noted in T02.

## Files Created/Modified

- `src/resources/extensions/gsd/auto.ts` — Added `diffPlanVsSummary` import and passive monitoring hook in post-completion block
