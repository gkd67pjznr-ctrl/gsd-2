---
id: T03
parent: S04
milestone: M001
provides:
  - Quality gate summary section in dashboard overlay (visible when gate events exist)
  - aggregateGateOutcomes() and formatGateSummaryLine() exported helpers for testing
key_files:
  - src/resources/extensions/gsd/dashboard-overlay.ts
  - src/resources/extensions/gsd/tests/quality-gating-integration.test.ts
key_decisions:
  - Extracted aggregateGateOutcomes() and formatGateSummaryLine() as exported functions to enable testing without mocking the full dashboard overlay (TUI, Theme, state loading dependencies)
patterns_established:
  - Dashboard section conditional rendering tested via exported aggregation helpers rather than full overlay instantiation
observability_surfaces:
  - Dashboard overlay shows quality gate summary between Cost & Usage and help footer when gate events exist in ledger
  - aggregateGateOutcomes() returns null (no section) or GateOutcomeCounts for inspection
duration: 15m
verification_result: passed
completed_at: 2026-03-11
blocker_discovered: false
---

# T03: Add quality gate summary to dashboard overlay and finalize

**Added quality gate summary section to dashboard overlay showing quality level and gate outcome counts, completing the slice.**

## What Happened

Added a "Quality Gates" section to the dashboard overlay in `buildContentLines()`, positioned after the Cost & Usage section and before the help footer. The section:

- Scans all units in the metrics ledger for `gateEvents` arrays
- If any gate events exist: renders an hr, "Quality Gates" header, and a summary line like `Quality: standard · 3 passed, 1 warned`
- Omits zero-count outcomes from the summary (e.g., if no blocked events, "blocked" doesn't appear)
- Uses theme colors: `success` for passed, `warning` for warned/blocked, `dim` for skipped
- If no gate events exist in any unit (fast mode or no completed units): skips the section entirely

Extracted `aggregateGateOutcomes()` and `formatGateSummaryLine()` as exported functions to enable testing without needing to instantiate the full dashboard overlay (which requires TUI, Theme, and state loading infrastructure).

Added 26 new assertions to the integration test covering:
- aggregateGateOutcomes returns null for no events, empty arrays, missing gateEvents
- Correct counting across multiple units with mixed outcomes
- Mixed units (some with, some without gate events)
- formatGateSummaryLine with all outcome types, single outcome, zero counts omitted
- Fast mode simulation (null aggregation → no quality section)
- Standard mode simulation (non-null aggregation → section shown with correct counts)

## Verification

All slice verification checks pass:
- `npx tsx src/resources/extensions/gsd/tests/quality-gating.test.ts` — 59 passed, 0 failed ✓
- `npx tsx src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — 54 passed, 0 failed ✓
- `npx tsc --noEmit` — clean ✓
- `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` — 22 passed, 0 failed ✓
- `npx tsx src/resources/extensions/gsd/tests/corrections-io.test.ts` — 26 passed, 0 failed ✓

Mode behavior verified:
- **fast**: no quality section in dashboard (aggregateGateOutcomes returns null), no gate events, empty `{{quality}}` in prompt
- **standard**: quality instructions in prompt, gate events recordable, dashboard shows summary with level and counts
- **strict**: stricter quality instructions in prompt, same gate event flow, dashboard renders correctly

## Diagnostics

- **Inspect quality section:** Open dashboard overlay (Ctrl+Alt+G) — quality gates section appears between Cost & Usage and help footer when gate events exist
- **Inspect aggregation:** `aggregateGateOutcomes(units)` returns `GateOutcomeCounts | null` — null means no section
- **Inspect formatted line:** `formatGateSummaryLine(level, counts)` returns the plain-text summary
- **Read metrics directly:** `metrics.json` → each unit's `gateEvents` field (array of `{gate, outcome, level, timestamp}`)

## Deviations

Extracted `aggregateGateOutcomes()` and `formatGateSummaryLine()` as exported helper functions rather than testing the dashboard render directly. The dashboard overlay class is tightly coupled to TUI infrastructure (Theme, requestRender, state loading) making full instantiation impractical in unit tests. This approach tests the actual logic while keeping tests fast and reliable.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/dashboard-overlay.ts` — Added quality gate summary section, aggregateGateOutcomes() and formatGateSummaryLine() exports
- `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — Extended with 26 dashboard rendering assertions
