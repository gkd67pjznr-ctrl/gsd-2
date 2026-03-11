---
estimated_steps: 5
estimated_files: 4
---

# T03: Implement retire.ts and promote-preference.ts

**Slice:** S03 — Learning Loop Closure
**Milestone:** M001

## Description

Create two modules: `retire.ts` for marking corrections/preferences as retired after skill refinement (R008), and `promote-preference.ts` for cross-project preference promotion to `~/.gsd/preferences.json` (R009).

Both modules follow the established non-throwing, atomic-write patterns. Retirement is non-destructive — entries stay in JSONL with `retired_at`/`retired_by` fields added. Promotion tracks `source_projects` per category+scope and promotes when 3+ distinct projects contribute.

## Steps

1. Create `src/resources/extensions/gsd/retire.ts` with export:
   - `retireByCategory(category: string, suggestionId: string, options?: { cwd?: string }): void`
   - Process corrections: read `corrections.jsonl` + all `corrections-*.jsonl` archive files in `.gsd/patterns/`. For each file, parse lines, mark entries matching `diagnosis_category === category` with `retired_at = now` and `retired_by = suggestionId` (skip already-retired entries). Write atomically via tmp+rename. Preserve malformed lines unchanged.
   - Process preferences: read `preferences.jsonl`, mark entries matching `category` field with `retired_at`/`retired_by`. Same atomic write pattern.
   - Process suggestions: read `suggestions.json`, find entry with `id === suggestionId`, set `status: 'refined'` and `refined_at = now`. Atomic write.
   - All non-throwing — wrap entire function body in try/catch.
2. Create `src/resources/extensions/gsd/promote-preference.ts` with exports:
   - `promoteToUserLevel(preference: { category: string, scope: string, preference_text: string, confidence: number }, options?: { projectId?: string }): PromoteToUserResult`
   - `readUserPreferences(): UserPreferencesDocument` (for testing/inspection)
   - Define `PromoteToUserResult = { promoted: boolean, projectCount?: number, reason?: string }`
   - Define `UserPreferencesDocument = { version: string, preferences: UserPreferenceEntry[] }`
   - Use `getGsdHome()` helper: `process.env.GSD_HOME || join(homedir(), '.gsd')` for testability
   - Read `preferences.json` from gsd home. Find entry by category+scope. If not found, create with `source_projects: [projectId]`. If found, add projectId to source_projects (if not already present), take max confidence, update text. Set `promoted_at` when `source_projects.length >= 3` (only if not already set). Write atomically.
   - Validate inputs: return `{ promoted: false, reason: 'missing_fields' }` if projectId, category, or scope missing.
3. Run retire test suite to verify all assertions pass.
4. Run promote test suite to verify all assertions pass.
5. Verify both modules handle edge cases: missing directories, empty files, concurrent access safety (atomic writes).

## Must-Haves

- [ ] `retireByCategory()` marks matching corrections in active + archive files with `retired_at`/`retired_by`
- [ ] `retireByCategory()` marks matching preferences in preferences.jsonl with `retired_at`/`retired_by`
- [ ] `retireByCategory()` updates suggestion status to `refined` with `refined_at`
- [ ] Already-retired entries are not double-stamped (idempotent)
- [ ] Malformed JSONL lines are preserved unchanged through retirement
- [ ] `promoteToUserLevel()` tracks `source_projects` per category+scope
- [ ] Promotion triggers at 3+ distinct projects (sets `promoted_at`)
- [ ] `GSD_HOME` env var redirects user preferences location
- [ ] Both modules are non-throwing
- [ ] All writes use atomic tmp+rename pattern

## Verification

- `npx tsx src/resources/extensions/gsd/tests/retire.test.ts` — all retire assertions pass
- `npx tsx src/resources/extensions/gsd/tests/promote-preference.test.ts` — all promote assertions pass

## Observability Impact

- Signals added/changed: Retirement is visible via `retired_at`/`retired_by` fields on corrections and preferences entries; promotion visible via `promoted_at` and `source_projects` in `~/.gsd/preferences.json`
- How a future agent inspects this: grep for `retired_at` in JSONL files to see retirement state; read `~/.gsd/preferences.json` to see cross-project promotion state
- Failure state exposed: `retireByCategory()` silently no-ops on any error; `promoteToUserLevel()` returns `{ promoted: false, reason: 'error' }` with no side effects on failure

## Inputs

- `src/resources/extensions/gsd/preference-types.ts` — `PreferenceEntry`, `SuggestionEntry`, `SuggestionsDocument` type definitions
- `src/resources/extensions/gsd/corrections.ts` — JSONL file format reference (corrections use `diagnosis_category` field)
- `src/resources/extensions/gsd/pattern-preferences.ts` — JSONL file format reference (preferences use `category` field)
- `gsdup/.claude/hooks/lib/retire.cjs` — reference implementation for retirement flow
- `gsdup/.claude/hooks/lib/promote-preference.cjs` — reference implementation for cross-project promotion
- `~/.gsd/preferences.json` — existing schema to match
- T01 test suites as acceptance criteria

## Expected Output

- `src/resources/extensions/gsd/retire.ts` — retirement module with `retireByCategory()` export
- `src/resources/extensions/gsd/promote-preference.ts` — promotion module with `promoteToUserLevel()` and `readUserPreferences()` exports
- All retire and promote test assertions passing
