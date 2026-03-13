# S01: Always-On Recall & Status Bar

**Goal:** Every Pi session in a GSD project gets recall injected via `before_agent_start` (not just auto-mode), and a persistent status bar shows the current GSD mode (idle/auto) — with `chat` and `quick` subcommand stubs registered.
**Demo:** Run Pi in a GSD project without auto-mode → recall data appears in system prompt. Start auto-mode → status bar shows "auto". Stop → status bar clears. Unit tests pass for recall injection, status helper, and subcommand registration.

## Must-Haves

- `buildRecallBlock()` called in `before_agent_start` hook, output appended to system prompt
- Recall skipped when auto-mode is active (avoid duplication with `{{corrections}}` template variable)
- `setGSDStatus()` helper in `status.ts` using unified `"gsd-mode"` key
- All 5 `setStatus("gsd-auto", ...)` calls in `auto.ts` migrated to shared helper
- `chat` and `quick` added to subcommands array in `commands.ts` (routing stubs only)
- Unit tests for recall injection logic, status helper, and subcommand registration

## Proof Level

- This slice proves: contract + integration (real hook wiring with unit tests)
- Real runtime required: no (unit tests prove the contracts; live exercise is UAT)
- Human/UAT required: yes (live Pi session to confirm recall appears and status bar works)

## Verification

- `npx vitest run src/resources/extensions/gsd/tests/always-on-recall.test.ts`
- `npx vitest run src/resources/extensions/gsd/tests/gsd-status.test.ts`
- `npx vitest run` — all existing tests still pass

## Observability / Diagnostics

- Runtime signals: `buildRecallBlock()` already returns "" on error (non-throwing); status bar is visually observable
- Inspection surfaces: status bar in Pi TUI shows current mode; recall block visible in system prompt injection
- Failure visibility: recall silently degrades to empty string; status bar shows stale mode if setter not called
- Redaction constraints: none (no secrets involved)

## Integration Closure

- Upstream surfaces consumed: `buildRecallBlock()` from `recall.ts`, `setStatus()` from Pi SDK `ExtensionContext`, subcommand routing in `commands.ts`
- New wiring introduced in this slice: recall injection in `before_agent_start` hook, `setGSDStatus()` helper, unified `"gsd-mode"` key
- What remains before the milestone is truly usable end-to-end: S02 (quick mode implementation), S03 (chat mode + handoff)

## Tasks

- [x] **T01: Add always-on recall injection and status bar helper with tests** `est:1h`
  - Why: This is the entire slice — recall injection in `before_agent_start`, status helper module, auto.ts migration, subcommand stubs, and tests. The changes are small and tightly coupled (status helper must exist before auto.ts migration, recall injection depends on knowing auto-mode state).
  - Files: `src/resources/extensions/gsd/index.ts`, `src/resources/extensions/gsd/status.ts`, `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/commands.ts`, `src/resources/extensions/gsd/tests/always-on-recall.test.ts`, `src/resources/extensions/gsd/tests/gsd-status.test.ts`
  - Do: (1) Create `status.ts` with `setGSDStatus(ctx, mode)` and `isAutoActive()` helper. (2) Add `buildRecallBlock()` call in `before_agent_start` in `index.ts`, gated by `!isAutoActive()`. (3) Migrate all 5 `setStatus("gsd-auto", ...)` calls in `auto.ts` to `setGSDStatus()`. (4) Add `"chat"` and `"quick"` to subcommands array in `commands.ts`. (5) Write tests for recall injection logic and status helper.
  - Verify: `npx vitest run src/resources/extensions/gsd/tests/always-on-recall.test.ts && npx vitest run src/resources/extensions/gsd/tests/gsd-status.test.ts`
  - Done when: Tests pass, all existing tests still pass, `grep -r '"gsd-auto"' src/resources/extensions/gsd/auto.ts` returns nothing

## Files Likely Touched

- `src/resources/extensions/gsd/index.ts`
- `src/resources/extensions/gsd/status.ts` (new)
- `src/resources/extensions/gsd/auto.ts`
- `src/resources/extensions/gsd/commands.ts`
- `src/resources/extensions/gsd/tests/always-on-recall.test.ts` (new)
- `src/resources/extensions/gsd/tests/gsd-status.test.ts` (new)
