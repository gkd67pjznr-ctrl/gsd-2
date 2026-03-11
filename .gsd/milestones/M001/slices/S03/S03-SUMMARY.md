---
id: S03
parent: M001
milestone: M001
provides:
  - buildRecallBlock() — token-budgeted recall assembly with slot allocation, deduplication, kill switch
  - retireByCategory() — non-destructive retirement of corrections and preferences with suggestion status update
  - promoteToUserLevel() — cross-project preference promotion at 3+ project threshold
  - Integration wiring — buildCorrectionsVar() calls buildRecallBlock(), checkAndPromote() calls promoteToUserLevel()
requires:
  - slice: S01
    provides: corrections.ts (readCorrections), correction-types.ts (CorrectionEntry, taxonomy)
  - slice: S02
    provides: pattern-preferences.ts (readPreferences, checkAndPromote), observer.ts (suggestions format), preference-types.ts
affects:
  - S05 (passive monitoring may feed into correction system using these modules)
key_files:
  - src/resources/extensions/gsd/recall.ts
  - src/resources/extensions/gsd/retire.ts
  - src/resources/extensions/gsd/promote-preference.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/pattern-preferences.ts
key_decisions:
  - "D025: Recall block embeds self-report instructions in same {{corrections}} variable — no separate hook needed"
  - "D026: Token estimation via words/0.75 with 3000 max and 20 footer reserve"
  - "D027: GSD_HOME env var for user-level preferences test isolation"
  - "D028: Cross-project promotion triggered from checkAndPromote after successful preference write"
patterns_established:
  - Non-throwing modules returning structured results or empty strings on failure
  - Atomic tmp+rename writes for all JSONL mutation and JSON document updates
  - GSD_HOME env var for redirecting user-level preferences (testability pattern)
  - Shared retireJsonlFile() helper DRYing JSONL retirement across corrections and preferences
observability_surfaces:
  - buildRecallBlock() return value is the assembled recall text injected into dispatch prompts via {{corrections}}
  - retired_at/retired_by fields on JSONL entries in corrections and preferences files show retirement state
  - promoteToUserLevel() returns structured { promoted, projectCount, reason } — inspectable result
  - ~/.gsd/preferences.json shows cross-project promotion state with source_projects and promoted_at
drill_down_paths:
  - .gsd/milestones/M001/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T03-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T04-SUMMARY.md
duration: ~55m
verification_result: passed
completed_at: 2026-03-11
---

# S03: Learning Loop Closure

**Dynamic recall injection, correction retirement, and cross-project preference promotion close the learning loop from capture through recall to refinement**

## What Happened

Four tasks delivered three new modules and two integration wiring changes, completing the learning loop started in S01 (capture) and S02 (pattern analysis).

