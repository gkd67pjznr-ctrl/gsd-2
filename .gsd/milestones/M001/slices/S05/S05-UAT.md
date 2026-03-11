# S05: Tech Debt & Passive Monitoring — UAT

**Milestone:** M001
**Written:** 2026-03-11

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All three deliverables (tech debt I/O, quality instruction extension, drift detection) are contract-verifiable via unit tests with fixture data. No live runtime or user interaction required — the modules produce deterministic outputs from structured inputs.

## Preconditions

- Node.js 22+ with `--experimental-strip-types` support
- `npx tsx` available for tests with transitive `.js` imports
- Repository compiles cleanly with `npx tsc --noEmit`

## Smoke Test

Run `node --experimental-strip-types src/resources/extensions/gsd/tests/tech-debt.test.ts` — should report 94 passed, 0 failed. This exercises the core tech debt register lifecycle end-to-end.

## Test Cases

### 1. Tech debt write/read round-trip

1. Call `logDebt()` with type='bug', severity='high', component='auto.ts', description='Test issue'
2. Call `listDebt()` on the same directory
3. **Expected:** Returns array with one entry, id='TD-001', matching all fields, status='open'

### 2. Sequential ID assignment with gaps

1. Write a TECH-DEBT.md file with TD-001 and TD-005 entries (gap at 2-4)
2. Call `logDebt()` to add a new entry
3. **Expected:** New entry gets TD-006 (max existing + 1), not TD-002

### 3. Tech debt auto-logging in quality instructions

1. Call `buildQualityInstructions('standard')`
2. Call `buildQualityInstructions('strict')`
3. Call `buildQualityInstructions('fast')`
4. **Expected:** Standard output contains 'TECH-DEBT' and 'critical/high'. Strict output contains 'TECH-DEBT' and references all severities. Fast output is empty string.

### 4. Plan-vs-summary drift detection — expansion

1. Create plan content with tasks T01, T02
2. Create summary content mentioning T01, T02, T03
3. Call `diffPlanVsSummary(planContent, summaryContent)`
4. **Expected:** DriftResult with one observation of kind='expansion' referencing T03

### 5. Plan-vs-summary drift — documented deviation excluded

1. Create plan with T01, T02. Summary mentions T01, T02, T03 with T03 in Deviations section
2. Call `diffPlanVsSummary(planContent, summaryContent)`
3. **Expected:** Empty observations array — T03 is a documented deviation, not undocumented drift

### 6. Passive monitoring wired into auto.ts

1. Grep auto.ts for `diffPlanVsSummary`
2. Grep auto.ts for `correction_capture`
3. Grep auto.ts for `complete-slice`
4. **Expected:** All three patterns found, confirming the hook is wired with kill switch and unit type gate

## Edge Cases

### Empty TECH-DEBT.md file

1. Call `listDebt()` on directory with empty TECH-DEBT.md
2. **Expected:** Returns empty array, no errors

### Malformed TECH-DEBT.md entries

1. Write TECH-DEBT.md with entries missing severity/type fields
2. Call `listDebt()`
3. **Expected:** Returns entries with safe defaults (severity→medium, type→bug, component→unknown)

### Resolve non-existent debt entry

1. Call `resolveDebt('TD-999')` on file with no such ID
2. **Expected:** Returns `{ written: false, reason: 'error' }`, does not corrupt file

### Empty plan or summary content

1. Call `diffPlanVsSummary('', '')`
2. **Expected:** Returns `{ observations: [], planTaskCount: 0, summaryTaskCount: 0 }`

## Failure Signals

- Any test suite reporting failures (tech-debt, passive-monitor, quality-gating, quality-gating-integration)
- `npx tsc --noEmit` producing type errors
- `buildQualityInstructions('fast')` returning non-empty string (tech debt text leaking to fast level)
- `diffPlanVsSummary` not imported in auto.ts (grep returns 0)
- `listDebt()` throwing instead of returning empty array on error

## Requirements Proved By This UAT

- R013 (Tech Debt Register) — 94 test assertions prove structured markdown register with sequential IDs, all types/severities, resolve lifecycle, lenient parsing, non-throwing errors
- R014 (Tech Debt Auto-Logging) — Integration tests prove instruction injection at standard/strict, absence at fast, correct severity gating
- R015 (Passive Monitoring) — 34 test assertions prove drift detection for expansion/contraction/shift, deviation exclusion, error handling; grep confirms auto.ts wiring

## Not Proven By This UAT

- R013 runtime behavior: actual agent calls to `logDebt()` during execution (instruction-based, not enforced programmatically)
- R014 runtime behavior: agent compliance with auto-logging instructions in dispatch prompts
- R015 runtime behavior: passive monitoring producing real drift corrections from a live auto-mode slice completion (proven only via code inspection and unit tests)

## Notes for Tester

- Tests for passive-monitor and quality-gating use `npx tsx` instead of `node --experimental-strip-types` due to transitive `.js` import chain in files.ts. This is expected.
- Tech debt auto-logging is instruction-based — the dispatch prompt tells the agent to call `logDebt()`. There is no programmatic enforcement. The UAT verifies the instructions are present, not that a live agent follows them.
- This is the final slice of M001. After UAT passes, the milestone integration verification assembles and tests the full system.
