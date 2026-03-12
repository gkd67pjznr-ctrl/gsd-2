---
id: M001
provides:
  - Correction capture system with 14-category diagnosis taxonomy, JSONL persistence, programmatic detection (4 signals), and self-report instructions in dispatch prompts
  - Preference engine with automatic promotion at ≥3 corrections, confidence scoring (count/(count+2)), and observer with bounded guardrails
  - Learning loop closure with token-budgeted recall injection (3K cap, 10 slots), correction/preference retirement, and cross-project promotion at 3+ projects
  - Quality gating system with configurable levels (fast/standard/strict), prompt-injected instructions, gate event recording on metrics ledger, and dashboard summary
  - Tech debt register (.gsd/TECH-DEBT.md) with structured TD-NNN entries, auto-logging at standard/strict levels
  - Passive monitoring with plan-vs-summary drift detection feeding into correction system
key_decisions:
  - "D001: Dual correction detection — programmatic (retries, stuck, reverts) + self-report (dispatch prompt instructions)"
  - "D002: JSONL in .gsd/patterns/ for append-heavy correction/preference data; YAML preferences.md for read-heavy config"
  - "D004: Quality enforcement via prompt injection template variables ({{quality}}, {{corrections}})"
  - "D008: Bayesian confidence formula count/(count+2) for preference promotion"
  - "D009: 6 non-negotiable bounded learning guardrails from gsdup"
  - "D012: New TypeScript implementations referencing gsdup designs, not CJS ports"
  - "D013: Correction I/O never throws — returns structured WriteResult with reason"
  - "D019: pattern-preferences.ts naming avoids collision with existing config preferences.ts"
  - "D033: TECH-DEBT.md uses structured markdown for human browsability, not JSONL"
patterns_established:
  - Non-throwing I/O pattern across all modules — structured results or safe defaults, never throws
  - cwd-based path resolution for test isolation throughout correction/preference/debt modules
  - Atomic tmp+rename writes for all JSONL and JSON document mutations
  - Module-level pending arrays with copy-on-read safety for gate events
  - Three-layer dedup for observer suggestions (watermark, active-preference, no-duplicate-pending)
  - Token estimation via words/0.75 for recall budget enforcement
  - GSD_HOME env var for user-level preference test isolation
  - buildXxxVar() zero-arg pattern for template variable builders in auto.ts
observability_surfaces:
  - ".gsd/patterns/corrections.jsonl — raw correction data with diagnosis categories and sources"
  - ".gsd/patterns/preferences.jsonl — promoted preferences with confidence scores"
  - ".gsd/patterns/suggestions.json — observer state with watermark, skipped suggestions, and lifecycle"
  - "~/.gsd/preferences.json — cross-project promoted preferences"
  - ".gsd/TECH-DEBT.md — structured tech debt register browsable during planning"
  - "metrics.json gateEvents on UnitMetrics — quality gate execution records"
  - "Dashboard overlay Quality Gates section — gate outcome summary at a glance"
  - "WriteResult, PromoteResult, AnalyzeResult — structured return types for all mutation operations"
