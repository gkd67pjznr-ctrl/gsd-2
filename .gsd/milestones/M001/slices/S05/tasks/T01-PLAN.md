---
estimated_steps: 5
estimated_files: 2
---

# T01: Build tech-debt.ts module and test suite

**Slice:** S05 — Tech Debt & Passive Monitoring
**Milestone:** M001

## Description

Create the core tech debt register module (`tech-debt.ts`) and its test suite. The module provides `logDebt()`, `listDebt()`, and `resolveDebt()` for managing structured markdown entries in `.gsd/TECH-DEBT.md`. Follows the non-throwing I/O pattern from `corrections.ts` (D013) — all public functions return structured results or safe defaults, never throw. Uses `cwd` parameter for test isolation.

The TECH-DEBT.md format uses structured markdown with sequential TD-NNN entries (not JSONL) because this file is browsed by humans and agents during planning (D006, research notes).

## Steps

1. Create `tech-debt.ts` with types: `DebtType` (`'bug' | 'design' | 'test-gap' | 'doc-gap'`), `DebtSeverity` (`'critical' | 'high' | 'medium' | 'low'`), `DebtStatus` (`'open' | 'resolved' | 'deferred'`), and `TechDebtEntry` interface with fields: id, title, type, severity, component, status, logged (provenance string like "M001/S05/T01"), description, resolved (optional date string).

2. Implement `logDebt(entry, options?)` — reads existing `.gsd/TECH-DEBT.md`, parses for highest existing TD-NNN ID via `nextDebtId()`, assigns next sequential ID (handles gaps — max existing + 1), appends new entry as structured markdown section, creates file with header if it doesn't exist. Returns `WriteResult` (same interface from corrections.ts). Never throws.

3. Implement `listDebt(filters?, options?)` — reads `.gsd/TECH-DEBT.md`, parses entries leniently with regex (handles missing fields, extra whitespace, inconsistent formatting), returns `TechDebtEntry[]`. Optional status filter. Returns empty array on any error.

4. Implement `resolveDebt(id, resolvedInfo?, options?)` — finds the entry by TD-NNN ID, updates status from `open` to `resolved`, adds resolved date and optional resolution context. Returns `WriteResult`. Never throws.

5. Create `tech-debt.test.ts` with comprehensive assertions following corrections-io.test.ts pattern (custom `assert()`/`assertEq()`, `mkdtempSync()` for isolation, `try/finally` cleanup): write + read round-trip, sequential ID assignment, gap handling (TD-001, TD-003 → next is TD-004), all types/severities valid, resolve updates status, lenient parsing (missing fields, extra whitespace), non-throwing on I/O errors (bad path), empty/nonexistent file returns empty array, malformed entries skipped gracefully.

## Must-Haves

- [ ] `logDebt()` writes structured markdown entries to `.gsd/TECH-DEBT.md` with sequential TD-NNN IDs
- [ ] `listDebt()` parses entries leniently and returns typed `TechDebtEntry[]`
- [ ] `resolveDebt()` updates entry status to resolved
- [ ] All functions follow non-throwing I/O pattern (return `WriteResult` or `[]`, never throw)
- [ ] `cwd` parameter on all I/O functions for test isolation
- [ ] `nextDebtId()` handles gaps in existing IDs (uses max + 1, not count + 1)
- [ ] Test suite passes with assertions covering full lifecycle

## Verification

- `node --experimental-strip-types src/resources/extensions/gsd/tests/tech-debt.test.ts` — all assertions pass
- `npx tsc --noEmit` — clean compilation (tech-debt.ts types are sound)

## Observability Impact

- Signals added/changed: `WriteResult` return type on `logDebt()` and `resolveDebt()` mirrors corrections.ts diagnostic surface — callers know exactly why a write failed
- How a future agent inspects this: `listDebt({ status: 'open' })` to query open tech debt programmatically; read `.gsd/TECH-DEBT.md` directly for human inspection
- Failure state exposed: `WriteResult.reason` provides `'error'` on I/O failures; `listDebt()` returns `[]` on any error (safe default, no crash)

## Inputs

- `src/resources/extensions/gsd/corrections.ts` — reference implementation for non-throwing I/O pattern, `WriteResult` interface (reuse or mirror)
- `src/resources/extensions/gsd/tests/corrections-io.test.ts` — test pattern: custom assert helpers, mkdtempSync, try/finally cleanup
- S05 Research — TECH-DEBT.md format specification, `nextDebtId()` gap handling requirement

## Expected Output

- `src/resources/extensions/gsd/tech-debt.ts` — complete module with types, `logDebt()`, `listDebt()`, `resolveDebt()`, `nextDebtId()`
- `src/resources/extensions/gsd/tests/tech-debt.test.ts` — passing test suite covering write/read/resolve lifecycle, ID sequencing, lenient parsing, error handling
