---
id: T04
parent: S02
milestone: M001
provides:
  - checkAndPromote wired after every writeCorrection call in auto.ts (emitProgrammaticCorrections and emitStuckCorrection)
  - analyzePatterns wired as post-completion hook in auto.ts dispatch loop
key_files:
  - src/resources/extensions/gsd/auto.ts
key_decisions:
  - checkAndPromote called inside the existing for-loop (per correction) rather than once after the loop — each correction gets its own promotion check with independent threshold evaluation
  - analyzePatterns guarded by its own loadEffectiveGSDPreferences call rather than sharing state with emitProgrammaticCorrections — keeps the try/catch boundaries independent
patterns_established:
  - Non-fatal try/catch wrapping for all preference/observer calls — matches existing writeCorrection pattern
  - Kill switch guard (correction_capture !== false) applied before analyzePatterns — consistent with emitProgrammaticCorrections and emitStuckCorrection
observability_surfaces:
  - preferences.jsonl populated automatically during auto-mode runs (via checkAndPromote)
  - suggestions.json populated automatically after task completions (via analyzePatterns)
duration: ~8 minutes
verification_result: passed
completed_at: 2026-03-11
blocker_discovered: false
---

# T04: Wire preference engine and observer into auto.ts

**Connected checkAndPromote and analyzePatterns into auto-mode's correction emission points so preferences and suggestions are populated during real runs.**

## What Happened

Added two imports to auto.ts (`checkAndPromote` from pattern-preferences.ts, `analyzePatterns` from observer.ts) and wired them into three call sites:

1. **emitProgrammaticCorrections**: After each `writeCorrection(correction)` in the for-loop, `checkAndPromote({ category: correction.diagnosis_category, scope: correction.scope }, { cwd: basePath })` is called inside its own try/catch.

2. **emitStuckCorrection**: After the `writeCorrection(entry)` call, `checkAndPromote({ category: entry.diagnosis_category, scope: entry.scope }, { cwd: basePath })` is called inside its own try/catch.

3. **Post-completion block** (after emitProgrammaticCorrections): `analyzePatterns({ cwd: basePath })` is called with its own correction_capture kill switch check and try/catch wrapper.

All calls are non-fatal — failures are caught silently to never block dispatch, matching the existing pattern used by writeCorrection.

## Verification

- `grep -q "checkAndPromote" auto.ts` — ✅ confirmed (3 occurrences: 1 import, 2 call sites)
- `grep -q "analyzePatterns" auto.ts` — ✅ confirmed (2 occurrences: 1 import, 1 call site)
- `node --experimental-strip-types -e "import { checkAndPromote } from './pattern-preferences.ts'; import { analyzePatterns } from './observer.ts'"` — ✅ imports resolve
- `node --experimental-strip-types auto.ts` standalone import — fails on pre-existing `state.js` import (unrelated, confirmed same failure without changes via git stash)
- preference-engine.test.ts — ✅ 53 passed, 0 failed
- observer.test.ts — ✅ 40 passed, 0 failed

Slice-level verification:
- ✅ preference-engine.test.ts — 53 assertions pass
- ✅ observer.test.ts — 40 assertions pass
- ✅ `grep -q "checkAndPromote" auto.ts` — wiring confirmed
- ✅ `grep -q "analyzePatterns" auto.ts` — wiring confirmed

## Diagnostics

- Check `.gsd/patterns/preferences.jsonl` for promoted preferences after auto-mode runs
- Check `.gsd/patterns/suggestions.json` for generated suggestions after auto-mode runs
- If neither file is populated after runs, check that `correction_capture` is not set to `false` in GSD preferences
- Failures in checkAndPromote or analyzePatterns are silently caught — to diagnose, add temporary logging inside the try/catch blocks in auto.ts

## Deviations

None.

## Known Issues

- auto.ts standalone import (`node -e "import './auto.ts'"`) fails on pre-existing `state.js` module resolution — this is a pre-existing issue unrelated to this task. auto.ts is designed to run within the full built project context, not standalone.

## Files Created/Modified

- `src/resources/extensions/gsd/auto.ts` — Added imports for checkAndPromote and analyzePatterns; wired both into correction emission points with non-fatal try/catch wrappers and kill switch guards
