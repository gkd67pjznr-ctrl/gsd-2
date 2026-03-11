# S02: Preference Engine

**Goal:** Repeated corrections auto-promote to preferences with confidence scores, the observer engine aggregates patterns with bounded guardrails, and suggestions appear for skill refinement.
**Demo:** After writing ≥3 corrections with the same category+scope, `readPreferences()` returns a promoted preference with the correct confidence score. After running `analyzePatterns()` on corrections exceeding the threshold, `suggestions.json` contains pending suggestions with skill mapping. Both modules enforce all safety guardrails (threshold, cooldown, auto-dismiss).

## Must-Haves

- `checkAndPromote()` counts corrections by category+scope and upserts a preference at threshold ≥3 with confidence = count/(count+2)
- `writePreference()` uses tmp+rename atomic upsert by category+scope, preserving `created_at`/`retired_at` on update
- `readPreferences()` returns preferences filtered by scope and/or status (active/retired)
- `PreferenceEntry` type includes all fields S03 needs for retirement and cross-project promotion
- `analyzePatterns()` reads corrections, deduplicates against active preferences and watermark, groups by category cross-scope, enforces guardrails (threshold ≥3, 7-day cooldown, no duplicate pending), generates suggestions with skill mapping, auto-dismisses expired suggestions (30 days)
- Suggestions written atomically to `.gsd/patterns/suggestions.json` with metadata, watermark, and skipped_suggestions
- Skill existence check uses gsd2 path (`~/.gsd/agent/skills/<name>/SKILL.md`)
- `checkAndPromote()` wired into `auto.ts` after each `writeCorrection()` call
- `analyzePatterns()` wired into `auto.ts` as post-completion hook after task completion
- All public functions return structured results, never throw (D013)
- All I/O functions accept optional `cwd` parameter for test isolation

## Proof Level

- This slice proves: contract + integration
- Real runtime required: no (contract verified with fixture data and temp directories; integration verified by wiring into auto.ts with grep checks)
- Human/UAT required: no

## Verification

- `node --experimental-strip-types src/resources/extensions/gsd/tests/preference-engine.test.ts` — ≥30 assertions covering: promotion at threshold, below-threshold skip, confidence formula, upsert semantics (create and update), scope filtering, status filtering, readPreferences empty-file safety, atomic write (tmp+rename), PreferenceEntry field completeness
- `node --experimental-strip-types src/resources/extensions/gsd/tests/observer.test.ts` — ≥25 assertions covering: threshold enforcement, watermark dedup, active-preference dedup, cross-scope grouping, cooldown guardrail, no-duplicate-pending guardrail, auto-dismiss expired, suggestion ID uniqueness, skill existence check path, suggestion structure, analyzePatterns result shape
- `grep -q "checkAndPromote" src/resources/extensions/gsd/auto.ts` — integration wiring confirmed
- `grep -q "analyzePatterns" src/resources/extensions/gsd/auto.ts` — integration wiring confirmed
- At least one test verifies a diagnostic/failure-path signal: checkAndPromote returns structured `{ promoted: false, reason }` on invalid input and below-threshold cases

## Observability / Diagnostics

- Runtime signals: `checkAndPromote()` returns `{ promoted, reason, count, confidence }` — reason values: `'invalid_entry'`, `'below_threshold'`, `'error'`. `analyzePatterns()` returns `{ analyzed, suggestions_written, reason }` — reason values: `'error'`.
- Inspection surfaces: `.gsd/patterns/preferences.jsonl` for raw preference data; `.gsd/patterns/suggestions.json` for suggestion state including metadata watermark and skipped_suggestions array
- Failure visibility: `WriteResult.reason` for preference writes; `suggestions.json.metadata.skipped_suggestions` records guardrail-blocked suggestions with reason and timestamp
- Redaction constraints: none (no secrets in correction/preference data)

## Integration Closure

- Upstream surfaces consumed: `corrections.ts` → `readCorrections()`, `writeCorrection()`; `correction-types.ts` → `CorrectionEntry`, `DiagnosisCategory`, `CorrectionScope`, `VALID_CATEGORIES`; `skill-discovery.ts` → `getAgentDir()` path for skill existence checks
- New wiring introduced in this slice: `checkAndPromote()` called after each `writeCorrection()` in auto.ts; `analyzePatterns()` called at post-completion in auto.ts
- What remains before the milestone is truly usable end-to-end: S03 (recall injection into dispatch prompts, retirement, cross-project promotion), S04 (quality gating), S05 (tech debt, passive monitoring)

## Tasks

