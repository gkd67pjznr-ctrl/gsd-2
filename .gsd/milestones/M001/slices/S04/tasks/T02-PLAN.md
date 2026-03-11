---
estimated_steps: 5
estimated_files: 6
---

# T02: Extend preferences, metrics, and prompt template for quality gating

**Slice:** S04 — Quality Gating
**Milestone:** M001

## Description

Wire quality gating into the existing systems: add `quality_level` to the preferences pipeline (R010), add `gateEvents` to UnitMetrics (R012), add the `{{quality}}` template variable to execute-task.md (R011), and connect it all in auto.ts. Create integration tests proving the wiring works end-to-end.

## Steps

1. Extend `GSDPreferences` in `preferences.ts`:
   - Add `quality_level?: "fast" | "standard" | "strict"` to the interface
   - In `validatePreferences()`: validate against allowed values, strip invalid (same pattern as `skill_discovery` validation)
   - In `mergePreferences()`: add `quality_level: override.quality_level ?? base.quality_level` (project overrides global)

2. Extend `UnitMetrics` in `metrics.ts`:
   - Import `GateEvent` type from `quality-gating.ts`
   - Add `gateEvents?: GateEvent[]` to `UnitMetrics` interface
   - No changes to `snapshotUnitMetrics()` — gate events will be set by auto.ts after snapshot

3. Modify `execute-task.md` prompt template:
   - Add `{{quality}}` placeholder in two locations:
     - **Pre-task block**: Insert before `{{taskPlanInline}}` (after the resume/carry-forward sections) — this is where codebase scan and context7 lookup instructions go
     - **Post-task block**: Insert after step 9 and before `{{corrections}}` (step 10 block) — this is where diff review and test gate instructions go
   - The variable holds the full formatted instruction text (or empty string for fast mode)
   - Actually: use a single `{{quality}}` variable that contains both pre-task and post-task sections clearly labeled. This avoids needing two template variables. Place it before `{{taskPlanInline}}` — the instructions are clear enough that pre/post ordering within the block is sufficient.

4. Wire in `auto.ts`:
   - Import `resolveQualityLevel`, `buildQualityInstructions`, `getGateEvents`, `clearGateEvents` from `quality-gating.ts`
   - Add `buildQualityVar()` function (like `buildCorrectionsVar()`): calls `resolveQualityLevel()` → `buildQualityInstructions(level)`, returns the string
   - In `buildExecuteTaskPrompt()`, add `quality: buildQualityVar()` to the loadPrompt vars object
   - In the post-completion block (near line ~880 where correction detection happens): flush gate events to the unit metrics record — get the unit from `snapshotUnitMetrics()` return value, attach `gateEvents: getGateEvents()`, then `clearGateEvents()`

5. Create `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` with 15+ assertions:
   - `quality_level` parsed from preferences.md frontmatter correctly
   - `quality_level` validated: invalid values stripped
   - `quality_level` merged: project overrides global
   - `quality_level` missing: undefined (falls back to fast in resolveQualityLevel)
   - `{{quality}}` variable in execute-task.md is declared (template has the placeholder)
   - loadPrompt("execute-task", {...}) with quality="" succeeds (fast mode)
   - loadPrompt("execute-task", {...}) with quality=standardInstructions succeeds
   - GateEvent round-trips through metrics.json (write UnitMetrics with gateEvents, read back, verify)
   - UnitMetrics without gateEvents still loads correctly (backward compat)
   - All existing tests still pass (run recall.test.ts, corrections-io.test.ts as smoke)

## Must-Haves

- [ ] `quality_level` field on `GSDPreferences` with validation and merging
- [ ] `gateEvents` optional field on `UnitMetrics` interface
- [ ] `{{quality}}` template variable in execute-task.md
- [ ] `buildQualityVar()` in auto.ts wired into `buildExecuteTaskPrompt()`
- [ ] Gate events flushed to metrics in post-completion block
- [ ] 15+ integration test assertions pass
- [ ] All existing tests still pass

## Verification

- `npx tsx src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — all pass
- `npx tsx src/resources/extensions/gsd/tests/quality-gating.test.ts` — still all pass
- `npx tsc --noEmit` — compiles clean
- `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` — still passes (no regression)

## Observability Impact

- Signals added/changed: `quality_level` visible in parsed preferences; `gateEvents` visible in metrics.json per unit; `{{quality}}` content visible in dispatch prompt
- How a future agent inspects this: read `metrics.json` for `gateEvents` on any unit; read preferences.md for `quality_level`; grep execute-task.md for `{{quality}}`
- Failure state exposed: invalid `quality_level` silently stripped in validation (logged as validation error); missing `{{quality}}` in template would throw from loadPrompt's missing-var detection

## Inputs

- `src/resources/extensions/gsd/quality-gating.ts` — T01 output: `resolveQualityLevel()`, `buildQualityInstructions()`, `GateEvent`, gate event functions
- `src/resources/extensions/gsd/preferences.ts` — existing `GSDPreferences`, `validatePreferences()`, `mergePreferences()`
- `src/resources/extensions/gsd/metrics.ts` — existing `UnitMetrics`, ledger I/O
- `src/resources/extensions/gsd/auto.ts` — existing `buildExecuteTaskPrompt()`, `buildCorrectionsVar()` pattern
- `src/resources/extensions/gsd/prompts/execute-task.md` — existing template with `{{corrections}}` variable

## Expected Output

- `src/resources/extensions/gsd/preferences.ts` — updated with `quality_level` field, validation, merging
- `src/resources/extensions/gsd/metrics.ts` — updated with `gateEvents` on UnitMetrics
- `src/resources/extensions/gsd/prompts/execute-task.md` — updated with `{{quality}}` placeholder
- `src/resources/extensions/gsd/auto.ts` — updated with `buildQualityVar()` and gate event flush
- `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — 15+ passing integration assertions