requirement_outcomes:
  - id: R001
    from_status: active
    to_status: active (partial validation)
    proof: "Programmatic detection and self-report wired into auto.ts; 25 detector tests + 82 type tests + 26 I/O tests pass. Contract proven but runtime proof with real auto-mode runs pending."
  - id: R002
    from_status: active
    to_status: validated
    proof: "82 test assertions prove all 14 categories valid, validators reject invalid, type guards enforce membership (S01)"
  - id: R003
    from_status: active
    to_status: validated
    proof: "26 test assertions prove write/read/rotate lifecycle, rotation at threshold, archive collision handling, retention cleanup (S01)"
  - id: R004
    from_status: active
    to_status: validated
    proof: "53 test assertions prove promotion at/below threshold, confidence formula, upsert semantics, atomic writes, structured failure reporting (S02)"
  - id: R005
    from_status: active
    to_status: validated
    proof: "Test assertions prove scope tagging and query-time scope filtering across file, project, global (S02)"
  - id: R006
    from_status: active
    to_status: active (partial validation)
    proof: "40 test assertions prove 4 of 6 guardrails (min corrections, cooldown, auto-dismiss, no-duplicate-pending). User confirmation and co-activation guardrails need runtime or agent composition data."
  - id: R007
    from_status: active
    to_status: validated
    proof: "22 test assertions prove recall assembly with 3K token budget, 10-slot allocation, deduplication, kill switch, self-report preservation. buildCorrectionsVar() calls buildRecallBlock() in auto.ts (S03)"
  - id: R008
    from_status: active
    to_status: validated
    proof: "21 test assertions prove retirement of corrections/preferences, suggestion status updates, idempotency, malformed line preservation (S03)"
  - id: R009
    from_status: active
    to_status: validated
    proof: "29 test assertions prove cross-project tracking, promotion at 3+ projects, upsert semantics, confidence merging, GSD_HOME redirect (S03)"
  - id: R010
    from_status: active
    to_status: validated
    proof: "28 integration tests prove quality_level on GSDPreferences: validation, merge semantics, resolveQualityLevel() defaults to fast (S04)"
  - id: R011
    from_status: active
    to_status: validated
    proof: "59 core tests prove buildQualityInstructions() returns empty for fast, bounded content for standard/strict; integration tests prove {{quality}} template substitution (S04)"
  - id: R012
    from_status: active
    to_status: validated
    proof: "Tests prove GateEvent creation/validation, recording/retrieval, gateEvents round-trip through metrics.json, dashboard aggregation and rendering (S04)"
  - id: R013
    from_status: active
    to_status: validated
    proof: "94 test assertions prove write/read/resolve lifecycle, sequential TD-NNN IDs, all types and severities, lenient parsing, non-throwing errors (S05)"
  - id: R014
    from_status: active
    to_status: validated
    proof: "Integration tests prove tech debt instructions present at standard/strict, absent at fast; instructions reference .gsd/TECH-DEBT.md (S05)"
  - id: R015
    from_status: active
    to_status: validated
    proof: "34 test assertions prove drift detection for expansion/contraction/shift, documented deviation exclusion; grep confirms wiring in auto.ts (S05)"
duration: "~5 hours across 18 tasks in 5 slices"
verification_result: passed
completed_at: 2026-03-11
---

# M001: Adaptive Intelligence

**GSD auto-mode now captures mistakes, promotes patterns to preferences, injects past corrections into future dispatches, enforces configurable quality gates, tracks tech debt, and detects plan-vs-outcome drift — all proven by 550 test assertions across 12 test suites.**

## What Happened

Five slices built the adaptive intelligence system from the ground up, each delivering a self-contained capability that wired into the next.

**S01 (Correction Capture Foundation)** established the data layer: a 14-category diagnosis taxonomy (7 code + 7 process categories), JSONL persistence with validation, rotation, and kill switch, plus programmatic detection of retries, stuck loops, timeouts, and reverts from session data. Self-report instructions were injected into dispatch prompts via a `{{corrections}}` template variable. This slice retired the highest risk — proving corrections can be captured without Claude Code hooks.

**S02 (Preference Engine)** built on S01's correction data: `checkAndPromote()` automatically promotes correction patterns at ≥3 occurrences with Bayesian confidence scoring, while `analyzePatterns()` aggregates across scopes with bounded guardrails (min 3 corrections, 7-day cooldown, no-duplicate-pending, auto-dismiss expired). The observer writes suggestions for skill refinement. Both were wired into auto.ts to run after every task completion.

**S03 (Learning Loop Closure)** closed the loop: `buildRecallBlock()` assembles token-budgeted recall of past corrections and preferences (10 slots, 3K token cap, preferences first, deduplication of promoted corrections) and injects it into dispatch prompts. `retireByCategory()` marks corrections and preferences as retired when skills are refined. `promoteToUserLevel()` promotes preferences appearing in 3+ projects to `~/.gsd/preferences.json`. The `{{corrections}}` variable switched from static instructions to dynamic recall.

