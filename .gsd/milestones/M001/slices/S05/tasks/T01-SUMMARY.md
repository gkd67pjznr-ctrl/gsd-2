---
id: T01
parent: S05
milestone: M001
provides:
  - tech-debt.ts module with logDebt, listDebt, resolveDebt, nextDebtId
  - TechDebtEntry, DebtType, DebtSeverity, DebtStatus types
  - WriteResult interface (mirrored from corrections.ts)
  - tech-debt.test.ts test suite (94 assertions)
key_files:
  - src/resources/extensions/gsd/tech-debt.ts
  - src/resources/extensions/gsd/tests/tech-debt.test.ts
key_decisions:
  - Mirrored WriteResult interface locally rather than importing from corrections.ts to keep modules decoupled
  - Used section-split parsing (split on headings, then find by index) for resolveDebt instead of single-regex capture, which avoids lazy/greedy regex pitfalls with multi-line markdown
patterns_established:
  - Structured markdown I/O pattern with sequential IDs, lenient regex parsing, and field defaults for missing data
  - nextDebtId uses max-existing + 1 for gap-safe sequential ID assignment
observability_surfaces:
  - WriteResult.reason on logDebt and resolveDebt returns 'invalid_entry' or 'error' for diagnostics
  - listDebt returns [] on any error (safe default, never throws)
  - listDebt({ status: 'open' }) for programmatic query of open tech debt
duration: 15m
verification_result: passed
completed_at: 2026-03-11
blocker_discovered: false
---

# T01: Build tech-debt.ts module and test suite

**Created tech-debt.ts with logDebt/listDebt/resolveDebt for structured markdown entries in .gsd/TECH-DEBT.md, plus 94-assertion test suite covering full lifecycle**

## What Happened

Built the core tech debt register module following the non-throwing I/O pattern from corrections.ts. The module manages `.gsd/TECH-DEBT.md` as human-readable structured markdown with sequential TD-NNN entries.

Key implementation details:
- `logDebt()` validates input (type, severity, required fields), reads existing file to find max ID via `nextDebtId()`, appends a formatted markdown section. Creates file with header if it doesn't exist.
- `listDebt()` splits content on `## TD-NNN:` headings and parses each section leniently with regex. Missing fields get safe defaults (severity→medium, component→unknown, type→bug). Invalid type/severity values also get defaults.
- `resolveDebt()` splits content into sections by heading, finds the target section by ID, updates status to resolved, adds resolved date and optional resolution context, then reassembles the file.
- `nextDebtId()` scans all `## TD-NNN:` patterns, takes max numeric value + 1, handles gaps correctly.
- All functions accept `cwd` parameter for test isolation and wrap everything in try/catch returning WriteResult or [].

## Verification

- `node --experimental-strip-types src/resources/extensions/gsd/tests/tech-debt.test.ts` — **94 passed, 0 failed**
- `npx tsc --noEmit` — clean compilation (no errors)
- Slice-level quality-gating tests have pre-existing import failures unrelated to T01 (missing `promote-preference.js`, `state.js` — these are from other modules, not this task's scope)

## Diagnostics

- `listDebt(undefined, { cwd })` — returns all entries as typed `TechDebtEntry[]`
- `listDebt({ status: 'open' }, { cwd })` — filters to open entries only
- `WriteResult.reason` — returns `'invalid_entry'` for validation failures, `'error'` for I/O failures
- Read `.gsd/TECH-DEBT.md` directly for human inspection

## Deviations

- Used section-split approach for `resolveDebt` instead of single regex capture. The initial regex approach with `[^]*?` (lazy quantifier) failed because `$` matched immediately, capturing zero content. Splitting on headings then finding by index is more robust for multi-line markdown sections.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/tech-debt.ts` — Core module with types, logDebt, listDebt, resolveDebt, nextDebtId
- `src/resources/extensions/gsd/tests/tech-debt.test.ts` — 94-assertion test suite covering write/read round-trip, ID sequencing, gap handling, all types/severities, resolve lifecycle, lenient parsing, error handling
