---
estimated_steps: 4
estimated_files: 3
---

# T04: Wire recall into auto.ts and promotion into checkAndPromote

**Slice:** S03 — Learning Loop Closure
**Milestone:** M001

## Description

Connect the three new modules to the execution loop. Replace `buildCorrectionsVar()` body in auto.ts to call `buildRecallBlock()`. Add `promoteToUserLevel()` call in `checkAndPromote()` in pattern-preferences.ts after successful preference writes. This is the integration task that closes the learning loop — without it, the modules exist but aren't used.

## Steps

1. In `auto.ts`:
   - Add import: `import { buildRecallBlock } from "./recall.js";`
   - Replace body of `buildCorrectionsVar()`: call `buildRecallBlock()` and return its result. Keep the kill switch check in `buildRecallBlock()` (don't double-check in auto.ts). The `SELF_REPORT_INSTRUCTIONS` const can remain for reference but is no longer the return value.
   - Verify the function signature remains `function buildCorrectionsVar(): string` (synchronous, no args).
2. In `pattern-preferences.ts`:
   - Add import: `import { promoteToUserLevel } from "./promote-preference.js";`
   - Add import: `import { basename } from "node:path";`
   - In `checkAndPromote()`, after the successful `writePreference()` call (when `writeResult.written` is true), add: `try { promoteToUserLevel({ category, scope, preference_text: preference.preference_text, confidence: preference.confidence }, { projectId: basename(cwd) }); } catch (_) { /* non-fatal */ }`
3. Run existing test suites to confirm no regressions:
   - `npx tsx src/resources/extensions/gsd/tests/recall.test.ts`
   - `npx tsx src/resources/extensions/gsd/tests/preference-engine.test.ts`
   - `npx tsx src/resources/extensions/gsd/tests/observer.test.ts`
4. Verify wiring via grep:
   - `grep -q "buildRecallBlock" src/resources/extensions/gsd/auto.ts`
   - `grep -q "promoteToUserLevel" src/resources/extensions/gsd/pattern-preferences.ts`

## Must-Haves

- [ ] `buildCorrectionsVar()` in auto.ts calls `buildRecallBlock()` instead of returning `SELF_REPORT_INSTRUCTIONS` directly
- [ ] `checkAndPromote()` in pattern-preferences.ts calls `promoteToUserLevel()` after successful preference write
- [ ] `promoteToUserLevel()` call is wrapped in try/catch (non-fatal — promotion failure must never block preference promotion)
- [ ] Existing test suites continue to pass (no regressions)
- [ ] No changes to public function signatures

## Verification

- `grep -q "buildRecallBlock" src/resources/extensions/gsd/auto.ts` — PASS
- `grep -q "promoteToUserLevel" src/resources/extensions/gsd/pattern-preferences.ts` — PASS
- `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` — all pass
- `npx tsx src/resources/extensions/gsd/tests/preference-engine.test.ts` — all pass (existing 53 assertions)
- `npx tsx src/resources/extensions/gsd/tests/observer.test.ts` — all pass (existing 40 assertions)

## Observability Impact

- Signals added/changed: `{{corrections}}` template variable now contains dynamic recall data instead of static text — this is observable in dispatch prompt logs
- How a future agent inspects this: grep auto.ts for `buildRecallBlock` to confirm wiring; grep pattern-preferences.ts for `promoteToUserLevel` to confirm cross-project promotion is active
- Failure state exposed: `buildRecallBlock()` returns "" on any error (same as previous `buildCorrectionsVar()` fallback); `promoteToUserLevel()` failure is caught and ignored (non-fatal)

## Inputs

- `src/resources/extensions/gsd/recall.ts` — `buildRecallBlock()` from T02
- `src/resources/extensions/gsd/promote-preference.ts` — `promoteToUserLevel()` from T03
- `src/resources/extensions/gsd/auto.ts` — `buildCorrectionsVar()` at line ~1131, existing `SELF_REPORT_INSTRUCTIONS` const
- `src/resources/extensions/gsd/pattern-preferences.ts` — `checkAndPromote()` at line ~271, `writePreference()` call at line ~328

## Expected Output

- `src/resources/extensions/gsd/auto.ts` — modified: `buildCorrectionsVar()` body replaced with `buildRecallBlock()` call
- `src/resources/extensions/gsd/pattern-preferences.ts` — modified: `promoteToUserLevel()` called after successful promotion
- All existing and new tests passing
