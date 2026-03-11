# S03: Learning Loop Closure

**Goal:** Dispatch prompts include relevant past corrections filtered by context, skill refinement retires source corrections, and preferences appearing in 3+ projects promote to user-level.
**Demo:** A dispatch prompt for a task in a project with correction history shows a `<system-reminder>` recall block containing promoted preferences and recent corrections, capped at ~3K tokens. Retiring a category marks corrections/preferences as retired and updates the suggestion. Promoting a preference from 3+ projects writes to `~/.gsd/preferences.json`.

## Must-Haves

- `buildRecallBlock()` reads active preferences and corrections, deduplicates, applies slot allocation (10 max, preferences first), enforces ~3K token budget, and returns formatted `<system-reminder>` block with self-report instructions appended
- `buildCorrectionsVar()` in auto.ts calls `buildRecallBlock()` instead of returning static text
- `retireByCategory()` marks matching corrections and preferences as retired (sets `retired_at`, `retired_by`), updates suggestion status to `refined`, processes both active and archive files
- `promoteToUserLevel()` tracks `source_projects` per category+scope, promotes at 3+ distinct projects, writes atomically to `~/.gsd/preferences.json` with `GSD_HOME` env var override for testability
- Self-report instructions preserved in the recall block output (not replaced by dynamic recall)
- Token budget proof: recall block stays under 3K tokens even with 10+ entries

## Proof Level

- This slice proves: contract + integration
- Real runtime required: no — synthetic test data proves token budget and recall assembly; runtime proof deferred to actual auto-mode runs
- Human/UAT required: no

## Verification

- `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` — recall assembly with slot allocation, token budget, deduplication, self-report preservation, empty state, kill switch
- `npx tsx src/resources/extensions/gsd/tests/retire.test.ts` — retirement of corrections (active + archive), preferences, suggestion status update, idempotency, non-destructive preservation
- `npx tsx src/resources/extensions/gsd/tests/promote-preference.test.ts` — cross-project tracking, promotion at 3+ projects, upsert semantics, confidence merging, GSD_HOME redirect
- `grep -q "buildRecallBlock" src/resources/extensions/gsd/auto.ts` — wiring confirmed
- Token budget assertion: test with 20 synthetic entries confirms output stays under 3K tokens

## Observability / Diagnostics

- Runtime signals: `buildRecallBlock()` returns the assembled text (inspectable by logging the `{{corrections}}` variable); retirement returns void but the file state is the ground truth
- Inspection surfaces: `.gsd/patterns/corrections.jsonl` entries with `retired_at` field show retirement state; `.gsd/patterns/preferences.jsonl` entries with `retired_at` show preference retirement; `~/.gsd/preferences.json` shows cross-project promotion state with `source_projects` and `promoted_at`
- Failure visibility: all public functions are non-throwing; `buildRecallBlock()` returns empty string on error (matches existing `buildCorrectionsVar()` fallback); `promoteToUserLevel()` returns `{ promoted: false, reason }` with structured error codes
- Redaction constraints: none — no secrets in correction/preference data

## Integration Closure

- Upstream surfaces consumed: `corrections.ts` → `readCorrections({ status: 'active' })`, `pattern-preferences.ts` → `readPreferences({ status: 'active' })`, `observer.ts` → `suggestions.json` format (`SuggestionsDocument`), `preference-types.ts` → all type imports, `auto.ts` → `buildCorrectionsVar()` replacement target
- New wiring introduced in this slice: `buildCorrectionsVar()` body replaced to call `buildRecallBlock()` — this is the only auto.ts change; `promoteToUserLevel()` called from `checkAndPromote()` in pattern-preferences.ts after successful promotion
- What remains before the milestone is truly usable end-to-end: S04 (quality gating), S05 (tech debt + passive monitoring), final integration run with real correction data

## Tasks

- [x] **T01: Create test suites for recall, retire, and promote modules** `est:40m`
  - Why: Test-first — defines the objective stopping conditions for T02/T03/T04. Tests will fail on import until the modules are created, confirming structural validity.
  - Files: `src/resources/extensions/gsd/tests/recall.test.ts`, `src/resources/extensions/gsd/tests/retire.test.ts`, `src/resources/extensions/gsd/tests/promote-preference.test.ts`
  - Do: Write three test suites following the assert/assertEq + temp directory pattern from S01/S02. Recall tests: empty state returns self-report only, preferences-only recall, corrections-only recall, mixed slot allocation, token budget enforcement with 20 synthetic entries, dedup (corrections promoted to preferences excluded), kill switch returns empty string. Retire tests: retire corrections in active file, retire corrections in archive files, retire preferences, update suggestion to refined, idempotent re-retirement, malformed lines preserved, no-op on missing files. Promote tests: first project creates entry, second project updates, third project promotes (sets promoted_at), re-promotion idempotent, confidence takes max, GSD_HOME redirect, missing fields returns error.
  - Verify: All three test files parse without syntax errors via `npx tsx --eval "import('./src/resources/extensions/gsd/tests/recall.test.ts')"` (will fail on import of non-existent module, confirming tests are structurally valid)
  - Done when: Three test files exist with 40+ total assertions across the suites, covering all must-haves