- [x] **T01: Create test suites and PreferenceEntry type definitions** `est:45m`
  - Why: Establishes the type contract and test scaffolds that define "done" for S02. Tests are written first (failing on import), then subsequent tasks make them pass.
  - Files: `src/resources/extensions/gsd/preference-types.ts`, `src/resources/extensions/gsd/tests/preference-engine.test.ts`, `src/resources/extensions/gsd/tests/observer.test.ts`
  - Do: Define `PreferenceEntry` interface (category, scope, preference_text, confidence, source_count, last_correction_ts, created_at, updated_at, retired_at, retired_by — all fields S03 needs). Define `SuggestionEntry` and `SuggestionsDocument` types. Define `PromoteResult` and `AnalyzeResult` structured return types. Write both test suites with real assertions covering all must-haves. Tests will fail on import until T02/T03 create the modules.
  - Verify: `node --experimental-strip-types src/resources/extensions/gsd/tests/preference-engine.test.ts` fails on import (module not found), not on syntax
  - Done when: Both test files parse without syntax errors and contain ≥55 total assertions across the two suites

- [x] **T02: Build preference promotion module (pattern-preferences.ts)** `est:1h`
  - Why: Implements the preference I/O layer and promotion logic — the core of R004 and R005. Makes the preference-engine test suite pass.
  - Files: `src/resources/extensions/gsd/pattern-preferences.ts`, `src/resources/extensions/gsd/tests/preference-engine.test.ts`
  - Do: Implement `checkAndPromote(entry, options)` — count matching corrections by category+scope using `readCorrections()`, promote at ≥3 with confidence=count/(count+2), upsert via `writePreference()`. Implement `writePreference(preference, options)` with tmp+rename atomic upsert. Implement `readPreferences(filters, options)` with scope/status filtering. All non-throwing. Use `.gsd/patterns/preferences.jsonl` path, cwd-relative. Follow kill switch pattern from D016 (direct preferences.md read). Adjust tests if needed for implementation details.
  - Verify: `node --experimental-strip-types src/resources/extensions/gsd/tests/preference-engine.test.ts` — all ≥30 assertions pass
  - Done when: preference-engine test suite reports 0 failures

- [x] **T03: Build observer engine (observer.ts)** `est:1h`
  - Why: Implements the pattern analysis engine with bounded guardrails — the core of R006. Makes the observer test suite pass.
  - Files: `src/resources/extensions/gsd/observer.ts`, `src/resources/extensions/gsd/tests/observer.test.ts`
  - Do: Implement `analyzePatterns(options)` — read corrections, dedup against active preferences (category:scope) and watermark, group by category cross-scope, enforce guardrails (threshold ≥3, 7-day cooldown, no duplicate pending), generate suggestions with skill mapping, auto-dismiss expired (30 days), write suggestions.json atomically. Use gsd2 skill path (`getAgentDir()` + `skills/<name>/SKILL.md`). Use hardcoded defaults (minOccurrences:3, cooldownDays:7, autoDismissAfterDays:30). Build a pragmatic CATEGORY_SKILL_MAP that maps to existing gsd2 skills where applicable and falls back to null for unmapped categories. Adjust tests if needed for implementation details.
  - Verify: `node --experimental-strip-types src/resources/extensions/gsd/tests/observer.test.ts` — all ≥25 assertions pass
  - Done when: observer test suite reports 0 failures

- [x] **T04: Wire preference engine and observer into auto.ts** `est:30m`
  - Why: Closes the integration loop — preferences promote automatically after corrections, and patterns are analyzed after task completion. Without this wiring, the modules exist but never execute.
  - Files: `src/resources/extensions/gsd/auto.ts`
  - Do: Import `checkAndPromote` from `pattern-preferences.ts` and call it after each `writeCorrection()` call in `emitProgrammaticCorrections()` and `emitStuckCorrection()`. Import `analyzePatterns` from `observer.ts` and call it in the post-completion block (after `emitProgrammaticCorrections`). Both calls wrapped in try/catch (non-fatal, matching existing pattern). Guard both behind `correction_capture` kill switch. Verify TypeScript compiles cleanly.
  - Verify: `grep -q "checkAndPromote" src/resources/extensions/gsd/auto.ts && grep -q "analyzePatterns" src/resources/extensions/gsd/auto.ts && node --experimental-strip-types --no-warnings -e "import './src/resources/extensions/gsd/auto.ts'"` — all three pass
  - Done when: auto.ts imports and calls both functions, TypeScript compiles, both test suites still pass

## Files Likely Touched

- `src/resources/extensions/gsd/preference-types.ts` (new)
- `src/resources/extensions/gsd/pattern-preferences.ts` (new)
- `src/resources/extensions/gsd/observer.ts` (new)
- `src/resources/extensions/gsd/tests/preference-engine.test.ts` (new)
- `src/resources/extensions/gsd/tests/observer.test.ts` (new)
- `src/resources/extensions/gsd/auto.ts` (modified — integration wiring)
