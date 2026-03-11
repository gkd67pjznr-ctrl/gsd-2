---
estimated_steps: 5
estimated_files: 2
---

# T01: Create quality-gating module with tests

**Slice:** S04 — Quality Gating
**Milestone:** M001

## Description

Build the core `quality-gating.ts` module that resolves quality level from preferences, builds quality sentinel instructions for prompt injection, and manages gate events in memory. Create comprehensive tests proving all three quality levels produce correct output, gate events are validated, and fast mode is a true no-op.

## Steps

1. Create `src/resources/extensions/gsd/quality-gating.ts` with types and constants:
   - `QualityLevel` type: `"fast" | "standard" | "strict"`
   - `GateEvent` interface: `{ gate: GateName, outcome: GateOutcome, level: QualityLevel, timestamp: number }`
   - `GateName` type: `"codebase_scan" | "context7_lookup" | "test_baseline" | "test_gate" | "diff_review"`
   - `GateOutcome` type: `"passed" | "warned" | "skipped" | "blocked"`
   - `VALID_GATES` Set and `VALID_OUTCOMES` Set for validation
   - `DEFAULT_QUALITY_LEVEL: "fast"` constant

2. Implement `resolveQualityLevel(cwd?: string): QualityLevel`:
   - Read `quality_level` from `loadEffectiveGSDPreferences()` (auto.ts always runs in real project context, per D018 pattern)
   - If missing or invalid, return `"fast"` (per R010: default fast = zero behavioral change)
   - Non-throwing: wrap in try/catch, return `"fast"` on any error

3. Implement `buildQualityInstructions(level: QualityLevel): string`:
   - Synchronous, non-throwing (required by loadPrompt template vars, per recall.ts pattern)
   - `"fast"` → return `""` (empty string, zero content, zero behavioral change)
   - `"standard"` → return pre-task block (codebase scan with rg/find, context7 lookup for new external deps) + post-task block (git diff review, test for new exported functions/classes). Target ~200-400 tokens
   - `"strict"` → return all standard content plus: mandatory context7 for ALL library APIs, test baseline before changes, full test suite after changes, line-by-line diff review. Target ~400-600 tokens
   - Use the draft instruction content from S04-RESEARCH.md as the base, refine for clarity and concreteness

4. Implement gate event management:
   - Module-level `let pendingGateEvents: GateEvent[] = []`
   - `recordGateEvent(gate, outcome, level)`: validates gate name and outcome against Sets, creates timestamped event, pushes to pending array. Invalid events silently dropped (non-throwing)
   - `getGateEvents(): GateEvent[]`: returns copy of pending events
   - `clearGateEvents(): void`: resets pending array (called after flush to metrics)

5. Create `src/resources/extensions/gsd/tests/quality-gating.test.ts` with 30+ assertions:
   - `resolveQualityLevel()` returns "fast" by default (no preferences)
   - `resolveQualityLevel()` returns configured level when set in preferences
   - `resolveQualityLevel()` returns "fast" for invalid quality_level values
   - `buildQualityInstructions("fast")` returns empty string
   - `buildQualityInstructions("fast")` has zero length
   - `buildQualityInstructions("standard")` returns non-empty string
   - `buildQualityInstructions("standard")` contains "codebase" or "codebase_scan" keyword
   - `buildQualityInstructions("standard")` contains "context7" or "Context7" keyword
   - `buildQualityInstructions("standard")` contains "diff" keyword
   - `buildQualityInstructions("standard")` does NOT contain "test baseline" or "full test suite"
   - `buildQualityInstructions("strict")` contains all standard keywords
   - `buildQualityInstructions("strict")` contains "baseline" keyword
   - `buildQualityInstructions("strict")` contains "full test" or equivalent
   - Token budget: standard ≤ 400 tokens (use estimateTokens from recall.ts)
   - Token budget: strict ≤ 600 tokens
   - Gate event recording: valid event is stored
   - Gate event recording: invalid gate name is silently dropped
   - Gate event recording: invalid outcome is silently dropped
   - Gate events have timestamp
   - `getGateEvents()` returns copy (mutation safety)
   - `clearGateEvents()` empties the array
   - Multiple events accumulate correctly
   - All 5 gate names accepted
   - All 4 outcomes accepted
   - Use temp directories and direct file writes for preferences testing (same pattern as recall.test.ts)

## Must-Haves

- [ ] `resolveQualityLevel()` defaults to "fast" and reads from preferences
- [ ] `buildQualityInstructions("fast")` returns empty string (zero content)
- [ ] `buildQualityInstructions("standard")` returns bounded instruction text with codebase scan, context7, diff review
- [ ] `buildQualityInstructions("strict")` returns all standard content plus test baseline, full test suite, strict diff
- [ ] Token budgets: standard ≤ 400, strict ≤ 600
- [ ] Gate event recording with validation (invalid events silently dropped)
- [ ] 30+ test assertions pass

## Verification

- `npx tsx src/resources/extensions/gsd/tests/quality-gating.test.ts` — all pass, 0 failures
- `npx tsc --noEmit` — compiles clean

## Observability Impact

- Signals added/changed: `GateEvent` type with structured gate/outcome/level/timestamp fields; pendingGateEvents in-memory array
- How a future agent inspects this: `getGateEvents()` returns current pending events; test file exercises all paths
- Failure state exposed: `resolveQualityLevel()` silently falls back to "fast" on any error; `recordGateEvent()` silently drops invalid events — both non-throwing

## Inputs

- `src/resources/extensions/gsd/preferences.ts` — `loadEffectiveGSDPreferences()`, `GSDPreferences` interface
- `src/resources/extensions/gsd/recall.ts` — `estimateTokens()` for token budget verification in tests
- `src/resources/extensions/gsd/corrections.ts` — `VALID_QUALITY_LEVELS` Set reference (may import or redefine)
- S04-RESEARCH.md — draft gate instruction content for standard/strict levels
- gsdup gate reference — 5 gate names, 4 outcomes from `write-gate-execution.cjs`

## Expected Output

- `src/resources/extensions/gsd/quality-gating.ts` — complete module with `resolveQualityLevel()`, `buildQualityInstructions()`, gate event management, types, and constants
- `src/resources/extensions/gsd/tests/quality-gating.test.ts` — 30+ passing assertions covering all quality levels, gate events, token budgets, and error handling
