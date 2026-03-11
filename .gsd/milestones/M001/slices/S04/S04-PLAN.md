# S04: Quality Gating

**Goal:** Setting quality level to `fast`, `standard`, or `strict` via preferences injects appropriate codebase scan, Context7 lookup, test, and diff review instructions into dispatch prompts, with gate outcomes recorded in the metrics ledger and visible in the dashboard overlay.
**Demo:** With `quality_level: standard` in `.gsd/preferences.md`, an auto-mode task dispatch includes pre/post quality instructions, and after task completion, gate events appear in `metrics.json` and the dashboard shows a quality summary line.

## Must-Haves

- `quality_level` field on `GSDPreferences` (fast/standard/strict), optional, defaults to fast, validated, merged across global/project scopes
- `resolveQualityLevel()` exported for consumption by S05 and auto.ts
- `buildQualityInstructions(level)` returns prompt injection text: empty for fast, ~200-400 tokens for standard, ~400-600 for strict
- `{{quality}}` template variable in execute-task.md, placed with pre-task before the task plan and post-task after step 9
- `GateEvent` type with gate name (5 gates), outcome (4 states), quality level, timestamp
- `recordGateEvent()` and `getGateEvents()` functions, integrated with existing `UnitMetrics`
- Gate events stored on `UnitMetrics.gateEvents` in `metrics.json` (not a separate JSONL)
- Dashboard overlay shows quality gate summary line after Cost & Usage section
- `fast` mode produces zero additional prompt content, zero gate events, zero behavioral change
- All existing tests continue to pass

## Proof Level

- This slice proves: contract + integration
- Real runtime required: no (test fixtures simulate preferences, metrics, and prompt assembly; integration proven by wiring into auto.ts and dashboard)
- Human/UAT required: no (quality gate visibility will be proven by tests asserting dashboard output and metrics ledger content)

## Verification

- `npx tsx src/resources/extensions/gsd/tests/quality-gating.test.ts` — 30+ assertions covering:
  - `resolveQualityLevel()` defaults to fast, reads from preferences, handles missing/invalid
  - `buildQualityInstructions("fast")` returns empty string
  - `buildQualityInstructions("standard")` returns non-empty with codebase_scan, context7_lookup, diff_review keywords
  - `buildQualityInstructions("strict")` includes all standard content plus test_baseline, test_gate
  - Token budget: standard ≤ 400 tokens, strict ≤ 600 tokens (using estimateTokens from recall.ts)
  - Gate event creation, validation, recording, retrieval
  - Fast mode produces no gate events