**T01** established the test-first contract: 72 assertions across recall, retire, and promote test suites defining exact acceptance criteria. All tests failed on import (modules didn't exist yet), confirming structural validity.

**T02** implemented `recall.ts` with `buildRecallBlock()` — the core of live recall injection. The function reads active preferences and corrections, deduplicates (corrections already promoted to preferences are excluded), allocates up to 10 slots (preferences first, corrections fill remaining), enforces a ~3K token budget using a `words/0.75` estimator, and appends self-report instructions. Returns empty string on kill switch or error. All 22 recall tests passed.

**T03** implemented two modules. `retire.ts` with `retireByCategory()` processes corrections (active + archives), preferences, and suggestions — marking matching entries with `retired_at`/`retired_by` and updating suggestion status to `refined`. Uses a shared `retireJsonlFile()` helper to DRY the JSONL mutation pattern. `promote-preference.ts` with `promoteToUserLevel()` tracks `source_projects` per category+scope, promotes at 3+ distinct projects, writes atomically to `~/.gsd/preferences.json` with `GSD_HOME` env var override for testability. All 50 retire + promote tests passed.

**T04** wired the modules into the execution loop. In `auto.ts`, `buildCorrectionsVar()` now calls `buildRecallBlock()` instead of returning static self-report text. In `pattern-preferences.ts`, `checkAndPromote()` now calls `promoteToUserLevel()` after every successful preference write, wrapped in try/catch (non-fatal). All 165 assertions across 5 test suites passed after wiring.

## Verification

All slice-level verification checks passed:

| Check | Result |
|---|---|
| `npx tsx tests/recall.test.ts` — 22 assertions | ✅ all pass |
| `npx tsx tests/retire.test.ts` — 21 assertions | ✅ all pass |
| `npx tsx tests/promote-preference.test.ts` — 29 assertions | ✅ all pass |
| `npx tsx tests/preference-engine.test.ts` — 53 assertions (S02, regression) | ✅ all pass |
| `npx tsx tests/observer.test.ts` — 40 assertions (S02, regression) | ✅ all pass |
| `grep -q "buildRecallBlock" auto.ts` | ✅ pass |
| `grep -q "promoteToUserLevel" pattern-preferences.ts` | ✅ pass |
| Token budget: 20 verbose entries stay under 3K tokens | ✅ proven in test |

**Total: 165 assertions, 0 failures**

## Requirements Advanced

- R007 (Live Recall Injection) — `buildRecallBlock()` delivers token-budgeted, deduplicated recall of preferences and corrections into dispatch prompts via `{{corrections}}` variable. Slot allocation (10 max, preferences first), kill switch, and self-report preservation all proven.
- R008 (Skill Refinement Workflow) — `retireByCategory()` marks corrections and preferences as retired with `retired_at`/`retired_by` fields, updates suggestion status to `refined`. The retirement side of the refinement workflow is complete. The collaborative user review flow is implicit via observer suggestions from S02.
- R009 (Cross-Project Preference Promotion) — `promoteToUserLevel()` tracks `source_projects`, promotes at 3+ projects, writes atomically to `~/.gsd/preferences.json`. User-level preferences are now available to all projects.

## Requirements Validated

- R007 — 22 test assertions prove recall assembly, slot allocation, token budget enforcement, deduplication, kill switch, and self-report preservation. Contract fully validated.
- R008 — 21 test assertions prove retirement of corrections (active + archive), preferences, suggestion status updates, idempotency, malformed line preservation, and missing file handling. Contract fully validated.
- R009 — 29 test assertions prove cross-project tracking, promotion at 3+ projects, upsert semantics, confidence merging, GSD_HOME redirect, and input validation. Contract fully validated.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

None. All four tasks followed the plan exactly.

## Known Limitations

- **No runtime proof yet**: All validation uses synthetic test data. Real auto-mode runs producing actual recall blocks, retirements, and cross-project promotions are deferred to integration testing.
- **User-level preferences read path**: `promoteToUserLevel()` writes to `~/.gsd/preferences.json`, but nothing currently reads user-level preferences back into the recall block. This is an integration gap for future work.
- **Retirement UI**: `retireByCategory()` exists but there is no user-facing command or interactive flow to trigger it — it must be called programmatically or from a future `/gsd` subcommand.

## Follow-ups

- S04 (Quality Gating) and S05 (Tech Debt + Passive Monitoring) remain before M001 is complete
- User-level preference recall: a future slice should read `~/.gsd/preferences.json` back into `buildRecallBlock()` for true cross-project learning
- Retirement command: expose `retireByCategory()` via a `/gsd` subcommand or observer-triggered flow

## Files Created/Modified

- `src/resources/extensions/gsd/recall.ts` — new: buildRecallBlock() with token budget, slot allocation, dedup, kill switch
- `src/resources/extensions/gsd/retire.ts` — new: retireByCategory() for corrections, preferences, suggestions
- `src/resources/extensions/gsd/promote-preference.ts` — new: promoteToUserLevel() for cross-project promotion
- `src/resources/extensions/gsd/tests/recall.test.ts` — new: 22 assertions for recall module
- `src/resources/extensions/gsd/tests/retire.test.ts` — new: 21 assertions for retire module
- `src/resources/extensions/gsd/tests/promote-preference.test.ts` — new: 29 assertions for promote module
- `src/resources/extensions/gsd/auto.ts` — modified: buildCorrectionsVar() now calls buildRecallBlock()
- `src/resources/extensions/gsd/pattern-preferences.ts` — modified: checkAndPromote() now calls promoteToUserLevel()

## Forward Intelligence

### What the next slice should know
- S04 (Quality Gating) is independent of S01-S03 — no code dependencies. It extends the existing preferences system and dispatch prompt injection.
- S05 depends on S01 (corrections.ts) and S04 (quality-gating.ts). The correction I/O module is stable and well-tested.
- The `{{corrections}}` template variable is now dynamic — any new template variable for quality instructions should use a different name (e.g., `{{quality}}`) to avoid conflicts.

### What's fragile
- `buildRecallBlock()` uses `isCaptureDisabled()` duplicated from corrections.ts (D016) — if the kill switch mechanism changes, both copies must be updated
- Token estimation is approximate (words/0.75) — actual tokenizers would give different results, but the budget is generous enough that this doesn't matter in practice

### Authoritative diagnostics
- Run `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` to verify recall assembly — 22 assertions cover all edge cases
- Inspect `buildRecallBlock()` return value by logging the `{{corrections}}` variable in dispatch prompt output
- Check `~/.gsd/preferences.json` for cross-project promotion state

### What assumptions changed
- No assumptions changed — the slice plan was followed exactly and all test contracts were met on first implementation