**S04 (Quality Gating)** ran independently: configurable quality levels (fast/standard/strict) produce measurably different dispatch prompts — fast adds nothing, standard adds codebase scan + Context7 + diff review (~130 tokens), strict adds mandatory Context7 + test baseline + full suite + line-by-line diff (~200 tokens). Gate events are recorded with 5 gate names × 4 outcomes, persisted on UnitMetrics, and rendered in the dashboard overlay.

**S05 (Tech Debt & Passive Monitoring)** completed the system: `.gsd/TECH-DEBT.md` with sequential TD-NNN entries and auto-logging instructions at standard/strict levels. Plan-vs-summary drift detection runs after each complete-slice, feeding observations into the correction system as `code.scope_drift` or `process.planning_error` entries.

The entire pipeline — capture → promote → recall → gate → monitor — is wired through `auto.ts` with non-fatal error handling at every integration point.

## Cross-Slice Verification

### Success Criterion 1: Corrections captured automatically
**Evidence:** `correction-detector.ts` detects 4 signal types from session data (25 test assertions). `auto.ts` calls `emitProgrammaticCorrections()` at post-completion and `emitStuckCorrection()` at stuck detection. Self-report instructions in `{{corrections}}` template variable. Kill switch via `correction_capture` preference. **MET.**

### Success Criterion 2: Repeated patterns promoted and surfaced
**Evidence:** `checkAndPromote()` promotes at ≥3 with confidence scoring (53 test assertions). Called after every `writeCorrection()` in auto.ts. `buildRecallBlock()` reads preferences and injects them into dispatch prompts (22 test assertions). **MET.**

### Success Criterion 3: Quality level produces different prompts and gate metrics
**Evidence:** `buildQualityInstructions('fast')` returns empty, `standard` returns ~130 tokens with codebase_scan/context7_lookup/diff_review keywords, `strict` returns ~200 tokens adding test_baseline/test_gate (59 test assertions). `{{quality}}` template variable confirmed in execute-task.md. `gateEvents` on UnitMetrics confirmed in metrics.ts. Dashboard quality section with `aggregateGateOutcomes()` confirmed. **MET.**

### Success Criterion 4: Tech debt auto-logged and visible
**Evidence:** `tech-debt.ts` manages `.gsd/TECH-DEBT.md` with logDebt/listDebt/resolveDebt (94 test assertions). Auto-logging instructions present in standard/strict quality instructions (integration tests confirm). **MET.**

### Success Criterion 5: Full auto-mode run produces all data types
**Evidence:** All modules wired into auto.ts execution loop: corrections emitted at post-completion + stuck detection → checkAndPromote called per correction → analyzePatterns after task completion → buildRecallBlock for next dispatch → gate events flushed to metrics → drift detection after complete-slice. TypeScript compiles clean (`tsc --noEmit`). **MET** at the integration wiring level; full runtime proof will come from actual M002+ auto-mode execution.

### Definition of Done
- All 5 slices `[x]` in roadmap ✅
- All 5 slice summaries exist ✅
- 550 test assertions, 0 failures across 12 test suites ✅
- TypeScript compilation clean ✅
- Cross-slice integration points verified: S01→S02 (readCorrections consumed), S02→S03 (readPreferences consumed, promoteToUserLevel wired), S01→S05 (writeCorrection consumed), S04→S05 (resolveQualityLevel consumed) ✅
- `{{corrections}}` and `{{quality}}` template variables in execute-task.md ✅
- `.gsd/patterns/` in gitignore baseline ✅
- correction_capture and quality_level on GSDPreferences ✅
- Dashboard overlay quality section ✅

### Partially Met / Known Gaps
- **R001 runtime proof**: Corrections are captured in test fixtures; real auto-mode runs producing actual corrections haven't happened yet. This will be proven organically when M002 runs.
- **R006 co-activation guardrail**: Requires agent composition data that doesn't exist yet. 4 of 6 guardrails are contract-proven.

## Follow-up Resolution

