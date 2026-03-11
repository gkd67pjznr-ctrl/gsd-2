---
id: T01
parent: S04
milestone: M001
provides:
  - quality-gating module with resolveQualityLevel, buildQualityInstructions, gate event management
  - QualityLevel, GateName, GateOutcome types and validation sets
  - 59 passing test assertions covering all quality levels, gate events, token budgets
key_files:
  - src/resources/extensions/gsd/quality-gating.ts
  - src/resources/extensions/gsd/tests/quality-gating.test.ts
key_decisions:
  - Gate instruction content uses concrete tool names (rg, find, resolve_library, get_library_docs, git diff) rather than abstract descriptions
  - VALID_QUALITY_LEVELS redefined locally (not imported from corrections.ts) to avoid tight coupling between unrelated modules
  - quality_level read via untyped cast from preferences — the typed field addition is deferred to T02
patterns_established:
  - Non-throwing quality module pattern matching recall.ts (synchronous, returns empty/default on error)
  - Module-level pending array for gate events with copy-on-read safety
observability_surfaces:
  - getGateEvents() returns pending gate events with structured gate/outcome/level/timestamp
  - resolveQualityLevel() silently falls back to "fast" on any error
  - recordGateEvent() silently drops invalid events (validated against VALID_GATES and VALID_OUTCOMES sets)
duration: 12m
verification_result: passed
completed_at: 2026-03-11
blocker_discovered: false
---

# T01: Create quality-gating module with tests

**Built core quality-gating.ts module with resolveQualityLevel(), buildQualityInstructions(), and gate event management — 59 test assertions all passing.**

## What Happened

Created `quality-gating.ts` with three primary exports:

1. **`resolveQualityLevel(cwd?)`** — reads `quality_level` from effective GSD preferences, returns "fast" on missing/invalid/error. Currently reads via untyped cast since the `quality_level` field isn't on `GSDPreferences` yet (T02 adds it).

2. **`buildQualityInstructions(level)`** — synchronous, non-throwing. Returns empty string for "fast" (zero behavioral change). Standard instructions (~130 tokens) include pre-task codebase scan + context7 for new deps, post-task diff review + test check. Strict instructions (~200 tokens) add mandatory context7 for all APIs, test baseline, full test suite, line-by-line diff review.

3. **Gate event management** — `recordGateEvent()` validates gate name and outcome against `VALID_GATES`/`VALID_OUTCOMES` sets, silently drops invalid events. `getGateEvents()` returns a copy (mutation-safe). `clearGateEvents()` resets for post-flush cleanup.

Test file covers all three quality levels, gate event CRUD, validation, token budgets, copy safety, and constant validation.

## Verification

- `npx tsx src/resources/extensions/gsd/tests/quality-gating.test.ts` — **59 passed, 0 failed**
- `npx tsc --noEmit` — clean compilation
- `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` — 22 passed, 0 failed (existing)
- `npx tsx src/resources/extensions/gsd/tests/corrections-io.test.ts` — 26 passed, 0 failed (existing)

Slice-level verification (partial — T01 of 3):
- ✅ quality-gating.test.ts — 59 assertions passing (exceeds 30+ target)
- ⬜ quality-gating-integration.test.ts — not yet created (T02)
- ✅ `npx tsc --noEmit` — passes
- ✅ Existing tests — recall.test.ts and corrections-io.test.ts still pass

## Diagnostics

- **Inspect gate events:** `getGateEvents()` returns `GateEvent[]` with gate name, outcome, level, and timestamp
- **Check quality level:** `resolveQualityLevel()` returns effective level; always returns a valid `QualityLevel`
- **Token budget verification:** Tests use `estimateTokens()` from recall.ts to assert standard ≤ 400 and strict ≤ 600 tokens

## Deviations

- Test count reached 59 assertions (nearly 2x the 30+ target) — additional assertions for keyword presence, negative checks, and constant validation proved useful
- `quality_level` read via untyped cast rather than a typed interface field — the typed field is T02's responsibility per the slice plan separation of concerns

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/quality-gating.ts` — new module with types, constants, resolveQualityLevel, buildQualityInstructions, gate event management
- `src/resources/extensions/gsd/tests/quality-gating.test.ts` — 59 test assertions covering all quality levels, gate events, token budgets, validation
