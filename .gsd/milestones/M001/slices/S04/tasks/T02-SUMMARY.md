---
id: T02
parent: S04
milestone: M001
provides:
  - quality_level field on GSDPreferences with validation and merging
  - gateEvents optional field on UnitMetrics interface
  - "{{quality}} template variable in execute-task.md"
  - buildQualityVar() in auto.ts wired into buildExecuteTaskPrompt()
  - gate event flushing to metrics in post-completion block
key_files:
  - src/resources/extensions/gsd/preferences.ts
  - src/resources/extensions/gsd/metrics.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/prompts/execute-task.md
  - src/resources/extensions/gsd/tests/quality-gating-integration.test.ts
key_decisions:
  - "Single {{quality}} variable placed before {{taskPlanInline}} in template — avoids needing two separate pre/post variables since instructions are clearly labeled internally"
  - Gate events flushed at the central metrics snapshot point (covers all unit types, not just execute-task) — uses copy-on-read from getGateEvents() then clearGateEvents()
patterns_established:
  - buildQualityVar() follows same pattern as buildCorrectionsVar() — zero-arg function returning string for loadPrompt vars
  - quality_level validation follows same pattern as skill_discovery — local Set of valid values, strip invalid with error message
observability_surfaces:
  - "quality_level visible in parsed preferences via renderPreferencesForSystemPrompt validation"
  - "gateEvents visible in metrics.json on each UnitMetrics entry"
  - "{{quality}} content visible in dispatched execute-task prompt"
  - "invalid quality_level silently stripped in validation (shows 'some preference values were ignored' warning)"
duration: 15min
verification_result: passed
blocker_discovered: false
completed_at: "2026-03-11"
---

# T02: Extend preferences, metrics, and prompt template for quality gating

**Wired quality_level into preferences pipeline, gateEvents into metrics ledger, {{quality}} into dispatch template, and buildQualityVar() into auto.ts — 28 integration test assertions passing.**

## What Happened

Extended 4 existing modules and created 1 integration test file:

1. **preferences.ts** — Added `QualityLevelPref` type and `quality_level?: QualityLevelPref` to `GSDPreferences`. Added validation in `validatePreferences()` using same pattern as `skill_discovery` (local Set of valid values, strip invalid with error). Added merge in `mergePreferences()` using `override ?? base` pattern.

2. **metrics.ts** — Imported `GateEvent` type from `quality-gating.ts`. Added optional `gateEvents?: GateEvent[]` to `UnitMetrics` interface. No changes to `snapshotUnitMetrics()` — gate events are attached by auto.ts after snapshot.

3. **execute-task.md** — Added single `{{quality}}` placeholder before `{{taskPlanInline}}`. The variable holds the full formatted instruction text (pre-task + post-task sections clearly labeled) or empty string for fast mode.

4. **auto.ts** — Imported `resolveQualityLevel`, `buildQualityInstructions`, `getGateEvents`, `clearGateEvents`. Added `buildQualityVar()` (same pattern as `buildCorrectionsVar()`). Added `quality: buildQualityVar()` to loadPrompt vars in `buildExecuteTaskPrompt()`. In the central post-completion block, flush gate events to the unit record via `getGateEvents()` → attach to `unitRecord.gateEvents` → `clearGateEvents()`.

5. **quality-gating-integration.test.ts** — 28 assertions covering preferences interface acceptance, validation pass/fail, merge semantics, template placeholder presence, loadPrompt success with empty/standard/strict quality vars, GateEvent JSON round-trip through metrics.json, and backward compatibility (units without gateEvents).

## Verification

- `npx tsx src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — **28 passed, 0 failed**
- `npx tsx src/resources/extensions/gsd/tests/quality-gating.test.ts` — **59 passed, 0 failed** (no regression)
- `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` — **22 passed, 0 failed** (no regression)
- `npx tsx src/resources/extensions/gsd/tests/corrections-io.test.ts` — **26 passed, 0 failed** (no regression)
- `npx tsc --noEmit` — clean compilation

## Diagnostics

- **Inspect quality_level in preferences:** `renderPreferencesForSystemPrompt()` will show validation warnings if invalid quality_level is set
- **Inspect gate events in metrics:** Read `metrics.json`, each unit's `gateEvents` field (array of `{gate, outcome, level, timestamp}`)
- **Inspect quality instructions in prompt:** The `{{quality}}` content in dispatched prompts contains the full instruction text or empty string
- **Check template variable:** `grep '{{quality}}' src/resources/extensions/gsd/prompts/execute-task.md`

## Deviations

- Gate events are flushed at the **central** metrics snapshot point (covers all unit types) rather than only in a task-specific post-completion block. This is because the central point already handles all unit lifecycle and is where the `snapshotUnitMetrics` return value is available.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/preferences.ts` — Added `QualityLevelPref` type, `quality_level` field, validation, merging
- `src/resources/extensions/gsd/metrics.ts` — Added `GateEvent` import, `gateEvents?` on `UnitMetrics`
- `src/resources/extensions/gsd/auto.ts` — Added quality-gating imports, `buildQualityVar()`, template var wiring, gate event flushing
- `src/resources/extensions/gsd/prompts/execute-task.md` — Added `{{quality}}` placeholder
- `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — Created with 28 integration assertions