| Source | Follow-up | Disposition |
|--------|-----------|-------------|
| S01 | S02 will consume readCorrections() and CorrectionEntry for preference promotion | Addressed — S02 imports and uses both |
| S01 | S03 will replace static self-report instructions with dynamic recall injection | Addressed — S03 buildRecallBlock() replaced static block |
| S01 | S05 will reuse writeCorrection() for passive monitoring observations | Addressed — S05 passive-monitor feeds drift into correction system |
| S01 | Real runtime verification of correction capture should happen during S02/S03 integration testing | Deferred — requires real auto-mode run producing actual corrections; will prove organically in M002+ |
| S02 | S03 will consume readPreferences() and analyzePatterns() | Addressed — S03 recall.ts imports readPreferences() |
| S03 | User-level preference recall: read ~/.gsd/preferences.json back into buildRecallBlock() | **Resolved** — fixed during milestone completion (recall.ts now imports readUserPreferences and merges promoted user-level prefs, 5 new test assertions) |
| S03 | Retirement command: expose retireByCategory() via /gsd subcommand | Deferred — no user-facing command infrastructure exists yet; retirement works programmatically; CLI surface is a future feature |
| S04 | S05 consumes resolveQualityLevel() to gate tech debt auto-logging severity | Addressed — S05 quality-gating.ts extended with tech debt instructions |
| S04 | Actual gate recording at execution points (codebase scan, Context7 lookup, test runs) | Deferred — infrastructure exists (recordGateEvent, GateEvent type, metrics persistence) but callers don't record yet; requires real execution integration |
| S05 | None — final slice, no follow-ups | N/A |

## Requirement Changes

- R002: active → validated — 82 test assertions prove taxonomy contract (S01)
- R003: active → validated — 26 test assertions prove I/O lifecycle (S01)
- R004: active → validated — 53 test assertions prove promotion contract (S02)
- R005: active → validated — test assertions prove scope filtering (S02)
- R007: active → validated — 22 test assertions prove recall assembly (S03)
- R008: active → validated — 21 test assertions prove retirement workflow (S03)
- R009: active → validated — 29 test assertions prove cross-project promotion (S03)
- R010: active → validated — 28 integration tests prove quality level config (S04)
- R011: active → validated — 59 core + integration tests prove quality sentinel (S04)
- R012: active → validated — tests prove gate event lifecycle and dashboard (S04)
- R013: active → validated — 94 test assertions prove tech debt register (S05)
- R014: active → validated — integration tests prove auto-logging instructions (S05)
- R015: active → validated — 34 test assertions prove passive monitoring (S05)
- R001: remains active (partial) — contract proven, runtime proof pending
- R006: remains active (partial) — 4/6 guardrails proven, 2 pending

## Forward Intelligence

### What the next milestone should know
- The adaptive intelligence modules are all in `src/resources/extensions/gsd/` and follow a consistent non-throwing pattern. Every public function returns a structured result or safe default.
- All correction/preference/recall operations are gated by the `correction_capture` kill switch. Set `correction_capture: false` in preferences.md to disable the entire learning pipeline.
- The `{{corrections}}` and `{{quality}}` template variables in execute-task.md are the injection points. Any new template variables for future features should use different names.
- All 36 decisions (D001-D036) are documented in `.gsd/DECISIONS.md` and indexed by scope and slice.

### What's fragile
- `transformSessionEntries()` in auto.ts assumes Pi session entries have `content` arrays with `tool_use`/`tool_result` items inside message objects. If Pi SDK changes its session entry format, corrections from programmatic detection will silently stop (no crash, just empty results).
- Kill switch reads from two places: `corrections.ts` reads preferences.md directly (D016), `auto.ts` uses `loadEffectiveGSDPreferences()` (D018). If the preference key name changes, both must update.
- Skill existence check in observer.ts uses `homedir()` + hardcoded path instead of Pi SDK's `getAgentDir()` (D022). If agent directory moves, observer needs updating.
- `CATEGORY_SKILL_MAP` in observer.ts is hardcoded — only maps 3 of 14 categories to existing skills. When new skills are added, the map must be updated manually.

