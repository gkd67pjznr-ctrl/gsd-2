# S05: Tech Debt & Passive Monitoring

**Goal:** Code issues discovered during execution are auto-logged to `.gsd/TECH-DEBT.md` with severity and provenance, and plan-vs-summary drift analysis runs after each slice completion, feeding results into the observation system.
**Demo:** After an auto-mode slice completes at standard/strict quality level, `TECH-DEBT.md` contains structured TD-NNN entries, dispatch prompts include auto-logging instructions gated by quality level, and passive monitoring produces drift corrections from plan-vs-summary comparison.

## Must-Haves

- `tech-debt.ts` module with `logDebt()`, `listDebt()`, `resolveDebt()` functions — non-throwing I/O pattern matching corrections.ts
- `.gsd/TECH-DEBT.md` structured markdown format with sequential TD-NNN entries, type/severity/component/status/provenance fields
- Tech debt auto-logging instructions injected into dispatch prompts at standard (critical/high) and strict (all severities) quality levels via `buildQualityInstructions()`
- `passive-monitor.ts` module with `diffPlanVsSummary()` returning structured drift observations
- Passive monitoring wired into auto.ts post-completion block after slice merge, writing drift as corrections via `writeCorrection()`
- Kill switch (`correction_capture: false`) disables passive monitoring observations
- Test suite covering tech debt I/O lifecycle, quality instruction extension, and plan-vs-summary drift detection

## Proof Level

- This slice proves: contract + integration
- Real runtime required: no — contract proven via unit tests with fixture data; integration proven via auto.ts wiring verification
- Human/UAT required: no — all verification is automated

## Verification