- [x] **T02: Implement recall.ts — build recall block with token-budgeted slot allocation** `est:35m`
  - Why: Delivers R007 (Live Recall Injection) — the core of this slice. Replaces static self-report text with dynamic, filtered recall of past corrections and preferences.
  - Files: `src/resources/extensions/gsd/recall.ts`, `src/resources/extensions/gsd/tests/recall.test.ts`
  - Do: Create `recall.ts` with `buildRecallBlock(options?: { cwd?: string })` that: (1) checks kill switch via preferences.md, returns "" if disabled; (2) reads active preferences and corrections; (3) builds dedup set from preferences (category:scope); (4) filters corrections excluding promoted keys; (5) allocates slots (10 max, preferences first, corrections fill remaining); (6) assembles `<system-reminder>` block with preferences section, corrections section, skipped count footer; (7) enforces ~3K token budget with `Math.ceil(words / 0.75)` estimator; (8) appends SELF_REPORT_INSTRUCTIONS after the recall block. All non-throwing — returns "" on any error.
  - Verify: `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` — all recall assertions pass
  - Done when: All recall test assertions pass, token budget proven with synthetic data

- [x] **T03: Implement retire.ts and promote-preference.ts** `est:35m`
  - Why: Delivers R008 (retirement machinery) and R009 (cross-project promotion). Retirement closes the refinement loop; promotion enables learning transfer across projects.
  - Files: `src/resources/extensions/gsd/retire.ts`, `src/resources/extensions/gsd/promote-preference.ts`, `src/resources/extensions/gsd/tests/retire.test.ts`, `src/resources/extensions/gsd/tests/promote-preference.test.ts`
  - Do: Create `retire.ts` with `retireByCategory(category, suggestionId, options?: { cwd?: string })` that: (1) processes corrections.jsonl + all corrections-*.jsonl archive files — marks matching entries with `retired_at`/`retired_by`; (2) processes preferences.jsonl — marks matching entries; (3) updates suggestions.json — sets matching suggestion status to `refined` with `refined_at`. All atomic via tmp+rename. All non-throwing. Create `promote-preference.ts` with `promoteToUserLevel(preference, options?: { projectId?: string })` that: (1) reads `~/.gsd/preferences.json` (or GSD_HOME override); (2) finds/creates entry by category+scope; (3) adds projectId to source_projects; (4) promotes (sets promoted_at) when 3+ projects; (5) confidence = max of existing and incoming; (6) writes atomically. Returns `{ promoted, projectCount, reason? }`. Non-throwing.
  - Verify: `npx tsx src/resources/extensions/gsd/tests/retire.test.ts` and `npx tsx src/resources/extensions/gsd/tests/promote-preference.test.ts` — all assertions pass
  - Done when: All retire and promote test assertions pass

- [x] **T04: Wire recall into auto.ts and promotion into checkAndPromote** `est:20m`
  - Why: Integration — connects the new modules to the execution loop. Without wiring, the modules exist but aren't used.
  - Files: `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/pattern-preferences.ts`
  - Do: (1) In auto.ts: import `buildRecallBlock` from `recall.ts`, replace body of `buildCorrectionsVar()` to call `buildRecallBlock()` — keep function signature unchanged, keep `SELF_REPORT_INSTRUCTIONS` const for reference but it's now embedded in recall.ts. (2) In pattern-preferences.ts: import `promoteToUserLevel` from `promote-preference.ts`, add call after successful `writePreference()` in `checkAndPromote()` — pass `{ projectId: path.basename(cwd) }`. Wrap in try/catch (non-fatal). (3) Verify grep confirms wiring.
  - Verify: `grep -q "buildRecallBlock" src/resources/extensions/gsd/auto.ts && grep -q "promoteToUserLevel" src/resources/extensions/gsd/pattern-preferences.ts` — both pass
  - Done when: `buildCorrectionsVar()` calls `buildRecallBlock()`, `checkAndPromote()` calls `promoteToUserLevel()` after successful promotion, all existing tests still pass

## Files Likely Touched

- `src/resources/extensions/gsd/recall.ts` (new)
- `src/resources/extensions/gsd/retire.ts` (new)
- `src/resources/extensions/gsd/promote-preference.ts` (new)
- `src/resources/extensions/gsd/tests/recall.test.ts` (new)
- `src/resources/extensions/gsd/tests/retire.test.ts` (new)
- `src/resources/extensions/gsd/tests/promote-preference.test.ts` (new)
- `src/resources/extensions/gsd/auto.ts` (modify — buildCorrectionsVar body)
- `src/resources/extensions/gsd/pattern-preferences.ts` (modify — add promoteToUserLevel call)
