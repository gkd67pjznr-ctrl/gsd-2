# S04: Quality Gating — Research

**Date:** 2026-03-11

## Summary

Quality Gating (S04) adds configurable enforcement levels (`fast`/`standard`/`strict`) to gsd2's dispatch pipeline. This is a cleanly scoped slice with no dependencies on S01–S03. The work spans four concerns: (1) a `quality_level` field in the existing `preferences.md` / `GSDPreferences` interface, (2) a `quality-gating.ts` module that builds quality-specific instructions for dispatch prompts, (3) recording gate execution outcomes in the existing `metrics.json` ledger, and (4) surfacing quality gate summary in the dashboard overlay.

gsdup's quality gating system (5 sentinel gates, 4 outcome states, 3 quality levels) is well-documented in the `RESEARCH.md` from its v7.0 planning. The core design translates directly: gsd2 programmatically controls dispatch prompts, so quality sentinel instructions become a new template variable injected at dispatch time. This is architecturally superior to gsdup's approach of embedding instructions in agent markdown files.

The primary recommendation is to build a thin, focused `quality-gating.ts` module with three exports: `resolveQualityLevel()`, `buildQualityInstructions(level)`, and `recordGateEvent(...)`. Quality instructions are injected via a new `{{quality}}` template variable (per S03's forward intelligence — the `{{corrections}}` variable is already taken by recall injection). Gate events extend the existing `metrics.json` ledger rather than creating a separate JSONL file (per D005).

## Recommendation

**Approach:** Build quality gating as a self-contained TypeScript module that reads from existing preferences and writes to the existing metrics ledger.

**Why:**
- gsd2 already has `GSDPreferences` with validation, merging, and global/project scoping — adding `quality_level` is a 3-line interface change plus validation
- The `loadPrompt()` + template variable system supports arbitrary injection — a new `{{quality}}` variable is trivial to wire
- The metrics ledger (`metrics.json`) already has per-unit records — gate events can be stored as a new field on `UnitMetrics` rather than a separate file
- The dashboard overlay already reads from the metrics ledger and renders per-slice/per-phase data — quality gate summary slots into the existing structure

**Key design decisions to carry forward from D003/D004/D005:**
- Quality level stored in `preferences.md` frontmatter (D003)
- Enforcement via prompt injection template variables (D004)
- Gate metrics stored in existing metrics ledger (D005)

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Quality level storage | `preferences.ts` — `GSDPreferences` interface, validation, merging | Already handles global/project scoping, frontmatter parsing, validation pipeline. Add `quality_level` field |
| Prompt template injection | `prompt-loader.ts` — `loadPrompt(name, vars)` | Already does `{{variable}}` substitution with missing-var detection. Just add `{{quality}}` var |
| Gate event persistence | `metrics.ts` — `UnitMetrics`, `MetricsLedger`, `saveLedger()` | Already writes per-unit data to disk. Extend `UnitMetrics` with `gateEvents` field |
| Dashboard rendering | `dashboard-overlay.ts` — `GSDDashboardOverlay` | Already reads ledger, renders per-phase/per-slice data. Add quality gate summary section |
| Kill switch pattern | `correction_capture` field on `GSDPreferences` | Same pattern: boolean field, checked before action, validated in preferences pipeline |

## Existing Code and Patterns

- `src/resources/extensions/gsd/preferences.ts` — `GSDPreferences` interface is the home for `quality_level`. Follow the `correction_capture` pattern: optional typed field, validated in `validatePreferences()`, merged in `mergePreferences()`. The `loadEffectiveGSDPreferences()` function handles global/project scoping already. `resolveQualityLevel()` should be a new export here or in the quality module
- `src/resources/extensions/gsd/prompt-loader.ts` — `loadPrompt()` validates that all `{{var}}` placeholders have values provided. Adding `{{quality}}` to `execute-task.md` requires passing it in `buildExecuteTaskPrompt()` in auto.ts
- `src/resources/extensions/gsd/auto.ts` lines 1531-1544 — `buildExecuteTaskPrompt()` assembles all template variables and calls `loadPrompt("execute-task", {...})`. This is where `quality: buildQualityVar()` gets added. Also where gate event recording belongs (post-completion hook, alongside correction detection at line ~880)
- `src/resources/extensions/gsd/metrics.ts` — `UnitMetrics` interface and `snapshotUnitMetrics()`. Gate events should be recorded as an optional field on `UnitMetrics` (e.g., `gateEvents?: GateEvent[]`) so they persist alongside token/cost data. The `saveLedger()` function handles disk writes
- `src/resources/extensions/gsd/dashboard-overlay.ts` — `buildContentLines()` method builds the dashboard. Quality gate summary should go after the "Cost & Usage" section, before the help footer. Follow the existing pattern: `hr()`, header row, data rows
- `src/resources/extensions/gsd/recall.ts` — `buildRecallBlock()` is the pattern to follow for `buildQualityInstructions()`: synchronous, non-throwing, returns a string for template injection. The kill switch check pattern (`isCaptureDisabled()`) is reusable for quality level resolution
- `src/resources/extensions/gsd/corrections.ts` — `VALID_QUALITY_LEVELS` Set (`fast`, `standard`, `strict`) already exists here. Reuse or share the constant
- `gsdup/.claude/hooks/lib/write-gate-execution.cjs` — Reference implementation with 5 gate names (`codebase_scan`, `context7_lookup`, `test_baseline`, `test_gate`, `diff_review`), 4 outcomes (`passed`, `warned`, `skipped`, `blocked`), entry validation, rotation, and retention. Adapt the schema for gsd2's metrics ledger format
- `gsdup/.planning/quick/31-quality-gating-metrics-research-and-scop/RESEARCH.md` — Comprehensive research on gsdup's quality gating system, gap analysis, and proposed metrics. The 5-sentinel-step design and gate behavior matrix are directly reusable as the basis for prompt instructions

## Constraints

- **Template variable naming:** Must use `{{quality}}` not `{{corrections}}` — S03's forward intelligence explicitly warns that `{{corrections}}` is taken by recall injection. A new template variable name avoids conflicts
- **Preferences schema backward compat:** `quality_level` must be optional in `GSDPreferences`. Existing preferences files without the field must continue to work (default to `fast` = no behavioral change, per R010)
- **Fast mode = zero change:** At `fast` level, no quality instructions should be injected, no gate events recorded, and no behavioral difference from today's dispatch. This is critical — R010 says "defaulting to fast (zero behavioral change)"
- **Prompt budget:** Quality instructions must be bounded. At `standard` level, the sentinel block should add ~200-400 tokens max. At `strict`, up to ~600 tokens. Must not eat into the ~3K correction recall budget
- **Metrics ledger format:** Adding gate events to `UnitMetrics` means `metrics.json` grows per-unit. Keep gate event data compact (gate name + outcome, not verbose detail text)
- **No runtime dependencies:** Must compile with existing tsconfig, no new npm packages
- **Synchronous template vars:** `loadPrompt()` takes a sync `Record<string, string>` for vars. `buildQualityInstructions()` must be synchronous (like `buildRecallBlock()`)

## Common Pitfalls

- **Overcomplicated gate execution model** — gsdup's gate system has 5 named sentinel steps because it runs actual pre/post-task operations (test baseline, diff review, etc.). gsd2's quality gating is **prompt injection only** — the executing agent decides what to do based on instructions. Don't try to replicate gsdup's multi-step sentinel as a runtime system. Instead, emit instructions that tell the agent to perform codebase scan, context7 lookup, test, and diff review as part of its task execution. The "gate outcome" is self-reported by the agent in the task summary
- **Gate events as separate JSONL** — D005 says extend the existing metrics ledger, not create a separate file. Don't follow gsdup's `gate-executions.jsonl` pattern. Instead, add gate event data to `UnitMetrics` records in `metrics.json`
- **Conflating quality_level preference with quality gating module** — The preference field (`quality_level` on `GSDPreferences`) belongs in `preferences.ts`. The instruction builder (`buildQualityInstructions()`) belongs in a new `quality-gating.ts`. The wiring (reading pref → building instructions → injecting into prompt) belongs in `auto.ts`. Keep the three concerns separated
- **Not testing the fast → no-op path** — The most important behavioral guarantee is that `fast` mode produces zero additional dispatch prompt content and zero gate events. Tests must assert this explicitly
- **Dashboard scope creep** — The dashboard already has a complex rendering pipeline. Quality gate display should be a small summary (e.g., "Quality: standard · 3 gates passed, 1 warned") not a multi-panel analytics view. Save elaborate gate health visualization for R017 (deferred browser dashboard)

## Open Risks

- **Self-reported gate outcomes may be unreliable** — Unlike gsdup where gate execution is programmatic (test runner actually runs, diff is actually computed), gsd2's quality gating relies on the executing agent following instructions. The agent may skip steps under context pressure or report "passed" without actually performing the check. This is an inherent limitation of prompt-based enforcement. Mitigate by keeping instructions concrete (e.g., "run `npx tsx <test>` and paste the output") rather than abstract
- **Metrics ledger size growth** — Adding per-unit gate events increases `metrics.json` size. A 5-gate × 4-field record adds ~200 bytes per unit. For a 50-task milestone, that's ~10KB. Not a real concern for typical projects, but worth noting. The ledger already handles this gracefully (the `saveLedger` function writes atomically)
- **Dashboard overlay rendering complexity** — The overlay already has a lot of content (progress bars, slices, tasks, completed units, cost data). Adding quality gate info needs to fit without making the overlay scroll-heavy. Use the minimal "quality summary line" approach rather than per-gate detail tables
- **Template variable ordering in execute-task.md** — The `{{quality}}` variable needs to be placed meaningfully in the prompt. Placing it before the task plan (as a pre-task instruction) vs. after step 10 (as a verification instruction) affects how the agent prioritizes it. Recommendation: place pre-task instructions (codebase scan, context7 lookup) before the task plan, and post-task instructions (test gate, diff review) after step 9

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| TypeScript | No directly relevant skills | The work is pure internal TS module development |

No external technology skills are needed. This slice extends existing gsd2 TypeScript modules with well-established patterns from the codebase.

## Sources

- gsdup gate execution writer — reference for 5 gate names, 4 outcomes, validation schema (source: `gsdup/.claude/hooks/lib/write-gate-execution.cjs`)
- gsdup gate attribution — reference for category-to-gate mapping and confidence scores (source: `gsdup/.claude/hooks/lib/attribute-gates.cjs`)
- gsdup quality gating research — comprehensive gap analysis and milestone scoping for quality observability (source: `gsdup/.planning/quick/31-quality-gating-metrics-research-and-scop/RESEARCH.md`)
- S03 forward intelligence — explicit guidance to use `{{quality}}` not `{{corrections}}` for quality template variable (source: `.gsd/milestones/M001/slices/S03/S03-SUMMARY.md`)
- gsd2 preferences system — `GSDPreferences` interface, validation, merging, global/project scoping (source: `src/resources/extensions/gsd/preferences.ts`)
- gsd2 metrics system — `UnitMetrics`, `MetricsLedger`, aggregation helpers, dashboard data flow (source: `src/resources/extensions/gsd/metrics.ts`)
- gsd2 prompt loader — template substitution with `{{var}}` syntax and missing-var detection (source: `src/resources/extensions/gsd/prompt-loader.ts`)
- gsd2 auto dispatch — `buildExecuteTaskPrompt()` template variable wiring (source: `src/resources/extensions/gsd/auto.ts:1483-1544`)
- gsd2 dashboard overlay — `buildContentLines()` rendering pipeline (source: `src/resources/extensions/gsd/dashboard-overlay.ts`)

## Requirement Coverage

This slice owns R010, R011, R012 and partially supports R014.

| Req | What This Slice Must Deliver | Risk |
|-----|------------------------------|------|
| R010 | `quality_level` field on `GSDPreferences` (fast/standard/strict), default fast, settable per-project and globally via `/gsd prefs` | Low — extends existing preference system with a typed field |
| R011 | Dispatch prompts at standard/strict include mandatory instructions for codebase scan, Context7 lookup, test step, diff review | Low — `buildQualityInstructions(level)` returns instruction text, injected via `{{quality}}` template variable |
| R012 | Gate execution records in metrics ledger with gate name, outcome, quality level, timestamp; visible in dashboard | Low — extends `UnitMetrics` with optional `gateEvents` field, adds summary line to dashboard overlay |
| R014 (partial) | Quality level resolution (`resolveQualityLevel()`) consumed by S05 for tech debt auto-logging severity gating | Low — this slice exports the resolver, S05 consumes it |

## Architecture Sketch

```
preferences.md (frontmatter)    quality-gating.ts                    auto.ts
┌──────────────┐              ┌────────────────────────┐          ┌──────────────────────┐
│quality_level:│──reads──────▶│resolveQualityLevel()   │◀─calls──│buildQualityVar()     │
│  standard    │              │buildQualityInstructions │──text──▶│  → {{quality}} var   │
└──────────────┘              │recordGateEvent()        │         │                      │
                              └────────┬───────────────┘         │buildExecuteTaskPrompt│
                                       │                          │  → loadPrompt(...)   │
                              metrics.ts (ledger)                 └──────────────────────┘
                              ┌────────────────────────┐
                              │UnitMetrics.gateEvents[] │◀─writes─ snapshotUnitMetrics()
                              └────────────────────────┘
                                       │
                              dashboard-overlay.ts
                              ┌────────────────────────┐
                              │Quality gate summary row │──reads── getLedger()
                              └────────────────────────┘
```

## Gate Instruction Content (Draft)

### Standard Level
```
## Pre-Task Quality Check
Before implementing, scan the codebase for existing patterns related to this task:
- Use `rg` or `find` to check if similar functionality already exists
- If this task involves a new external library, use `resolve_library` + `get_library_docs` to verify API assumptions

## Post-Task Quality Check  
After implementation, before writing the summary:
- Review your changes: `git diff --stat` and scan for naming conflicts, leftover TODOs, and unhandled error paths
- If you created new exported functions/classes, verify tests cover them
```

### Strict Level (adds to standard)
```
## Pre-Task Quality Check (Strict)
[includes all standard checks, plus:]
- Always use `resolve_library` + `get_library_docs` for ANY library/framework API used in this task, not just new ones
- Run existing tests before making changes to establish a baseline

## Post-Task Quality Check (Strict)
[includes all standard checks, plus:]
- Run the full test suite after changes — new tests AND existing tests must pass
- If any test fails, fix it before proceeding
- Review `git diff` line-by-line for logic correctness, not just naming/style
```

### Fast Level
No additional instructions injected. `{{quality}}` variable returns empty string.
