---
id: T02
parent: S03
milestone: M001
provides:
  - buildRecallBlock() function with token-budgeted slot allocation and deduplication
  - estimateTokens() utility for word-based token estimation
key_files:
  - src/resources/extensions/gsd/recall.ts
key_decisions:
  - Corrections sorted chronologically ascending for stable slot allocation — oldest corrections get their slot first rather than always being displaced by recent ones
patterns_established:
  - Recall assembly follows the reference hook pattern (gsd-recall-corrections.cjs) but as a synchronous TypeScript function matching the non-throwing contract
  - isCaptureDisabled() pattern duplicated from corrections.ts for self-contained kill switch checking
observability_surfaces:
  - buildRecallBlock() return value is the observable output — the assembled text injected into dispatch prompts via {{corrections}}
  - Returns "" on any error (silent failure matching buildCorrectionsVar() contract)
duration: 15m
verification_result: passed
completed_at: 2026-03-11
blocker_discovered: false
---

# T02: Implemented recall.ts with token-budgeted slot allocation, deduplication, and kill switch

**Created `buildRecallBlock()` — synchronous, non-throwing recall assembly that reads active preferences and corrections, deduplicates, enforces 10-entry slot allocation with 3K token budget, and appends self-report instructions**

## What Happened

Created `src/resources/extensions/gsd/recall.ts` with two exports:

1. **`buildRecallBlock(options?: { cwd?: string }): string`** — the main public function that:
   - Checks kill switch via preferences.md frontmatter (`correction_capture: false` → returns "")
   - Reads active preferences via `readPreferences({ status: 'active' })` and active corrections via `readCorrections({ status: 'active' })`
   - Builds dedup set (`Set<string>` of `category:scope`) from preferences
   - Filters corrections excluding those whose `diagnosis_category:scope` matches a promoted preference
   - Sorts filtered corrections chronologically ascending for stable slot allocation
   - Allocates up to 10 slots — preferences first, corrections fill remaining
   - Assembles `<system-reminder>` block with token budget enforcement (3000 token limit, 20-token footer reserve)
   - Appends `SELF_REPORT_INSTRUCTIONS` after the recall block
   - Returns self-report instructions only (no `<system-reminder>`) when no recall data exists
   - Returns "" on kill switch or any error (non-throwing)

2. **`estimateTokens(text: string): number`** — word-based token estimator using `Math.ceil(words / 0.75)`, exported for test verification

The implementation follows the reference hook pattern from `gsdup/.claude/hooks/gsd-recall-corrections.cjs` but is adapted as a synchronous TypeScript module matching the non-throwing contract required by `loadPrompt()` vars in auto.ts.

## Verification

- `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` — **22/22 assertions passed** ✅
  - Empty state: returns self-report instructions only, no `<system-reminder>` block
  - Preferences-only: wraps in `<system-reminder>`, includes preference texts
  - Corrections-only: wraps in `<system-reminder>`, includes correction texts
  - Mixed slot allocation: 4 prefs + 6 corrections (10 max), all prefs included
  - Token budget: 20 verbose entries (~50 words each) → output stays under 3000 tokens
  - Deduplication: corrections matching preference category:scope excluded
  - Kill switch: returns "" when correction_capture is false
  - Self-report instructions: present in output, after `</system-reminder>` block

### Slice-level verification (partial — intermediate task):
- `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` — ✅ all pass
- `npx tsx src/resources/extensions/gsd/tests/retire.test.ts` — ❌ expected (module not found until T03)
- `npx tsx src/resources/extensions/gsd/tests/promote-preference.test.ts` — ❌ expected (module not found until T03)
- `grep -q "buildRecallBlock" src/resources/extensions/gsd/auto.ts` — ❌ expected (wiring is T04)

## Diagnostics

Call `buildRecallBlock({ cwd: '/path/to/project' })` directly to inspect the assembled recall text. The return value is exactly what gets injected into dispatch prompts via the `{{corrections}}` template variable. Empty string means either kill switch is active, no data exists (self-report only goes to empty state path), or an error occurred.

## Deviations

Corrections are sorted chronologically ascending before slot allocation (oldest first). The reference hook took whatever order `readCorrections` returned (descending/most-recent-first). The ascending sort ensures stable, fair slot allocation where older corrections aren't perpetually displaced by newer ones. This matches the test expectations.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/recall.ts` — new module with `buildRecallBlock()` and `estimateTokens()` exports
