---
id: S05
parent: M001
milestone: M001
provides:
  - tech-debt.ts module with logDebt, listDebt, resolveDebt, nextDebtId for structured .gsd/TECH-DEBT.md management
  - TechDebtEntry, DebtType, DebtSeverity, DebtStatus types
  - passive-monitor.ts with diffPlanVsSummary() detecting scope expansion/contraction/shift
  - DriftObservation, DriftResult, DriftKind types
  - Tech debt auto-logging instructions in quality-gating standard/strict levels
  - Passive monitoring hook in auto.ts post-completion block writing drift corrections
requires:
  - slice: S01
    provides: writeCorrection(), CorrectionEntry types, .gsd/patterns/ directory, isCaptureDisabled pattern
  - slice: S04
    provides: buildQualityInstructions(), resolveQualityLevel(), quality_level preference field
affects: []
key_files:
  - src/resources/extensions/gsd/tech-debt.ts
  - src/resources/extensions/gsd/passive-monitor.ts
  - src/resources/extensions/gsd/quality-gating.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/tests/tech-debt.test.ts
  - src/resources/extensions/gsd/tests/passive-monitor.test.ts
  - src/resources/extensions/gsd/tests/quality-gating-integration.test.ts
key_decisions:
  - D033: TECH-DEBT.md uses structured markdown (not JSONL) — human-browsable with sequential TD-NNN IDs
  - D034: Tech debt auto-logging extends existing {{quality}} variable via buildQualityInstructions()
  - D035: Passive monitoring runs only after complete-slice units (not after every task)
  - D036: Drift observations use existing correction categories (code.scope_drift, process.planning_error)
patterns_established:
  - Structured markdown I/O with sequential IDs, lenient regex parsing, field defaults for missing data
  - Drift detection via set comparison of plan task IDs vs summary-mentioned task IDs
  - Post-completion hook pattern: gate on kill switch + unit type check, try/catch, non-fatal
observability_surfaces:
  - .gsd/TECH-DEBT.md — human-readable structured register browsable during planning
  - listDebt({ status: 'open' }) — programmatic query of open tech debt entries
  - WriteResult.reason — returns 'invalid_entry' or 'error' for diagnostics on logDebt/resolveDebt
  - diffPlanVsSummary() returns structured DriftResult with typed observations array
  - Drift observations in corrections.jsonl filterable by source:'programmatic' + diagnosis_category
drill_down_paths:
  - .gsd/milestones/M001/slices/S05/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S05/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S05/tasks/T03-SUMMARY.md
duration: 50m
verification_result: passed
completed_at: 2026-03-11
---

# S05: Tech Debt & Passive Monitoring

**Structured tech debt register with auto-logging at standard/strict quality levels, plus plan-vs-summary drift detection wired into auto-mode post-completion**

## What Happened

Built the final slice of M001 in three tasks:

**T01 — Tech debt module (15m):** Created `tech-debt.ts` with `logDebt()`, `listDebt()`, `resolveDebt()` following the non-throwing I/O pattern from corrections.ts. The module manages `.gsd/TECH-DEBT.md` as structured markdown with `## TD-NNN:` sections containing type/severity/component/status/provenance fields. Sequential ID assignment uses max-existing + 1 for gap safety. Lenient parsing handles missing fields with safe defaults. 94-assertion test suite covers full lifecycle.

**T02 — Quality gating extension + passive monitor (20m):** Extended `STANDARD_INSTRUCTIONS` and `STRICT_INSTRUCTIONS` in quality-gating.ts with tech debt auto-logging bullets (~20 tokens each). Standard logs critical/high; strict logs all severities. Created `passive-monitor.ts` with `diffPlanVsSummary()` that compares plan task IDs (from `parsePlan()`) against summary-mentioned task IDs (regex-extracted from frontmatter, title, whatHappened). Detects expansion (tasks in summary not in plan), contraction (planned tasks missing), and shift (both). Documented deviations excluded. 34-assertion test suite + 11 new quality-gating integration assertions.

**T03 — Auto.ts wiring (15m):** Added passive monitoring hook in auto.ts post-completion block after pattern analysis. Gated by `correction_capture !== false` kill switch and `complete-slice` unit type check. Reads plan + summary from disk, calls `diffPlanVsSummary()`, writes drift observations as corrections with `source: 'programmatic'`. Expansion/contraction → `code.scope_drift`, shift → `process.planning_error`. Non-fatal try/catch wrapper.

## Verification

