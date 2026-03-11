---
id: S02
parent: M001
milestone: M001
provides:
  - checkAndPromote() — automatic preference promotion from corrections at threshold ≥3 with confidence scoring
  - writePreference() — atomic upsert to preferences.jsonl via tmp+rename
  - readPreferences() — filtered reads by scope and status (active/retired)
  - analyzePatterns() — observer engine with cross-scope grouping, three-layer dedup, bounded guardrails, and suggestion generation
  - PreferenceEntry, SuggestionEntry, SuggestionsDocument, PromoteResult, WritePreferenceResult, AnalyzeResult types
  - Auto-wiring in auto.ts: checkAndPromote after every writeCorrection, analyzePatterns after task completion
requires:
  - slice: S01
    provides: corrections.ts (readCorrections, writeCorrection), correction-types.ts (CorrectionEntry, VALID_CATEGORIES, CorrectionScope)
affects:
  - S03
key_files:
  - src/resources/extensions/gsd/preference-types.ts
  - src/resources/extensions/gsd/pattern-preferences.ts
  - src/resources/extensions/gsd/observer.ts
  - src/resources/extensions/gsd/tests/preference-engine.test.ts
  - src/resources/extensions/gsd/tests/observer.test.ts
  - src/resources/extensions/gsd/auto.ts
key_decisions:
  - D019: pattern-preferences.ts naming avoids collision with existing config preferences.ts
  - D020: CATEGORY_SKILL_MAP maps to gsd2's actual skills (frontend-design, debug-like-expert); unmapped → null
  - D021: Observer trigger timing — after task completion, matching gsdup granularity
  - Skill existence check uses homedir() instead of getAgentDir() to avoid ESM/CJS issues
  - checkAndPromote takes {category, scope} not full CorrectionEntry for cleaner API
  - Per-correction promotion (inside for-loop) rather than batch — independent threshold evaluation
patterns_established:
  - Atomic upsert pattern: read all lines → map with merge → write tmp → rename
  - Confidence formula: count/(count+2) — starts 0.6 at threshold, asymptotically approaches 1.0
  - Three-layer dedup for suggestions: watermark (temporal), active-preference (category:scope), no-duplicate-pending (category)
  - Cross-scope grouping: corrections grouped by category only using Map with Set for scopes
  - Guardrail recording: blocked suggestions captured in metadata.skipped_suggestions with reason
  - Non-fatal try/catch wrapping for all preference/observer calls in auto.ts — never blocks dispatch
observability_surfaces:
  - .gsd/patterns/preferences.jsonl — raw preference data, human-readable
  - .gsd/patterns/suggestions.json — full suggestion lifecycle with metadata watermark and skipped_suggestions
  - PromoteResult — { promoted, reason, count, confidence } with reason codes: invalid_entry, below_threshold, capture_disabled, error
  - AnalyzeResult — { analyzed, suggestions_written, reason } with reason code: error
  - WritePreferenceResult — { written, reason } with reason code: error
drill_down_paths:
  - .gsd/milestones/M001/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S02/tasks/T03-SUMMARY.md
  - .gsd/milestones/M001/slices/S02/tasks/T04-SUMMARY.md
duration: ~50m
verification_result: passed
completed_at: 2026-03-11
---

# S02: Preference Engine

**Repeated corrections auto-promote to preferences with confidence scores, the observer engine aggregates patterns with bounded guardrails, and suggestions appear for skill refinement — all wired into auto-mode's execution loop.**

## What Happened

Built the preference promotion and observer engine in four tasks, test-first:

**T01** defined the complete type surface (7 types in `preference-types.ts`) and wrote 93 test assertions across two suites that served as the objective stopping condition for T02 and T03. Tests deliberately failed on import (module not found) to confirm structural validity.

**T02** implemented `pattern-preferences.ts` with three public functions: `checkAndPromote()` validates input, counts matching corrections via `readCorrections()`, promotes at ≥3 with confidence = count/(count+2), and upserts via `writePreference()`. `writePreference()` uses atomic tmp+rename upsert preserving created_at/retired_at on update. `readPreferences()` returns filtered results by scope and status. All non-throwing. 53 test assertions pass.

**T03** implemented `observer.ts` with `analyzePatterns()` as the main export. It auto-dismisses expired suggestions, reads corrections and preferences, filters through three dedup layers (watermark, active-preference, no-duplicate-pending), groups by category cross-scope, enforces guardrails (threshold ≥3, 7-day cooldown), maps to target skills via CATEGORY_SKILL_MAP, checks skill existence, and writes suggestions.json atomically. 40 test assertions pass.

**T04** wired both modules into `auto.ts`: `checkAndPromote()` is called after every `writeCorrection()` in emitProgrammaticCorrections (inside the for-loop) and emitStuckCorrection. `analyzePatterns()` is called in the post-completion block after correction emission. All calls are non-fatal with try/catch and guarded by the correction_capture kill switch.

## Verification