- `npx tsx src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — 15+ assertions covering:
  - `{{quality}}` template variable substitution in execute-task.md
  - `quality_level` field on GSDPreferences: validation, merging, parsing
  - Dashboard quality summary line rendering
  - Metrics ledger gateEvents field round-trip (write + read)
- `npx tsc --noEmit` — TypeScript compilation passes
- All existing tests pass: `npx tsx src/resources/extensions/gsd/tests/recall.test.ts`, `npx tsx src/resources/extensions/gsd/tests/corrections-io.test.ts`

## Observability / Diagnostics

- Runtime signals: gate events recorded in `metrics.json` as structured data with gate name, outcome, level, timestamp
- Inspection surfaces: `getLedger()` returns in-memory ledger with `gateEvents` on each unit; dashboard overlay renders quality summary
- Failure visibility: `recordGateEvent()` is non-throwing (follows correction I/O pattern); invalid gate events are silently dropped; `resolveQualityLevel()` falls back to "fast" on any error
- Redaction constraints: none (no secrets in quality data)

## Integration Closure

- Upstream surfaces consumed: `preferences.ts` (GSDPreferences, validatePreferences, mergePreferences, loadEffectiveGSDPreferences), `metrics.ts` (UnitMetrics, snapshotUnitMetrics, getLedger, saveLedger), `prompt-loader.ts` (loadPrompt), `auto.ts` (buildExecuteTaskPrompt, buildCorrectionsVar), `dashboard-overlay.ts` (buildContentLines), `recall.ts` (estimateTokens), `corrections.ts` (VALID_QUALITY_LEVELS reference)
- New wiring introduced in this slice: `quality_level` field on GSDPreferences + validation/merging; `{{quality}}` template variable in execute-task.md + auto.ts wiring; `gateEvents` field on UnitMetrics; quality summary section in dashboard overlay; `resolveQualityLevel()` export for S05 consumption
- What remains before the milestone is truly usable end-to-end: S05 (Tech Debt & Passive Monitoring) consumes `resolveQualityLevel()` for auto-logging severity gating; final assembly integration test in S05

## Tasks

- [x] **T01: Create quality-gating module with tests** `est:1h`
  - Why: Core module that resolves quality level from preferences, builds quality instructions for prompt injection, and manages gate events. This is the foundation for R010, R011, R012.
  - Files: `src/resources/extensions/gsd/quality-gating.ts`, `src/resources/extensions/gsd/tests/quality-gating.test.ts`
  - Do: Create `quality-gating.ts` with `resolveQualityLevel(cwd?)`, `buildQualityInstructions(level)`, `GateEvent` type, `recordGateEvent()`, `getGateEvents()`, `clearGateEvents()`. Create test file with 30+ assertions. `resolveQualityLevel()` reads `quality_level` from preferences.md frontmatter (direct file read like D016 pattern, or via loadEffectiveGSDPreferences). `buildQualityInstructions()` is synchronous, returns string. Fast=empty. Standard=pre-task (codebase scan, context7 conditional) + post-task (diff review, test for new exports). Strict=all standard + mandatory test baseline + full test suite + line-by-line diff. Gate events stored in module-level array, flushed to UnitMetrics by caller.
  - Verify: `npx tsx src/resources/extensions/gsd/tests/quality-gating.test.ts` — all pass
  - Done when: Module exports compile, all 30+ test assertions pass, fast mode returns empty string, standard/strict return bounded instruction text

- [x] **T02: Extend preferences, metrics, and prompt template for quality gating** `est:1h`
  - Why: Wires `quality_level` into the existing preferences pipeline (R010), adds `gateEvents` to UnitMetrics (R012), and adds `{{quality}}` template variable to execute-task.md (R011). These are the integration touchpoints.
  - Files: `src/resources/extensions/gsd/preferences.ts`, `src/resources/extensions/gsd/metrics.ts`, `src/resources/extensions/gsd/prompts/execute-task.md`, `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts`
  - Do: (1) Add `quality_level?: "fast" | "standard" | "strict"` to `GSDPreferences`, validate in `validatePreferences()`, merge in `mergePreferences()`. (2) Add `gateEvents?: GateEvent[]` to `UnitMetrics`. (3) Add `{{quality}}` placeholder to execute-task.md — pre-task block before `{{taskPlanInline}}`, post-task block after step 9 (before `{{corrections}}`). (4) In auto.ts `buildExecuteTaskPrompt()`, add `quality: buildQualityVar()` to loadPrompt vars, where `buildQualityVar()` calls `resolveQualityLevel()` → `buildQualityInstructions()`. (5) In auto.ts post-completion, flush gate events into metrics via `snapshotUnitMetrics` or direct ledger update. (6) Create integration test file with 15+ assertions.
  - Verify: `npx tsx src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — all pass; `npx tsc --noEmit` compiles; existing tests still pass
  - Done when: `quality_level` is parsed from preferences.md, validated/merged correctly; `{{quality}}` produces appropriate content in dispatch prompts; gate events round-trip through metrics.json

- [x] **T03: Add quality gate summary to dashboard overlay and finalize** `est:45m`
  - Why: Completes R012 visibility requirement — gate metrics must be visible in dashboard. Also runs full verification suite and proves the slice goal.
  - Files: `src/resources/extensions/gsd/dashboard-overlay.ts`, `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts`
  - Do: (1) In `buildContentLines()`, after the Cost & Usage section and before the help footer, add a quality gate summary section: header row "Quality Gates", summary line showing quality level + gate counts by outcome (e.g., "Quality: standard · 3 passed, 1 warned"). Only show section when gate events exist in the ledger. (2) Add dashboard rendering assertions to integration test: verify summary line appears with correct counts when gate events are present, verify section is absent when no gate events exist. (3) Run full verification: all quality-gating tests, all existing tests, TypeScript compilation.
  - Verify: All tests pass; dashboard renders quality summary correctly; `npx tsc --noEmit` clean
  - Done when: Dashboard shows quality gate summary when events exist, hides it when none; all slice verification checks pass; all existing tests pass

## Files Likely Touched

- `src/resources/extensions/gsd/quality-gating.ts` (new)
- `src/resources/extensions/gsd/tests/quality-gating.test.ts` (new)
- `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` (new)
- `src/resources/extensions/gsd/preferences.ts`
- `src/resources/extensions/gsd/metrics.ts`
- `src/resources/extensions/gsd/prompts/execute-task.md`
- `src/resources/extensions/gsd/auto.ts`
- `src/resources/extensions/gsd/dashboard-overlay.ts`
