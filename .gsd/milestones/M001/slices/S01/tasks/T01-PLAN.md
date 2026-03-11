---
estimated_steps: 4
estimated_files: 4
---

# T01: Create correction type definitions and test scaffold

**Slice:** S01 — Correction Capture Foundation
**Milestone:** M001

## Description

Establish the schema contract that the entire correction system depends on. Define the `CorrectionEntry` interface with 14-category taxonomy (D007), scope enum, source union, and validation helpers. Create all three test files for the slice — the type tests pass immediately, while I/O and detector tests contain real assertions that will fail until T02 and T03 implement the runtime code.

## Steps

1. Create `correction-types.ts` with:
   - `DiagnosisCategory` union type — 14 categories (7 code: `code.wrong_pattern`, `code.missing_context`, `code.stale_knowledge`, `code.over_engineering`, `code.under_engineering`, `code.style_mismatch`, `code.scope_drift`; 7 process: `process.planning_error`, `process.research_gap`, `process.implementation_bug`, `process.integration_miss`, `process.convention_violation`, `process.requirement_misread`, `process.regression`)
   - `VALID_CATEGORIES` — `Set<string>` with all 14 values, exported as a runtime constant
   - `CorrectionScope` — `'file' | 'filetype' | 'phase' | 'project' | 'global'`
   - `CorrectionSource` — `'self_report' | 'programmatic' | 'user_correction'`
   - `CorrectionEntry` interface — `correction_from`, `correction_to`, `diagnosis_category`, `diagnosis_text`, `scope`, `phase`, `timestamp`, `session_id`, `source`, plus optional `secondary_category`, `quality_level`, `file_path`, `unit_type`, `unit_id`, `retired_at`, `retired_by`
   - `isValidCategory(category: string): boolean` — checks against `VALID_CATEGORIES`
   - `isValidEntry(entry: unknown): entry is CorrectionEntry` — validates required fields, category, diagnosis_text word count (≤100)
   - `REQUIRED_FIELDS` — string array of the 9 required field names
2. Create `tests/correction-types.test.ts` — test `isValidCategory()` for all 14 valid categories and a few invalid ones; test `isValidEntry()` with a valid entry, entries missing each required field, invalid category, and diagnosis_text exceeding 100 words; verify `VALID_CATEGORIES` has exactly 14 entries
3. Create `tests/corrections-io.test.ts` — scaffold with imports from `../corrections.js`, test stubs for: write valid entry, write invalid entry rejected, field truncation, read with no file returns empty, read with status filter, rotation at threshold, archive cleanup by retention. Tests should have real assertions but will fail on import until T02 creates the module.
4. Create `tests/correction-detector.test.ts` — scaffold with imports from `../correction-detector.js`, test stubs for: detect retry from fixture, detect stuck from fixture, detect timeout from fixture, detect revert from fixture, clean session produces empty array. Tests should have real assertions but will fail on import until T03 creates the module.

## Must-Haves

- [ ] `CorrectionEntry` interface matches gsdup's 14-category schema with all required fields
- [ ] `VALID_CATEGORIES` contains exactly 14 categories — 7 code + 7 process
- [ ] `isValidEntry()` type guard validates required fields, category membership, and word count
- [ ] Type test file passes with all assertions green
- [ ] I/O and detector test files exist with real (initially failing) assertions

## Verification

- `node --experimental-strip-types src/resources/extensions/gsd/tests/correction-types.test.ts` exits 0 with all assertions passing
- `ls src/resources/extensions/gsd/tests/corrections-io.test.ts src/resources/extensions/gsd/tests/correction-detector.test.ts` confirms both files exist
- `grep -c 'assert' src/resources/extensions/gsd/tests/corrections-io.test.ts` shows meaningful assertion count (≥5)
- `grep -c 'assert' src/resources/extensions/gsd/tests/correction-detector.test.ts` shows meaningful assertion count (≥4)

## Observability Impact

- Signals added/changed: None — pure type definitions with no runtime side effects
- How a future agent inspects this: import `correction-types.ts` and verify exports; run the type test
- Failure state exposed: `isValidEntry()` returns false with no side effects for invalid entries

## Inputs

- gsdup `write-correction.cjs` — reference 14-category taxonomy, validation rules, required fields (source: `gsdup/.claude/hooks/lib/write-correction.cjs`)
- gsdup `correction-capture.test.ts` — test design reference (source: `gsdup/tests/hooks/correction-capture.test.ts`)
- gsd2 `types.ts` — pattern for pure type definition modules (source: `src/resources/extensions/gsd/types.ts`)
- gsd2 existing test pattern — `metrics-io.test.ts` for test structure and assertion pattern (source: `src/resources/extensions/gsd/tests/metrics-io.test.ts`)

## Expected Output

- `src/resources/extensions/gsd/correction-types.ts` — pure type definitions + validation helpers, no runtime dependencies beyond basic JS
- `src/resources/extensions/gsd/tests/correction-types.test.ts` — passing test file validating taxonomy and type guards
- `src/resources/extensions/gsd/tests/corrections-io.test.ts` — test file with real assertions (initially failing)
- `src/resources/extensions/gsd/tests/correction-detector.test.ts` — test file with real assertions (initially failing)
