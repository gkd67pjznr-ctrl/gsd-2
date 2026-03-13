---
id: T01
parent: S01
milestone: M003
provides:
  - Unified status bar helper (status.ts) with setGSDStatus, isAutoActive, getGSDMode
  - Always-on recall injection in before_agent_start for non-auto sessions
  - chat/quick subcommand stubs in commands.ts
key_files:
  - src/resources/extensions/gsd/status.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/index.ts
  - src/resources/extensions/gsd/commands.ts
  - src/resources/extensions/gsd/tests/gsd-status.test.ts
  - src/resources/extensions/gsd/tests/always-on-recall.test.ts
key_decisions:
  - Status bar key changed from "gsd-auto" to "gsd-mode" (D051)
  - Paused state maps to idle mode (clears status bar) rather than a separate "paused" value
  - Recall injection uses isAutoActive from status.ts, not auto.ts, to avoid circular imports
patterns_established:
  - status.ts as the single source of truth for GSD mode across all modules
  - Non-auto sessions get recall injected via before_agent_start hook
observability_surfaces:
  - getGSDMode() returns current mode for inspection
  - "gsd-mode" status bar key shows active mode in TUI
  - Recall block presence in system prompt observable via buildRecallBlock output
duration: 15min
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T01: Add always-on recall injection and status bar helper with tests

**Created unified status bar helper, migrated auto.ts from "gsd-auto" to "gsd-mode", injected recall in non-auto sessions, added chat/quick stubs, and wrote tests.**

## What Happened

1. Created `status.ts` with `setGSDStatus(ctx, mode)`, `isAutoActive()`, `getGSDMode()`, and `_resetMode()`. Uses "gsd-mode" key; idle clears the status bar.
2. Migrated all 5 `ctx.ui.setStatus("gsd-auto", ...)` calls in `auto.ts` to use `setGSDStatus()`. The `customType: "gsd-auto"` message type was intentionally preserved (it's a message type, not a status key).
3. Added recall injection in `index.ts` `before_agent_start`: when `!isAutoActive()` (from status.ts), calls `buildRecallBlock()` and appends result to systemPrompt.
4. Added "chat" and "quick" to subcommands array in `commands.ts` with stub handlers that show "coming soon" notifications.
5. Wrote `gsd-status.test.ts` (16 assertions) and `always-on-recall.test.ts` (11 assertions).

## Verification

- `npx tsx --test src/resources/extensions/gsd/tests/gsd-status.test.ts` — 16 passed, 0 failed
- `npx tsx --test src/resources/extensions/gsd/tests/always-on-recall.test.ts` — 11 passed, 0 failed
- `npx tsx --test src/resources/extensions/gsd/tests/*.test.ts` — 67 passed, 1 failed (pre-existing embed-trigger.test.ts failure)
- `grep -r '"gsd-auto"' src/resources/extensions/gsd/auto.ts | grep setStatus` — returns nothing

Slice-level verification: both test files pass. Full suite has 1 pre-existing failure unrelated to this task.

## Diagnostics

- `getGSDMode()` returns current mode at any time
- Status bar key "gsd-mode" visible in Pi TUI
- Recall injection: check system prompt content in before_agent_start for `<system-reminder>` tags

## Deviations

- Task plan referenced `npx vitest run` but the project uses `node --test` / `npx tsx --test`. Tests written in the project's existing assertion pattern (not vitest describe/it).
- Paused auto-mode maps to `setGSDStatus(ctx, "idle")` rather than keeping a separate "paused" value, since paused is not a distinct GSD mode for status bar purposes.

## Known Issues

- Pre-existing test failure in `embed-trigger.test.ts` — unrelated to this task.

## Files Created/Modified

- `src/resources/extensions/gsd/status.ts` — new unified status bar helper
- `src/resources/extensions/gsd/auto.ts` — migrated 5 setStatus calls to setGSDStatus, added import
- `src/resources/extensions/gsd/index.ts` — added recall injection for non-auto sessions
- `src/resources/extensions/gsd/commands.ts` — added chat/quick subcommand stubs
- `src/resources/extensions/gsd/tests/gsd-status.test.ts` — 16 assertions for status helper
- `src/resources/extensions/gsd/tests/always-on-recall.test.ts` — 11 assertions for recall injection
