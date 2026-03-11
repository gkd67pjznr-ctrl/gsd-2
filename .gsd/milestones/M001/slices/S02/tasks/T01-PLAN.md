---
estimated_steps: 5
estimated_files: 3
---

# T01: Create test suites and PreferenceEntry type definitions

**Slice:** S02 — Preference Engine
**Milestone:** M001

## Description

Establish the type contract for S02 and write both test suites with real assertions before any implementation exists. The `preference-types.ts` module defines `PreferenceEntry`, `SuggestionEntry`, `SuggestionsDocument`, `PromoteResult`, and `AnalyzeResult` — the complete type surface for preference promotion and observer analysis. The two test files define the objective stopping condition for T02 and T03 respectively. Tests will fail on missing imports until the implementation modules are created.

## Steps

1. Create `preference-types.ts` with all type definitions:
   - `PreferenceEntry` — category (DiagnosisCategory), scope (CorrectionScope), preference_text (string), confidence (number), source_count (number), last_correction_ts (string), created_at (string), updated_at (string), retired_at (string | null), retired_by (string | null). Import DiagnosisCategory and CorrectionScope from correction-types.ts.
   - `PromoteResult` — `{ promoted: boolean, reason?: 'invalid_entry' | 'below_threshold' | 'error', count?: number, confidence?: number }`
   - `WritePreferenceResult` — `{ written: boolean, reason?: 'error' }`
   - `AnalyzeResult` — `{ analyzed: boolean, suggestions_written?: number, reason?: 'error' }`
   - `SuggestionEntry` — id, type ('refine_skill' | 'new_skill_needed'), target_skill (string | null), category, scope_summary, correction_count, sample_corrections (string[]), status ('pending' | 'accepted' | 'dismissed' | 'refined'), created_at, accepted_at, dismissed_at, dismiss_reason (string | null), refined_at (string | null)
   - `SuggestionsDocument` — `{ metadata: { last_analyzed_at: string | null, version: number, skipped_suggestions: SkippedSuggestion[] }, suggestions: SuggestionEntry[] }`
   - `SkippedSuggestion` — category, target_skill, reason, skipped_at, cooldown_expires (string | undefined)

2. Create `preference-engine.test.ts` with ≥30 assertions covering:
   - `checkAndPromote()` with <3 corrections → returns `{ promoted: false, reason: 'below_threshold', count }` 
   - `checkAndPromote()` with ≥3 corrections → returns `{ promoted: true, count, confidence }` and preference file contains entry
   - `checkAndPromote()` confidence formula: count=3 → 0.6, count=5 → ~0.714
   - `checkAndPromote()` with invalid entry (missing category) → returns `{ promoted: false, reason: 'invalid_entry' }`
   - `writePreference()` creates new entry with created_at, updated_at, retired_at:null
   - `writePreference()` upserts existing entry — updates confidence/source_count, preserves created_at
   - `readPreferences()` with no file → returns `[]`
   - `readPreferences()` with scope filter → returns only matching scope
   - `readPreferences()` with status:'active' → excludes retired entries
   - `readPreferences()` with status:'retired' → includes only retired entries
   - Atomic write: preference file exists (no .tmp leftover)
   - Use `makeValidEntry()` from correction-types.ts pattern, temp directories, assert/assertEq helpers matching corrections-io.test.ts structure

3. Create `observer.test.ts` with ≥25 assertions covering:
   - `analyzePatterns()` with corrections below threshold → no suggestions written
   - `analyzePatterns()` with corrections at threshold → suggestion created with correct fields
   - Watermark dedup: second call with no new corrections → no new suggestions
   - Active-preference dedup: corrections already promoted to preferences → skipped
   - Cross-scope grouping: same category across different scopes → single suggestion with scope_summary
   - Cooldown guardrail: recently accepted suggestion for same skill → blocked, recorded in skipped_suggestions
   - No-duplicate-pending: existing pending suggestion for same category → no new suggestion
   - Auto-dismiss: pending suggestion older than 30 days → status changed to 'dismissed'
   - Suggestion ID uniqueness across multiple calls
   - `analyzePatterns()` result shape: `{ analyzed: true, suggestions_written: N }`
   - Skill existence check: suggestion type is 'new_skill_needed' when skill doesn't exist
   - Use temp directories, seed corrections via `writeCorrection()`, assert/assertEq helpers

4. Verify `preference-types.ts` compiles: `node --experimental-strip-types --no-warnings -e "import './src/resources/extensions/gsd/preference-types.ts'"`

5. Verify both test files fail on import (module not found), not on syntax — this confirms the tests are structurally valid and waiting for implementation.

## Must-Haves

- [ ] `PreferenceEntry` interface includes all fields needed by S03 (retired_at, retired_by, source_count, confidence, category, scope, created_at, updated_at)
- [ ] `SuggestionEntry` and `SuggestionsDocument` types match the structure from gsdup analyze-patterns.cjs
- [ ] `PromoteResult` and `AnalyzeResult` provide structured diagnostic return types
- [ ] preference-engine.test.ts has ≥30 assertions
- [ ] observer.test.ts has ≥25 assertions
- [ ] Tests use temp directories and assert/assertEq helpers matching corrections-io.test.ts pattern
- [ ] Tests fail on import (not syntax) when run before T02/T03

## Verification

- `node --experimental-strip-types --no-warnings -e "import './src/resources/extensions/gsd/preference-types.ts'"` succeeds
- Both test files fail on module-not-found import errors (pattern-preferences.ts, observer.ts), confirming they're structurally valid
- Count assertions: ≥30 in preference-engine.test.ts, ≥25 in observer.test.ts

## Observability Impact

- Signals added/changed: `PromoteResult.reason` and `AnalyzeResult.reason` define the diagnostic contract for all preference and observer operations
- How a future agent inspects this: Read the type definitions to understand the full data shape; read test files to understand expected behavior
- Failure state exposed: Structured reason codes on all return types

## Inputs

- `src/resources/extensions/gsd/correction-types.ts` — `DiagnosisCategory`, `CorrectionScope` types to import
- `src/resources/extensions/gsd/corrections.ts` — `writeCorrection()` and `readCorrections()` used by tests to seed fixture data
- `src/resources/extensions/gsd/tests/corrections-io.test.ts` — pattern reference for assert helpers, temp directory setup, makeValidEntry fixture

## Expected Output

- `src/resources/extensions/gsd/preference-types.ts` — complete type definitions for S02
- `src/resources/extensions/gsd/tests/preference-engine.test.ts` — ≥30 assertions, failing on import
- `src/resources/extensions/gsd/tests/observer.test.ts` — ≥25 assertions, failing on import