### Authoritative diagnostics
- Run all 12 test suites: `cd src/resources/extensions/gsd && for f in tests/*.test.ts; do npx tsx "$f"; done` — 550 assertions cover the full contract surface
- `.gsd/patterns/corrections.jsonl` — ground truth for captured corrections (populated during real auto-mode runs)
- `.gsd/patterns/preferences.jsonl` — ground truth for promoted preferences
- `.gsd/TECH-DEBT.md` — ground truth for logged tech debt
- `buildRecallBlock()` return value — the actual text injected into dispatch prompts

### What assumptions changed
- Originally planned to use `extractTrace()` from session-forensics.ts for correction detection — switched to direct session entry analysis because test fixtures use a simpler format (D017)
- Token budgets for quality instructions came in well under plan limits (~130-200 tokens vs 400-600 budget), leaving headroom for future extensions
- CATEGORY_SKILL_MAP only maps 3 categories to gsd2's actual skills (frontend-design, debug-like-expert); gsdup's map referenced skills that don't exist in gsd2

## Files Created/Modified

- `src/resources/extensions/gsd/correction-types.ts` — 14-category taxonomy, CorrectionEntry interface, validation helpers
- `src/resources/extensions/gsd/corrections.ts` — JSONL I/O: writeCorrection, readCorrections, rotateCorrections (never throws)
- `src/resources/extensions/gsd/correction-detector.ts` — Programmatic detection: retry, stuck, timeout, revert signals
- `src/resources/extensions/gsd/preference-types.ts` — PreferenceEntry, SuggestionEntry, PromoteResult, AnalyzeResult types
- `src/resources/extensions/gsd/pattern-preferences.ts` — checkAndPromote, writePreference, readPreferences with atomic upsert
- `src/resources/extensions/gsd/observer.ts` — analyzePatterns with cross-scope grouping and bounded guardrails
- `src/resources/extensions/gsd/recall.ts` — buildRecallBlock with token budget, slot allocation, dedup
- `src/resources/extensions/gsd/retire.ts` — retireByCategory for corrections, preferences, suggestions
- `src/resources/extensions/gsd/promote-preference.ts` — promoteToUserLevel for cross-project promotion
- `src/resources/extensions/gsd/quality-gating.ts` — Quality levels, buildQualityInstructions, gate event management
- `src/resources/extensions/gsd/tech-debt.ts` — logDebt, listDebt, resolveDebt for .gsd/TECH-DEBT.md
- `src/resources/extensions/gsd/passive-monitor.ts` — diffPlanVsSummary for plan-vs-outcome drift detection
- `src/resources/extensions/gsd/auto.ts` — Wired all modules: corrections, preferences, observer, recall, quality, drift
- `src/resources/extensions/gsd/preferences.ts` — Added correction_capture, quality_level fields
- `src/resources/extensions/gsd/metrics.ts` — Added gateEvents on UnitMetrics
- `src/resources/extensions/gsd/prompts/execute-task.md` — Added {{corrections}} and {{quality}} template variables
- `src/resources/extensions/gsd/dashboard-overlay.ts` — Added quality gate summary section
- `src/resources/extensions/gsd/gitignore.ts` — Added .gsd/patterns/ to baseline
- `src/resources/extensions/gsd/tests/correction-types.test.ts` — 82 assertions
- `src/resources/extensions/gsd/tests/corrections-io.test.ts` — 26 assertions
- `src/resources/extensions/gsd/tests/correction-detector.test.ts` — 25 assertions
- `src/resources/extensions/gsd/tests/preference-engine.test.ts` — 53 assertions
- `src/resources/extensions/gsd/tests/observer.test.ts` — 40 assertions
- `src/resources/extensions/gsd/tests/recall.test.ts` — 22 assertions
- `src/resources/extensions/gsd/tests/retire.test.ts` — 21 assertions
- `src/resources/extensions/gsd/tests/promote-preference.test.ts` — 29 assertions
- `src/resources/extensions/gsd/tests/quality-gating.test.ts` — 59 assertions
- `src/resources/extensions/gsd/tests/quality-gating-integration.test.ts` — 65 assertions
- `src/resources/extensions/gsd/tests/tech-debt.test.ts` — 94 assertions
- `src/resources/extensions/gsd/tests/passive-monitor.test.ts` — 34 assertions
