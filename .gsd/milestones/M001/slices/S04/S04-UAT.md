# S04: Quality Gating — UAT

**Milestone:** M001
**Written:** 2026-03-11

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: Quality gating is a data pipeline (preferences → instructions → gate events → metrics → dashboard). All inputs and outputs are structured data testable with fixtures. No live runtime, user interaction, or visual rendering required — 113 test assertions cover the full pipeline from preference parsing through dashboard rendering.

## Preconditions

- Repository cloned and dependencies installed (`npm install`)
- TypeScript compilation clean (`npx tsc --noEmit`)

## Smoke Test

Run `npx tsx src/resources/extensions/gsd/tests/quality-gating.test.ts` — expect 59 passed, 0 failed. This confirms the core module resolves quality levels, builds instructions, and manages gate events.

## Test Cases

### 1. Quality level resolution

1. Call `resolveQualityLevel()` with no preferences file present
2. **Expected:** Returns "fast" (default)

### 2. Fast mode produces zero change

1. Call `buildQualityInstructions("fast")`
2. **Expected:** Returns empty string — no additional prompt content, no gate events, no behavioral change

### 3. Standard mode produces bounded instructions

1. Call `buildQualityInstructions("standard")`
2. **Expected:** Non-empty string containing codebase_scan, context7_lookup, diff_review keywords; token count ≤ 400

### 4. Strict mode produces all standard content plus extras

1. Call `buildQualityInstructions("strict")`
2. **Expected:** Contains all standard keywords plus test_baseline, test_gate; token count ≤ 600

### 5. Gate event recording and retrieval

1. Call `recordGateEvent({ gate: "codebase_scan", outcome: "passed", level: "standard", timestamp: "..." })`
2. Call `getGateEvents()`
3. **Expected:** Returns array with the recorded event

### 6. Invalid gate events silently dropped

1. Call `recordGateEvent({ gate: "invalid_gate", outcome: "passed", level: "standard", timestamp: "..." })`
2. Call `getGateEvents()`
3. **Expected:** Array does not contain the invalid event

### 7. Preferences integration

1. Set `quality_level: standard` in GSDPreferences
2. Run `validatePreferences()` on the object
3. **Expected:** Validation passes, quality_level preserved

### 8. Template variable substitution

1. Load execute-task.md prompt template
2. Pass `quality: buildQualityInstructions("standard")` as variable
3. **Expected:** `{{quality}}` replaced with instruction text in output

### 9. Metrics round-trip

1. Create a UnitMetrics entry with `gateEvents` array
2. Write to metrics.json and read back
3. **Expected:** gateEvents array preserved through serialization

### 10. Dashboard rendering with gate events

1. Create units with gateEvents arrays
2. Call `aggregateGateOutcomes(units)`
3. Call `formatGateSummaryLine(level, counts)`
4. **Expected:** Returns formatted string like "Quality: standard · 3 passed, 1 warned"

### 11. Dashboard rendering without gate events

1. Create units with no gateEvents
2. Call `aggregateGateOutcomes(units)`
3. **Expected:** Returns null — no quality section rendered

## Edge Cases

### Invalid quality_level in preferences

1. Set `quality_level: "invalid"` in preferences
2. Run `validatePreferences()`
3. **Expected:** Invalid value stripped, error message returned

### Missing preferences file

1. Call `resolveQualityLevel("/nonexistent/path")`
2. **Expected:** Returns "fast" (graceful fallback)

### Mixed units with and without gate events

1. Create 3 units: one with gateEvents, one without, one with empty array
2. Call `aggregateGateOutcomes(units)`
3. **Expected:** Aggregates only from units that have non-empty gateEvents

## Failure Signals

- `npx tsc --noEmit` reports type errors in quality-gating.ts, preferences.ts, or metrics.ts
- Any of the 113 test assertions fail
- `resolveQualityLevel()` throws instead of returning "fast" on error
- `buildQualityInstructions("fast")` returns non-empty string
- `recordGateEvent()` throws on invalid input instead of silently dropping
- `{{quality}}` placeholder not found in execute-task.md
- Dashboard renders quality section when no gate events exist

## Requirements Proved By This UAT

- R010 — Quality level configuration: quality_level field on GSDPreferences validated, merged, defaults to fast, readable via resolveQualityLevel()
- R011 — Quality sentinel in dispatch prompts: buildQualityInstructions() produces bounded instruction text for standard/strict with correct gate keywords; {{quality}} template variable wired in execute-task.md via auto.ts
- R012 — Quality gate metrics: GateEvent type with 5 gates and 4 outcomes, recording/retrieval validated, gateEvents persisted on UnitMetrics in metrics.json, dashboard summary visible via aggregateGateOutcomes() and formatGateSummaryLine()

## Not Proven By This UAT

- Actual runtime gate execution during auto-mode (gates are recorded by callers, not automatically triggered)
- Real preference file editing via `/gsd prefs` CLI (validation and parsing proven, but CLI surface not exercised)
- Visual dashboard rendering in the TUI (logic proven via exported helpers, but actual TUI rendering with themes not tested)
- Integration with S05 tech debt auto-logging via resolveQualityLevel() (S05 not yet implemented)

## Notes for Tester

- The 113 test assertions (59 core + 54 integration) cover the full quality gating pipeline comprehensively. No manual testing is expected.
- Fast mode is intentionally a no-op — it should produce zero additional content, zero gate events, zero behavioral change. This is a feature, not a bug.
- Token budgets came in under plan limits (~130 for standard, ~200 for strict vs 400/600 budgets). This is fine — the instructions are concise and contain all required gate content.
