---
estimated_steps: 5
estimated_files: 6
---

# T01: Add always-on recall injection and status bar helper with tests

**Slice:** S01 — Always-On Recall & Status Bar
**Milestone:** M003

## Description

Create the unified status bar helper (`status.ts`), inject `buildRecallBlock()` into the `before_agent_start` hook for non-auto sessions, migrate `auto.ts` from `"gsd-auto"` to the shared helper, add `chat`/`quick` subcommand stubs, and write tests for all new behavior.

## Steps

1. Create `src/resources/extensions/gsd/status.ts` — export `setGSDStatus(ctx: ExtensionContext, mode: 'idle' | 'chat' | 'quick' | 'auto')` that calls `ctx.ui.setStatus("gsd-mode", mode === 'idle' ? undefined : mode)`. Export `isAutoActive()` (module-level boolean flag toggled by `setGSDStatus`). Export `getGSDMode()` for testing.
2. In `src/resources/extensions/gsd/auto.ts`, replace all 5 `ctx.ui.setStatus("gsd-auto", ...)` → `setGSDStatus(ctx, ...)` mapping: `undefined` → `'idle'`, `"paused"` → `'idle'` (or keep a paused concept if needed), `"auto"` → `'auto'`. Import from `status.ts`.
3. In `src/resources/extensions/gsd/index.ts`, after the preferences/skills/worktree blocks in `before_agent_start`, add: if `!isAutoActive()`, call `await buildRecallBlock()` and append the result to `systemPrompt`. Import `buildRecallBlock` from `recall.ts` and `isAutoActive` from `status.ts`.
4. In `src/resources/extensions/gsd/commands.ts`, add `"chat"` and `"quick"` to the subcommands array. In the command handler switch, add stub cases that notify "Coming soon" via `ctx.ui.notify`.
5. Write `tests/always-on-recall.test.ts` — test that recall block is appended when auto is not active, skipped when auto is active, and handles empty recall gracefully. Write `tests/gsd-status.test.ts` — test `setGSDStatus` calls `setStatus` with correct key/value, `isAutoActive()` reflects mode, `getGSDMode()` returns current mode.

## Must-Haves

- [ ] `setGSDStatus()` exported from `status.ts` using `"gsd-mode"` key per D051
- [ ] `isAutoActive()` returns true only when mode is `'auto'`
- [ ] `buildRecallBlock()` called in `before_agent_start` only when `!isAutoActive()` per D052
- [ ] All 5 `"gsd-auto"` references in `auto.ts` replaced — zero remaining
- [ ] `"chat"` and `"quick"` in subcommands array
- [ ] Tests pass for recall injection and status helper
- [ ] All existing tests still pass

## Verification

- `npx vitest run src/resources/extensions/gsd/tests/always-on-recall.test.ts` — all pass
- `npx vitest run src/resources/extensions/gsd/tests/gsd-status.test.ts` — all pass
- `npx vitest run` — no regressions
- `grep -r '"gsd-auto"' src/resources/extensions/gsd/auto.ts` — returns nothing

## Observability Impact

- Signals added/changed: `"gsd-mode"` status bar key replaces `"gsd-auto"`; recall block now injected in non-auto sessions
- How a future agent inspects this: check `getGSDMode()` for current mode; recall presence visible in system prompt
- Failure state exposed: `buildRecallBlock()` returns "" on any error (existing behavior); `isAutoActive()` is deterministic

## Inputs

- `src/resources/extensions/gsd/recall.ts` — `buildRecallBlock()` signature and behavior
- `src/resources/extensions/gsd/auto.ts` — 5 `setStatus("gsd-auto", ...)` call sites
- `src/resources/extensions/gsd/index.ts` — `before_agent_start` hook structure
- `src/resources/extensions/gsd/commands.ts` — subcommands array

## Expected Output

- `src/resources/extensions/gsd/status.ts` — new module with `setGSDStatus`, `isAutoActive`, `getGSDMode`
- `src/resources/extensions/gsd/auto.ts` — migrated to use `setGSDStatus`, zero `"gsd-auto"` references
- `src/resources/extensions/gsd/index.ts` — recall injection in `before_agent_start` for non-auto sessions
- `src/resources/extensions/gsd/commands.ts` — `chat` and `quick` subcommands added
- `src/resources/extensions/gsd/tests/always-on-recall.test.ts` — recall injection tests
- `src/resources/extensions/gsd/tests/gsd-status.test.ts` — status helper tests
