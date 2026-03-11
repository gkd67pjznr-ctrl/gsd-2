---
estimated_steps: 5
estimated_files: 2
---

# T03: Build observer engine (observer.ts)

**Slice:** S02 — Preference Engine
**Milestone:** M001

## Description

Implement the pattern analysis engine that aggregates corrections cross-scope, enforces bounded learning guardrails, and writes skill refinement suggestions. This is the core of R006 (Observer Engine with Bounded Guardrails). The observer reads corrections, deduplicates against active preferences and a watermark, groups by category (not scope), enforces guardrails, generates suggestions with skill mapping, and auto-dismisses expired suggestions. Makes the observer test suite pass.

## Steps

1. Create `observer.ts` with the main export `analyzePatterns(options?)`:
   - Read config defaults: `{ minOccurrences: 3, cooldownDays: 7, autoDismissAfterDays: 30 }`
   - Ensure `.gsd/patterns/` directory exists
   - Load existing `suggestions.json` (or fresh document if missing)
   - Read watermark from `metadata.last_analyzed_at`
   - Auto-dismiss expired pending suggestions (older than autoDismissAfterDays)
   - Read all active corrections via `readCorrections({ status: 'active' }, { cwd })`
   - Read active preferences via `readPreferences({ status: 'active' }, { cwd })`
   - Build dedup set from active preferences (category:scope pairs)
   - Filter corrections: remove promoted (category:scope in dedup set) and pre-watermark
   - Group remaining by category (cross-scope — same category different scopes merge into one group)
   - For each group at or above minOccurrences threshold:
     a. Check guardrails (cooldown against accepted/refined suggestions for target skill)
     b. Skip if pending suggestion for same category already exists
     c. Map category to target skill via CATEGORY_SKILL_MAP
     d. Check skill existence at gsd2 path: `getAgentDir() + '/skills/' + skillName + '/SKILL.md'`
     e. Generate suggestion with unique ID, type ('refine_skill' or 'new_skill_needed'), sample corrections
   - Update watermark to current time
   - Write suggestions.json atomically (tmp+rename)
   - Return `AnalyzeResult`

2. Define CATEGORY_SKILL_MAP for gsd2's actual skills:
   - `code.wrong_pattern` → null (no matching gsd2 skill)
   - `code.missing_context` → null
   - `code.stale_knowledge` → null
   - `code.over_engineering` → null
   - `code.under_engineering` → null
   - `code.style_mismatch` → `frontend-design` (style-related code corrections)
   - `code.scope_drift` → null
   - `process.planning_error` → null
   - `process.research_gap` → null
   - `process.implementation_bug` → `debug-like-expert` (bug-related corrections)
   - `process.integration_miss` → null
   - `process.convention_violation` → null
   - `process.requirement_misread` → null
   - `process.regression` → `debug-like-expert` (regression-related corrections)
   - Categories mapping to null produce suggestions with `type: 'new_skill_needed'`

3. Implement guardrail helpers:
   - `checkGuardrails(category, suggestionsDoc, config)` — find most recent accepted/refined suggestion for the target skill within cooldown window. Return `{ pass: false, reason: 'cooldown_active', cooldown_expires }` if blocked, `{ pass: true }` if clear.
   - `autoDismissExpired(suggestionsDoc, autoDismissAfterDays)` — mutate pending suggestions older than threshold to status:'dismissed' with dismiss_reason:'auto_expired'.
   - `generateSuggestionId(existingIds)` — epoch seconds + zero-padded counter, guaranteed unique within Set.

4. Ensure non-throwing (D013): wrap `analyzePatterns()` in try/catch, return `{ analyzed: false, reason: 'error' }` on failure.

5. Run test suite and fix any assertion failures. Minor test adjustments are acceptable if the implementation reveals a cleaner design, but guardrail behavioral assertions must not change.

## Must-Haves

- [ ] `analyzePatterns()` returns `{ analyzed: true, suggestions_written: N }` on success
- [ ] Threshold enforcement: groups below minOccurrences (3) produce no suggestions
- [ ] Watermark dedup: corrections at or before watermark are excluded
- [ ] Active-preference dedup: corrections with category:scope matching an active preference are excluded
- [ ] Cross-scope grouping: same category across different scopes counted together
- [ ] Cooldown guardrail: blocks suggestion when target skill had recent accepted/refined suggestion
- [ ] No-duplicate-pending: skips category with existing pending suggestion
- [ ] Auto-dismiss: pending suggestions older than 30 days → dismissed with reason 'auto_expired'
- [ ] Skill existence check uses gsd2 path (getAgentDir() + '/skills/<name>/SKILL.md')
- [ ] Atomic writes: suggestions.json written via tmp+rename
- [ ] Never throws (D013)

## Verification

- `node --experimental-strip-types src/resources/extensions/gsd/tests/observer.test.ts` — all ≥25 assertions pass, 0 failures

## Observability Impact

- Signals added/changed: `AnalyzeResult` with suggestions_written count; `suggestions.json` with metadata.last_analyzed_at watermark and metadata.skipped_suggestions array
- How a future agent inspects this: Read `.gsd/patterns/suggestions.json` for full suggestion state; check `metadata.skipped_suggestions` for guardrail-blocked suggestions; check `metadata.last_analyzed_at` for last analysis timestamp
- Failure state exposed: `skipped_suggestions` entries with reason ('cooldown_active') and cooldown_expires timestamp; dismissed suggestions with dismiss_reason ('auto_expired')

## Inputs

- `src/resources/extensions/gsd/preference-types.ts` — `SuggestionEntry`, `SuggestionsDocument`, `AnalyzeResult`, `SkippedSuggestion` types from T01
- `src/resources/extensions/gsd/pattern-preferences.ts` — `readPreferences()` from T02
- `src/resources/extensions/gsd/corrections.ts` — `readCorrections()` for reading correction data
- `src/resources/extensions/gsd/tests/observer.test.ts` — test suite defining expected behavior (from T01)
- gsdup `analyze-patterns.cjs` — reference design for watermark, cross-scope grouping, guardrails, suggestion generation

## Expected Output

- `src/resources/extensions/gsd/observer.ts` — complete observer engine module
- observer.test.ts passes with all ≥25 assertions
