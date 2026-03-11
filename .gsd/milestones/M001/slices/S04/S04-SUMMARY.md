---
id: S04
parent: M001
milestone: M001
provides:
  - quality_level field on GSDPreferences (fast/standard/strict) with validation and merging
  - resolveQualityLevel() for quality level resolution from preferences
  - buildQualityInstructions(level) returning bounded prompt injection text
  - GateEvent type with 5 gate names, 4 outcome states, recording and retrieval
  - "{{quality}} template variable in execute-task.md wired via auto.ts"
  - gateEvents field on UnitMetrics for metrics ledger persistence
  - Quality gate summary section in dashboard overlay
  - aggregateGateOutcomes() and formatGateSummaryLine() exported for testing and consumption
requires:
  - slice: none
    provides: independent of S01-S03
affects:
  - S05
key_files:
  - src/resources/extensions/gsd/quality-gating.ts
  - src/resources/extensions/gsd/tests/quality-gating.test.ts
  - src/resources/extensions/gsd/tests/quality-gating-integration.test.ts
  - src/resources/extensions/gsd/preferences.ts
  - src/resources/extensions/gsd/metrics.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/prompts/execute-task.md
  - src/resources/extensions/gsd/dashboard-overlay.ts
key_decisions:
  - Gate instruction content uses concrete tool names (rg, find, resolve_library, get_library_docs, git diff) rather than abstract descriptions
  - VALID_QUALITY_LEVELS redefined locally in quality-gating.ts to avoid tight coupling with corrections.ts
  - "Single {{quality}} variable in template (pre+post sections internally labeled) instead of separate pre/post variables"
  - Gate events flushed at central metrics snapshot point in auto.ts (covers all unit types)
  - Dashboard quality section tested via exported aggregation helpers rather than full TUI instantiation
patterns_established:
  - Non-throwing quality module pattern matching recall.ts (synchronous, returns empty/default on error)
  - Module-level pending array for gate events with copy-on-read safety
  - buildQualityVar() follows same zero-arg pattern as buildCorrectionsVar() for loadPrompt vars
  - quality_level validation follows same pattern as skill_discovery (local Set, strip invalid)
observability_surfaces:
  - getGateEvents() returns pending gate events with structured gate/outcome/level/timestamp
  - resolveQualityLevel() silently falls back to "fast" on any error
  - recordGateEvent() silently drops invalid events — never throws
  - gateEvents visible in metrics.json on each UnitMetrics entry
  - Dashboard overlay shows quality gate summary between Cost & Usage and help footer
  - aggregateGateOutcomes() returns null (no section) or GateOutcomeCounts for inspection
drill_down_paths:
  - .gsd/milestones/M001/slices/S04/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S04/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S04/tasks/T03-SUMMARY.md
duration: 42m
verification_result: passed
completed_at: 2026-03-11
---

# S04: Quality Gating

**Configurable quality level (fast/standard/strict) injects bounded prompt instructions into task dispatch, records gate events in the metrics ledger, and renders a summary in the dashboard overlay — with zero behavioral change at the default fast level.**

## What Happened

Built the quality gating system across 3 tasks:

**T01 — Core module** (`quality-gating.ts`): Created `resolveQualityLevel()` which reads `quality_level` from effective preferences and falls back to "fast" on any error. `buildQualityInstructions()` is synchronous and returns: empty string for fast (zero behavioral change), ~130 tokens for standard (pre-task codebase scan + Context7 for new deps, post-task diff review + test check), ~200 tokens for strict (adds mandatory Context7, test baseline, full suite, line-by-line diff). Gate event management via `recordGateEvent()` (validates against 5 gate names and 4 outcomes, silently drops invalid), `getGateEvents()` (copy-on-read), and `clearGateEvents()`.

**T02 — Integration wiring** (preferences, metrics, template, auto.ts): Added `quality_level?: "fast" | "standard" | "strict"` to `GSDPreferences` with validation and merging. Added `gateEvents?: GateEvent[]` to `UnitMetrics`. Added `{{quality}}` placeholder to execute-task.md before `{{taskPlanInline}}`. Wired `buildQualityVar()` into `buildExecuteTaskPrompt()` following the same pattern as `buildCorrectionsVar()`. Gate events flushed to unit metrics record at the central post-completion point.

**T03 — Dashboard and finalization** (dashboard-overlay.ts): Added "Quality Gates" section after Cost & Usage, rendering quality level and outcome counts (e.g., "Quality: standard · 3 passed, 1 warned"). Section omitted when no gate events exist. Extracted `aggregateGateOutcomes()` and `formatGateSummaryLine()` as exported functions for testability.

