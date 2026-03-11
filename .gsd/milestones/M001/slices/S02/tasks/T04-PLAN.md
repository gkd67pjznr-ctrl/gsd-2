---
estimated_steps: 4
estimated_files: 1
---

# T04: Wire preference engine and observer into auto.ts

**Slice:** S02 — Preference Engine
**Milestone:** M001

## Description

Connect the preference promotion and observer modules to auto-mode's correction emission points. After this task, every correction written during auto-mode triggers a promotion check, and every task completion triggers pattern analysis. This closes the integration loop — without this wiring, the modules exist but never execute during real auto-mode runs.

## Steps

1. Add imports to auto.ts:
   - `import { checkAndPromote } from "./pattern-preferences.ts"`
   - `import { analyzePatterns } from "./observer.ts"`

2. Wire `checkAndPromote()` after each `writeCorrection()` call:
   - In `emitProgrammaticCorrections()`: after the `for (const correction of corrections)` loop that calls `writeCorrection()`, call `checkAndPromote(correction, { cwd: basePath })` for each correction. Wrap in try/catch (non-fatal, matching existing pattern). Guard behind `correction_capture` kill switch (already checked at function entry).
   - In `emitStuckCorrection()`: after the `writeCorrection(entry, { cwd: basePath })` call, add `checkAndPromote(entry, { cwd: basePath })`. Wrap in try/catch (non-fatal).

3. Wire `analyzePatterns()` as post-completion hook:
   - In the post-completion block (after `emitProgrammaticCorrections()` call, around line ~882), add a call to `analyzePatterns({ cwd: basePath })`. Wrap in try/catch (non-fatal). Guard behind `correction_capture` kill switch (check `prefs?.correction_capture === false` — already available in that block's scope from the existing preferences check).

4. Verify the full chain compiles and all tests still pass:
   - `node --experimental-strip-types --no-warnings -e "import './src/resources/extensions/gsd/auto.ts'"` — compiles
   - `node --experimental-strip-types src/resources/extensions/gsd/tests/preference-engine.test.ts` — still passes
   - `node --experimental-strip-types src/resources/extensions/gsd/tests/observer.test.ts` — still passes
   - `grep -q "checkAndPromote" src/resources/extensions/gsd/auto.ts` — confirms wiring
   - `grep -q "analyzePatterns" src/resources/extensions/gsd/auto.ts` — confirms wiring

## Must-Haves

- [ ] `checkAndPromote` imported and called after each `writeCorrection()` in emitProgrammaticCorrections
- [ ] `checkAndPromote` imported and called after `writeCorrection()` in emitStuckCorrection
- [ ] `analyzePatterns` imported and called at post-completion (after emitProgrammaticCorrections)
- [ ] All new calls wrapped in try/catch (non-fatal — never block dispatch)
- [ ] All new calls guarded behind correction_capture kill switch
- [ ] auto.ts compiles with no TypeScript errors

## Verification

- `grep -q "checkAndPromote" src/resources/extensions/gsd/auto.ts && echo "checkAndPromote wired"` — prints "checkAndPromote wired"
- `grep -q "analyzePatterns" src/resources/extensions/gsd/auto.ts && echo "analyzePatterns wired"` — prints "analyzePatterns wired"
- `node --experimental-strip-types --no-warnings -e "import './src/resources/extensions/gsd/auto.ts'"` — exits 0
- Both test suites still pass (preference-engine.test.ts, observer.test.ts)

## Observability Impact

- Signals added/changed: Preference promotion and pattern analysis now execute automatically during auto-mode — `preferences.jsonl` and `suggestions.json` will be populated during real runs
- How a future agent inspects this: Check `.gsd/patterns/preferences.jsonl` for promoted preferences after auto-mode runs; check `.gsd/patterns/suggestions.json` for generated suggestions
- Failure state exposed: Failures in checkAndPromote or analyzePatterns are silently caught (non-fatal). To diagnose, add temporary logging inside the try/catch blocks. The primary diagnostic is checking whether preferences.jsonl and suggestions.json are populated after real auto-mode runs.

## Inputs

- `src/resources/extensions/gsd/auto.ts` — integration target with existing `emitProgrammaticCorrections()`, `emitStuckCorrection()`, and post-completion block
- `src/resources/extensions/gsd/pattern-preferences.ts` — `checkAndPromote()` from T02
- `src/resources/extensions/gsd/observer.ts` — `analyzePatterns()` from T03
- S01 forward intelligence: `emitProgrammaticCorrections()` and `emitStuckCorrection()` patterns already established

## Expected Output

- `src/resources/extensions/gsd/auto.ts` — modified with checkAndPromote and analyzePatterns calls wired in
- All existing test suites continue to pass
- Integration confirmed via grep checks