- `node --experimental-strip-types tech-debt.test.ts` — 94 passed, 0 failed
- `npx tsx passive-monitor.test.ts` — 34 passed, 0 failed
- `npx tsx quality-gating.test.ts` — 59 passed, 0 failed (no regression)
- `npx tsx quality-gating-integration.test.ts` — 65 passed, 0 failed (54 existing + 11 new)
- `npx tsx corrections-io.test.ts` — 26 passed, 0 failed (no regression)
- `npx tsx recall.test.ts` — 22 passed, 0 failed (no regression)
- `npx tsc --noEmit` — clean compilation
- Grep: `passive-monitor` imported in auto.ts ✓, `TECH-DEBT.md` in quality-gating.ts ✓, `diffPlanVsSummary` in auto.ts ✓

## Requirements Advanced

- R013 (Tech Debt Register) — Full implementation: structured `.gsd/TECH-DEBT.md` with sequential TD-NNN entries, type/severity/component/status/provenance fields, programmatic API
- R014 (Tech Debt Auto-Logging) — Instructions injected into dispatch prompts at standard (critical/high) and strict (all severities) via `buildQualityInstructions()`
- R015 (Passive Monitoring) — `diffPlanVsSummary()` detects scope expansion/contraction/shift, wired into auto.ts post-completion for complete-slice units, observations flow into correction system

## Requirements Validated

- R013 — 94 test assertions prove write/read/resolve lifecycle, ID sequencing, lenient parsing, non-throwing errors, all 4 types and 4 severities
- R014 — Integration tests prove tech debt instructions present at standard/strict, absent at fast; instructions reference structured format and `.gsd/TECH-DEBT.md`
- R015 — 34 test assertions prove drift detection for all drift types, documented deviation exclusion, empty/malformed input handling; grep confirms auto.ts wiring

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

Tests for passive-monitor and quality-gating use `npx tsx` instead of `node --experimental-strip-types` as specified in slice plan verification commands. The transitive import chain through `files.ts` → `paths.js` uses `.js` extensions that `--experimental-strip-types` can't resolve. This is a pre-existing condition affecting all tests that import `files.ts`.

## Known Limitations

- Tech debt auto-logging is instruction-based (injected into dispatch prompts), not a direct code import in auto.ts. The agent must follow the instructions — there's no programmatic enforcement that `logDebt()` gets called.
- Passive monitoring only analyzes plan-vs-summary drift. State transition detection (mentioned in R015 description) is not implemented — the plan scoped it to plan-vs-summary diffs only.
- No CLI surface for tech debt management — all operations are programmatic via `logDebt()`/`listDebt()`/`resolveDebt()`.

## Follow-ups

- none — this is the final slice of M001

## Files Created/Modified

- `src/resources/extensions/gsd/tech-debt.ts` — Core module: types, logDebt, listDebt, resolveDebt, nextDebtId
- `src/resources/extensions/gsd/passive-monitor.ts` — Drift detection: diffPlanVsSummary, DriftObservation, DriftResult, DriftKind
- `src/resources/extensions/gsd/quality-gating.ts` — Extended STANDARD_INSTRUCTIONS and STRICT_INSTRUCTIONS with tech debt auto-logging bullets
- `src/resources/extensions/gsd/auto.ts` — Added diffPlanVsSummary import and passive monitoring hook in post-completion block
- `src/resources/extensions/gsd/tests/tech-debt.test.ts` — 94-assertion test suite
- `src/resources/extensions/gsd/tests/passive-monitor.test.ts` — 34-assertion test suite
- `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — Extended with 11 tech debt instruction assertions

## Forward Intelligence

### What the next slice should know
- This is the final slice of M001. The next step is the complete-milestone unit that assembles and verifies the full system end-to-end.
- All 5 slices (S01-S05) have independent test suites that pass. The full test count across M001 is 300+ assertions.

### What's fragile
- `passive-monitor.ts` depends on `parsePlan()` and `parseSummary()` from `files.ts`. If the plan/summary markdown format changes, drift detection will silently return empty results (non-throwing design).
- Summary task ID extraction uses regex matching on `T\d+` patterns in unstructured text — could false-positive on text that mentions task IDs in passing.

### Authoritative diagnostics
- `listDebt({ status: 'open' })` — reliable query for outstanding tech debt entries
- `readCorrections({ status: 'active' })` filtered by `source === 'programmatic'` and `diagnosis_category` containing `scope_drift` — shows drift observations from passive monitoring

### What assumptions changed
- The slice plan specified `tech-debt` imported in `auto.ts` as a grep check, but tech debt auto-logging is instruction-based (prompt injection), not a code import. This is correct by design — auto.ts doesn't call `logDebt()` directly; the dispatched agent does.