- `preference-engine.test.ts` — **53 passed, 0 failed** (threshold promotion, below-threshold skip, confidence formula, invalid entry handling, upsert semantics, scope/status filtering, atomic writes, field completeness)
- `observer.test.ts` — **40 passed, 0 failed** (threshold enforcement, watermark dedup, active-preference dedup, cross-scope grouping, cooldown guardrail, no-duplicate-pending, auto-dismiss expired, suggestion ID uniqueness, result shape, skill existence check, metadata structure)
- `grep -q "checkAndPromote" auto.ts` — **PASS** (3 occurrences: 1 import, 2 call sites)
- `grep -q "analyzePatterns" auto.ts` — **PASS** (2 occurrences: 1 import, 1 call site)
- Failure-path diagnostic verification: tests confirm `{ promoted: false, reason: 'below_threshold' }` and `{ promoted: false, reason: 'invalid_entry' }` for structured failure reporting

## Requirements Advanced

- R004 (Preference Promotion) — checkAndPromote promotes at threshold ≥3 with confidence scoring and upsert semantics; 53 test assertions prove the contract
- R005 (Preference Scope Hierarchy) — preferences tagged with scope, queryable by scope filter; readPreferences tests prove scope filtering works
- R006 (Observer Engine with Bounded Guardrails) — analyzePatterns implements min 3 corrections, 7-day cooldown, no-duplicate-pending, auto-dismiss expired; 40 test assertions prove guardrail enforcement

## Requirements Validated

- R004 — 53 test assertions prove promotion at/below threshold, confidence formula (count/(count+2)), upsert create/update semantics, atomic writes, and structured failure reporting
- R005 — readPreferences tests prove scope filtering (file, project, global) and status filtering (active, retired) work correctly
- R006 — 40 test assertions prove threshold enforcement, watermark dedup, active-preference dedup, cross-scope grouping, cooldown guardrail, no-duplicate-pending, auto-dismiss expired, suggestion structure, and skill existence check; partial validation — user confirmation and permission checks are S03 runtime concerns, not contract-testable; co-activation guardrail is deferred (needs agent composition data)

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- R006 — partially validated rather than fully validated: 4 of 6 guardrails are contract-proven (min corrections, cooldown, auto-dismiss, no-duplicate-pending). User confirmation and permission checks are runtime concerns that will be verified in S03's refinement workflow. Co-activation guardrail (5+ for agent composition) is deferred — no agent composition data exists yet.

## Deviations

- T03: Used `homedir()` from `node:os` for skill path resolution instead of `getAgentDir()` from Pi SDK. The Pi SDK package uses ESM-only exports incompatible with require() in the test context. `homedir()` resolves to the same `~/.gsd/agent/skills/` directory.

## Known Limitations

- auto.ts standalone import fails on pre-existing `state.js` module resolution — this is a pre-existing issue unrelated to S02. auto.ts runs within the full built project context.
- CATEGORY_SKILL_MAP only maps 3 of 14 categories to existing skills (code.style_mismatch → frontend-design, process.implementation_bug/process.regression → debug-like-expert). All other categories produce `type: 'new_skill_needed'` suggestions. This is correct behavior — the map will grow as skills are added.
- R006 guardrails are partially proven: co-activation guardrail and user confirmation are not yet testable at the contract level.

## Follow-ups

- none — S03 will consume readPreferences() and analyzePatterns() as specified in the boundary map.

## Files Created/Modified

- `src/resources/extensions/gsd/preference-types.ts` — 7 type definitions (PreferenceEntry, PromoteResult, WritePreferenceResult, SuggestionEntry, SuggestionsDocument, SkippedSuggestion, AnalyzeResult)
- `src/resources/extensions/gsd/pattern-preferences.ts` — preference promotion module with checkAndPromote, writePreference, readPreferences
- `src/resources/extensions/gsd/observer.ts` — observer engine with analyzePatterns, CATEGORY_SKILL_MAP, guardrail enforcement
- `src/resources/extensions/gsd/tests/preference-engine.test.ts` — 53 assertions covering preference promotion lifecycle
- `src/resources/extensions/gsd/tests/observer.test.ts` — 40 assertions covering observer engine with guardrails
- `src/resources/extensions/gsd/auto.ts` — added checkAndPromote and analyzePatterns wiring

## Forward Intelligence

### What the next slice should know
- `readPreferences()` accepts `{ scope?, status? }` filters and returns `PreferenceEntry[]` — this is the API S03 needs for recall injection
- `analyzePatterns()` writes `suggestions.json` with `status: 'pending'` entries — S03's refinement workflow should update status to `'accepted'`/`'refined'`/`'dismissed'`
- PreferenceEntry has `retired_at` and `retired_by` fields ready for S03's retirement logic
- The `{{corrections}}` template variable in execute-task.md currently contains static self-report instructions (from S01) — S03 replaces this with dynamic recall data

### What's fragile
- Skill existence check uses hardcoded `homedir()` path — if gsd2's agent dir ever moves from `~/.gsd/agent/`, observer.ts will need updating
- CATEGORY_SKILL_MAP is hardcoded — no dynamic discovery. When new skills are added, the map must be updated manually

### Authoritative diagnostics
- `.gsd/patterns/preferences.jsonl` — ground truth for promoted preferences; each line is a complete PreferenceEntry
- `.gsd/patterns/suggestions.json` — ground truth for observer state; `metadata.last_analyzed_at` shows watermark, `metadata.skipped_suggestions` shows guardrail blocks
- Both test suites are comprehensive and self-contained — run them to verify any future changes

### What assumptions changed
- No assumptions changed. Implementation matched the plan and S01 boundary map exactly.
