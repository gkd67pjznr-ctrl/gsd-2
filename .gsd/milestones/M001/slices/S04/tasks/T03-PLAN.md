---
estimated_steps: 4
estimated_files: 3
---

# T03: Add quality gate summary to dashboard overlay and finalize

**Slice:** S04 — Quality Gating
**Milestone:** M001

## Description

Complete the visibility requirement (R012) by adding a quality gate summary section to the dashboard overlay. The summary shows the configured quality level and gate outcome counts, appearing after the Cost & Usage section when gate events exist in the metrics ledger. Run full verification suite to prove the slice goal.

## Steps

1. In `dashboard-overlay.ts` `buildContentLines()`, after the Cost & Usage section (after the models and avg/unit lines, before the help footer):
   - Scan all units in the ledger for `gateEvents` arrays
   - If any gate events exist across any unit:
     - Add `hr()`, header row "Quality Gates"
     - Resolve current quality level via `resolveQualityLevel()` — display as `Quality: <level>`
     - Aggregate gate outcomes across all units: count passed, warned, skipped, blocked
     - Render summary line: `"Quality: standard · 5 passed, 2 warned, 1 skipped"` (omit zero-count outcomes)
     - Use existing theme colors: `success` for passed count, `warning` for warned/blocked counts, `dim` for skipped
   - If no gate events exist in any unit: skip the section entirely (fast mode or no completed units)

2. Add dashboard rendering assertions to `quality-gating-integration.test.ts`:
   - Create a mock ledger with units containing gateEvents
   - Verify the dashboard output contains "Quality Gates" header when events exist
   - Verify the summary line contains correct counts
   - Create a mock ledger with units without gateEvents
   - Verify the dashboard output does NOT contain "Quality Gates" when no events exist
   - Note: dashboard rendering tests may need to mock the `getLedger()` return or create a test harness. Follow the existing test pattern — if the dashboard is too coupled to render directly, test the aggregation logic separately and verify the section appears/disappears based on gate event presence

3. Run full verification suite:
   - `npx tsx src/resources/extensions/gsd/tests/quality-gating.test.ts` — all pass
   - `npx tsx src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — all pass
   - `npx tsc --noEmit` — clean compilation
   - `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` — no regression
   - `npx tsx src/resources/extensions/gsd/tests/corrections-io.test.ts` — no regression

4. Fix any failures found during full verification. Verify that:
   - `fast` mode: no quality section in dashboard, no gate events, empty `{{quality}}` in prompt
   - `standard` mode: quality instructions in prompt, gate events recordable, dashboard shows summary
   - `strict` mode: stricter quality instructions in prompt, same gate event flow

## Must-Haves

- [ ] Dashboard shows quality gate summary section when gate events exist in ledger
- [ ] Dashboard hides quality gate section when no gate events exist (fast mode / no data)
- [ ] Summary line shows quality level and outcome counts with appropriate colors
- [ ] All quality-gating tests pass (30+ core + 15+ integration)
- [ ] All existing tests pass (no regression)
- [ ] TypeScript compiles clean

## Verification

- `npx tsx src/resources/extensions/gsd/tests/quality-gating.test.ts` — all pass
- `npx tsx src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — all pass
- `npx tsc --noEmit` — clean
- `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` — passes
- `npx tsx src/resources/extensions/gsd/tests/corrections-io.test.ts` — passes

## Observability Impact

- Signals added/changed: Quality gate summary visible in TUI dashboard overlay; gate outcome counts aggregated from metrics ledger
- How a future agent inspects this: open dashboard overlay (Ctrl+Alt+G) or read metrics.json directly; quality section appears between Cost & Usage and help footer
- Failure state exposed: if dashboard crashes during quality section rendering, the error is caught by the existing overlay error handling (the overlay wraps rendering in try/catch)

## Inputs

- `src/resources/extensions/gsd/dashboard-overlay.ts` — existing `buildContentLines()` with Cost & Usage section pattern
- `src/resources/extensions/gsd/metrics.ts` — `getLedger()`, `UnitMetrics` with `gateEvents` field (from T02)
- `src/resources/extensions/gsd/quality-gating.ts` — `resolveQualityLevel()`, `GateEvent` type (from T01)
- `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — existing integration test file (from T02) to extend

## Expected Output

- `src/resources/extensions/gsd/dashboard-overlay.ts` — updated with quality gate summary section
- `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — extended with dashboard rendering assertions
- All slice verification checks passing
