---
id: T01
parent: S01
milestone: M001
provides:
  - CorrectionEntry interface with 14-category taxonomy
  - VALID_CATEGORIES runtime set (14 entries)
  - isValidCategory() and isValidEntry() type guard validators
  - REQUIRED_FIELDS constant (9 required field names)
  - Test scaffolds for corrections I/O and detector (initially failing)
key_files:
  - src/resources/extensions/gsd/correction-types.ts
  - src/resources/extensions/gsd/tests/correction-types.test.ts
  - src/resources/extensions/gsd/tests/corrections-io.test.ts
  - src/resources/extensions/gsd/tests/correction-detector.test.ts
key_decisions:
  - Used .ts import extensions (not .js) to match project convention for node --experimental-strip-types
patterns_established:
  - Pure type module pattern: types + runtime validation constants + type guards in single file
  - Test fixture pattern: makeValidEntry() with override spread for correction test reuse
observability_surfaces:
  - isValidEntry() returns false with no side effects for invalid entries
  - isValidCategory() validates single category string against taxonomy
duration: 10m
verification_result: passed
completed_at: 2026-03-11
blocker_discovered: false
---

# T01: Create correction type definitions and test scaffold

**Defined the 14-category correction taxonomy with type guards and created test scaffolds for the entire slice.**

## What Happened

Created `correction-types.ts` with the full schema contract: `DiagnosisCategory` union type (7 code + 7 process categories), `VALID_CATEGORIES` runtime Set, `CorrectionScope` and `CorrectionSource` unions, `CorrectionEntry` interface with 9 required and 7 optional fields, `REQUIRED_FIELDS` constant, and two validation helpers (`isValidCategory`, `isValidEntry`). The `isValidEntry` type guard checks required field presence, category membership, and diagnosis_text word count (≤100).

Created three test files: the type test passes immediately with 82 assertions covering all categories, validators, required fields, edge cases (missing fields, null, empty, word count boundary). The I/O test (23 assertions) and detector test (14 assertions) have real assertions against the T02/T03 APIs but fail on import as expected until those modules are implemented.

## Verification

- `node --experimental-strip-types src/resources/extensions/gsd/tests/correction-types.test.ts` — 82 passed, 0 failed ✓
- `ls` confirms both `corrections-io.test.ts` and `correction-detector.test.ts` exist ✓
- `grep -c 'assert'` shows 23 assertions in I/O test (≥5) and 14 in detector test (≥4) ✓

### Slice-level verification (1/5 expected for T01):
- ✅ correction-types.test.ts passes (82/82)
- ❌ corrections-io.test.ts fails on import (expected — T02)
- ❌ correction-detector.test.ts fails on import (expected — T03)
- ❌ `{{corrections}}` in dispatch prompt (expected — T04)
- ❌ `.gsd/patterns/` in gitignore.ts (expected — T02)

## Diagnostics

- Import `correction-types.ts` and verify exports: `VALID_CATEGORIES.size === 14`, `REQUIRED_FIELDS.length === 9`
- Run the type test to validate taxonomy integrity
- `isValidEntry()` returns false for invalid entries with no side effects

## Deviations

Changed import extensions from `.js` to `.ts` to match the project convention — Node 25.8.0 with `--experimental-strip-types` resolves `.ts` imports directly but fails on `.js` extensions for TypeScript source files.

## Known Issues

None

## Files Created/Modified

- `src/resources/extensions/gsd/correction-types.ts` — pure type definitions + validation helpers (14-category taxonomy, CorrectionEntry interface, type guards)
- `src/resources/extensions/gsd/tests/correction-types.test.ts` — passing test file with 82 assertions
- `src/resources/extensions/gsd/tests/corrections-io.test.ts` — I/O test scaffold with 23 real assertions (fails on import until T02)
- `src/resources/extensions/gsd/tests/correction-detector.test.ts` — detector test scaffold with 14 real assertions (fails on import until T03)