## Verification

- `quality-gating.test.ts` — 59 passed, 0 failed (core module: all levels, gate events, token budgets, validation)
- `quality-gating-integration.test.ts` — 54 passed, 0 failed (preferences, metrics, template, dashboard)
- `recall.test.ts` — 22 passed, 0 failed (no regression)
- `corrections-io.test.ts` — 26 passed, 0 failed (no regression)
- `npx tsc --noEmit` — clean compilation
- Total: 161 test assertions, all passing

## Requirements Advanced

- R010 — quality_level field added to GSDPreferences with validation, merging, defaults to fast
- R011 — buildQualityInstructions() generates bounded prompt injection text; {{quality}} template variable wired in auto.ts
- R012 — GateEvent type with recording/retrieval, gateEvents on UnitMetrics, dashboard summary section

## Requirements Validated

- R010 — 28 integration test assertions prove quality_level on GSDPreferences: validation accepts valid/rejects invalid, merge semantics work, resolveQualityLevel() reads from preferences and defaults to fast
- R011 — 59 core test assertions prove buildQualityInstructions() returns empty for fast, bounded content for standard/strict with correct keywords; integration tests prove {{quality}} template substitution works in execute-task.md
- R012 — Tests prove GateEvent creation/validation/recording/retrieval, gateEvents round-trip through metrics.json, dashboard aggregation and rendering with correct counts

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- Token budgets came in well under plan limits: standard ~130 tokens vs ≤400 budget, strict ~200 tokens vs ≤600 budget. Instructions are more concise than planned but contain all required gate content.
- Dashboard quality section tested via exported helper functions rather than full overlay instantiation (TUI infrastructure too coupled for unit tests).

## Known Limitations

- Gate events are stored in a module-level array and flushed to metrics at task completion. If the process crashes mid-task, pending gate events are lost. This matches the existing metrics pattern (snapshotUnitMetrics also requires completion).
- No CLI surface for setting quality_level — must be set manually in `.gsd/preferences.md` or via `/gsd prefs`.
- Gate events are recorded by the calling code (auto.ts or future consumers), not automatically by the quality module itself. The module provides the infrastructure; actual gate recording happens at execution points.

## Follow-ups

- S05 consumes `resolveQualityLevel()` to gate tech debt auto-logging severity
- Future: actual gate recording at execution points (codebase scan, Context7 lookup, test runs) — currently the infrastructure exists but gates are recorded by callers

## Files Created/Modified

- `src/resources/extensions/gsd/quality-gating.ts` — new module: types, constants, resolveQualityLevel, buildQualityInstructions, gate event management
- `src/resources/extensions/gsd/tests/quality-gating.test.ts` — 59 test assertions for core module
- `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — 54 integration test assertions
- `src/resources/extensions/gsd/preferences.ts` — added QualityLevelPref type, quality_level field, validation, merging
- `src/resources/extensions/gsd/metrics.ts` — added GateEvent import, gateEvents? on UnitMetrics
- `src/resources/extensions/gsd/auto.ts` — added quality-gating imports, buildQualityVar(), template var wiring, gate event flushing
- `src/resources/extensions/gsd/prompts/execute-task.md` — added {{quality}} placeholder
- `src/resources/extensions/gsd/dashboard-overlay.ts` — added quality gate summary section, exported helpers

## Forward Intelligence

### What the next slice should know
- `resolveQualityLevel()` is the API to consume — it handles all preference reading and error fallback internally
- Gate events use module-level storage: call `getGateEvents()` to read, `clearGateEvents()` after flushing to metrics
- The `{{quality}}` variable in execute-task.md already includes tech debt auto-logging instructions at standard/strict levels — S05 may want to extend or replace that content

### What's fragile
- `quality_level` is read via `loadEffectiveGSDPreferences()` which caches `PROJECT_PREFERENCES_PATH` at module load time via `process.cwd()` — same pattern issue as D016. If S05 needs cwd-relative quality level reading, use the direct file read pattern.

### Authoritative diagnostics
- `getGateEvents()` returns the current pending events — trust this over trying to read metrics.json mid-task
- `aggregateGateOutcomes(units)` returns null or counts — use this to verify dashboard rendering logic

### What assumptions changed
- Token budgets were generous — instructions fit in ~130-200 tokens vs the 400-600 budget. This leaves headroom for S05 to add tech debt instructions without budget pressure.
