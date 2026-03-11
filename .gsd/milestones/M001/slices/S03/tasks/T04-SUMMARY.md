---
id: T04
parent: S03
milestone: M001
provides:
  - buildCorrectionsVar() now calls buildRecallBlock() for dynamic recall injection
  - checkAndPromote() now calls promoteToUserLevel() for cross-project preference promotion
key_files:
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/pattern-preferences.ts
key_decisions:
  - none — followed plan exactly
patterns_established:
  - Non-fatal try/catch wrapper for cross-project promotion in checkAndPromote
observability_surfaces:
  - "{{corrections}} template variable now contains dynamic recall data — inspect dispatch prompt logs"
  - "promoteToUserLevel() failure silently caught — never blocks preference write success"
duration: ~8m
verification_result: passed
completed_at: 2026-03-11
blocker_discovered: false
---

# T04: Wired recall into auto.ts and promotion into checkAndPromote

**Connected buildRecallBlock() and promoteToUserLevel() to the execution loop, closing the learning loop for S03**

## What Happened

Two integration changes wired S03's new modules into the live execution path:

1. **auto.ts**: Imported `buildRecallBlock` from `recall.js` and replaced the body of `buildCorrectionsVar()` to call it directly. The function now returns dynamic, token-budgeted recall data instead of static self-report text. The `SELF_REPORT_INSTRUCTIONS` const remains in auto.ts for reference but is no longer the return value — recall.ts embeds it in the assembled block. The kill switch check moved into `buildRecallBlock()` so there's no double-check.

2. **pattern-preferences.ts**: Imported `promoteToUserLevel` from `promote-preference.js` and `basename` from `node:path`. After a successful `writePreference()` call in `checkAndPromote()`, added a try/catch-wrapped call to `promoteToUserLevel()` passing the preference's category, scope, preference_text, and confidence, with `projectId: basename(cwd)`. Promotion failure is silently caught — it must never block a successful preference write.

## Verification

All 5 test suites pass with 0 failures:

- `recall.test.ts` — 22 passed ✓
- `preference-engine.test.ts` — 53 passed ✓
- `observer.test.ts` — 40 passed ✓
- `retire.test.ts` — 21 passed ✓
- `promote-preference.test.ts` — 29 passed ✓

**Total: 165 assertions, 0 failures**

Grep checks:
- `grep -q "buildRecallBlock" auto.ts` — PASS
- `grep -q "promoteToUserLevel" pattern-preferences.ts` — PASS

## Diagnostics

- **Recall wiring**: grep `auto.ts` for `buildRecallBlock` to confirm wiring. The `{{corrections}}` template variable in dispatch prompts now contains dynamic data.
- **Promotion wiring**: grep `pattern-preferences.ts` for `promoteToUserLevel` to confirm cross-project promotion is active after every successful preference write.
- **Failure visibility**: `buildRecallBlock()` returns `""` on error (same fallback as before). `promoteToUserLevel()` failure is caught and ignored — no observable failure surface by design (non-fatal).

## Deviations

None — followed plan exactly.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/auto.ts` — added `buildRecallBlock` import, replaced `buildCorrectionsVar()` body
- `src/resources/extensions/gsd/pattern-preferences.ts` — added `promoteToUserLevel` and `basename` imports, added promotion call after successful preference write