- `node --experimental-strip-types src/resources/extensions/gsd/tests/tech-debt.test.ts` — tech debt I/O lifecycle (write/read/resolve, ID sequencing, lenient parsing, non-throwing errors)
- `node --experimental-strip-types src/resources/extensions/gsd/tests/passive-monitor.test.ts` — drift detection (scope expansion, contraction, shift, documented deviations excluded, empty/malformed inputs)
- `node --experimental-strip-types src/resources/extensions/gsd/tests/quality-gating.test.ts` — existing tests still pass (no regression)
- `node --experimental-strip-types src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — existing integration tests still pass + tech debt instructions present at standard/strict
- `npx tsc --noEmit` — clean compilation
- Grep checks: `tech-debt` imported in `auto.ts`, `passive-monitor` imported in `auto.ts`, `TECH-DEBT.md` referenced in quality instructions

## Observability / Diagnostics

- Runtime signals: `logDebt()` returns `WriteResult` with reason on failure (mirrors corrections.ts); `diffPlanVsSummary()` returns structured `DriftResult` with typed observations
- Inspection surfaces: `.gsd/TECH-DEBT.md` is human-readable markdown browsable during planning; `listDebt()` queries entries programmatically with status filter
- Failure visibility: `WriteResult.reason` provides `'error'` on I/O failures; passive monitor wrapped in try/catch in auto.ts — never blocks dispatch
- Redaction constraints: none — no secrets in tech debt entries

## Integration Closure

- Upstream surfaces consumed: `writeCorrection()` from corrections.ts (S01), `resolveQualityLevel()` and `buildQualityInstructions()` from quality-gating.ts (S04), `parsePlan()` and `parseSummary()` from files.ts, `isCaptureDisabled` pattern from corrections.ts
- New wiring introduced in this slice: passive monitoring hook in auto.ts post-completion block, tech debt auto-logging instructions in quality gating prompt text
- What remains before the milestone is truly usable end-to-end: nothing — this is the final slice of M001. After this, the integration slice (complete-milestone) assembles and verifies the full system.

## Tasks

- [x] **T01: Build tech-debt.ts module and test suite** `est:45m`
  - Why: Core module for R013 (Tech Debt Register). Provides `logDebt()`, `listDebt()`, `resolveDebt()` with non-throwing I/O, sequential TD-NNN IDs, and lenient markdown parsing. Creates the test suite that initially fails on missing module, then passes as implementation is built.
  - Files: `src/resources/extensions/gsd/tech-debt.ts`, `src/resources/extensions/gsd/tests/tech-debt.test.ts`
  - Do: Create `tech-debt.ts` with types (`TechDebtEntry`, `DebtType`, `DebtSeverity`, `DebtStatus`), `logDebt()` (reads existing file, finds next ID, appends markdown entry), `listDebt()` (parses TECH-DEBT.md with lenient regex, returns entries with optional status filter), `resolveDebt()` (updates status to resolved with resolved date). Create `tech-debt.test.ts` with assertions for: write + read round-trip, sequential ID assignment with gap handling, all 4 types and 4 severities valid, resolve updates status, lenient parsing handles missing fields/extra whitespace, non-throwing on errors, empty file handling. Follow corrections.ts pattern: `cwd` parameter, `WriteResult` return, try/catch everything.
  - Verify: `node --experimental-strip-types src/resources/extensions/gsd/tests/tech-debt.test.ts` passes all assertions
  - Done when: `logDebt()`, `listDebt()`, `resolveDebt()` all work with tests proving the full lifecycle

- [x] **T02: Wire tech debt auto-logging into quality gating and build passive-monitor.ts** `est:45m`
  - Why: Delivers R014 (auto-logging instructions in dispatch prompts) and R015 (passive monitoring drift detection). Extends `buildQualityInstructions()` with tech debt text and creates the drift analysis module.
  - Files: `src/resources/extensions/gsd/quality-gating.ts`, `src/resources/extensions/gsd/passive-monitor.ts`, `src/resources/extensions/gsd/tests/passive-monitor.test.ts`, `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts`
  - Do: (1) Extend `STANDARD_INSTRUCTIONS` and `STRICT_INSTRUCTIONS` in quality-gating.ts to add tech debt auto-logging text in the post-task section (~50 tokens each). Standard: log critical/high issues. Strict: log all issues. (2) Create `passive-monitor.ts` with `diffPlanVsSummary(planContent, summaryContent)` that uses `parsePlan()` and `parseSummary()` to compare task lists, detect scope expansion (tasks in summary not in plan), contraction (planned tasks missing from summary), and shift. Exclude documented deviations. Return `DriftResult` with observations array. (3) Create `passive-monitor.test.ts` with assertions for expansion, contraction, shift, no-drift clean case, documented deviation exclusion, empty/malformed input handling. (4) Update quality-gating-integration.test.ts to verify tech debt instructions appear in standard/strict output.
  - Verify: All three test suites pass (`tech-debt.test.ts`, `passive-monitor.test.ts`, `quality-gating-integration.test.ts`); `npx tsc --noEmit` clean
  - Done when: Quality instructions include tech debt auto-logging text, drift detection works for all drift types, existing quality tests still pass

- [x] **T03: Wire passive monitoring into auto.ts and final integration** `est:30m`
  - Why: Connects everything into the live system — hooks passive monitoring into auto.ts post-completion block, ensures kill switch gates monitoring, runs full verification suite.
  - Files: `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/tests/tech-debt.test.ts`, `src/resources/extensions/gsd/tests/passive-monitor.test.ts`
  - Do: (1) Import `diffPlanVsSummary` in auto.ts. (2) Add passive monitoring call in the post-completion block after the pattern analysis call (line ~910), gated by `correction_capture !== false` kill switch. After a `complete-slice` unit finishes and merges, read the slice plan and summary from disk, call `diffPlanVsSummary()`, and write any drift observations as corrections via `writeCorrection()` with `source: 'programmatic'` and category `code.scope_drift` or `process.planning_error`. (3) Wrap in try/catch — non-fatal. (4) Run all S05 test suites plus existing test suites to verify no regressions. (5) Run `npx tsc --noEmit`. (6) Run all grep verification checks from slice plan.
  - Verify: `npx tsc --noEmit` clean; all test suites pass; grep confirms imports in auto.ts; grep confirms TECH-DEBT.md referenced in quality instructions
  - Done when: Passive monitoring is wired into auto.ts, kill switch gates it, all slice-level verification passes, no regressions in existing tests

## Files Likely Touched

- `src/resources/extensions/gsd/tech-debt.ts`
- `src/resources/extensions/gsd/passive-monitor.ts`
- `src/resources/extensions/gsd/quality-gating.ts`
- `src/resources/extensions/gsd/auto.ts`
- `src/resources/extensions/gsd/tests/tech-debt.test.ts`
- `src/resources/extensions/gsd/tests/passive-monitor.test.ts`
- `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts`
