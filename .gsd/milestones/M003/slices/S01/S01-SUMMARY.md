---
id: S01
parent: M003
milestone: M003
provides:
  - Unified status bar helper (status.ts) with setGSDStatus, isAutoActive, getGSDMode
  - Always-on recall injection in before_agent_start for non-auto sessions
  - chat/quick subcommand stubs in commands.ts
requires: []
affects:
  - S02
  - S03
key_files:
  - src/resources/extensions/gsd/status.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/index.ts
  - src/resources/extensions/gsd/commands.ts
  - src/resources/extensions/gsd/tests/gsd-status.test.ts
  - src/resources/extensions/gsd/tests/always-on-recall.test.ts
key_decisions:
  - Status bar key changed from "gsd-auto" to "gsd-mode" (D051)
  - Paused state maps to idle mode (D057)
  - Recall injection uses isAutoActive from status.ts to avoid circular imports (D056)
patterns_established:
  - status.ts as single source of truth for GSD mode across all modules
  - Non-auto sessions get recall injected via before_agent_start hook
observability_surfaces:
  - getGSDMode() returns current mode for inspection
  - "gsd-mode" status bar key shows active mode in TUI
  - Recall block presence in system prompt observable via buildRecallBlock output
drill_down_paths:
  - .gsd/milestones/M003/slices/S01/tasks/T01-SUMMARY.md
duration: 15min
verification_result: passed
completed_at: 2026-03-12
---

# S01: Always-On Recall & Status Bar

**Unified status bar helper and always-on recall injection for all GSD sessions, with chat/quick subcommand stubs.**

## What Happened

Created `status.ts` with `setGSDStatus(ctx, mode)`, `isAutoActive()`, `getGSDMode()`, and `_resetMode()` using the unified `"gsd-mode"` status bar key. Migrated all 5 `setStatus("gsd-auto", ...)` calls in `auto.ts` to use the new helper. Added recall injection in `index.ts` `before_agent_start`: when auto-mode is not active, `buildRecallBlock()` is called and the result appended to the system prompt. Added "chat" and "quick" to the subcommands array in `commands.ts` with stub handlers showing "coming soon" notifications. Wrote 27 test assertions across two test files.

## Verification

- `gsd-status.test.ts` — 16 assertions passed (mode transitions, status bar values, idle clears bar, isAutoActive guard)
- `always-on-recall.test.ts` — 11 assertions passed (recall injected for non-auto, skipped for auto, handles empty recall, appends to existing prompt)
- Full test suite: 67 passed, 1 failed (pre-existing embed-trigger.test.ts failure unrelated to this slice)
- `grep -r '"gsd-auto"' auto.ts | grep setStatus` returns nothing — migration complete

## Requirements Advanced

- R007 (Live Recall Injection) — Extended from auto-mode-only to all GSD sessions via `before_agent_start` hook
- R022 (Status Bar) — Unified `"gsd-mode"` key with helper function supporting idle/chat/quick/auto
- R023 (Always-On Recall) — `buildRecallBlock()` called for every non-auto GSD session

## Requirements Validated

- R023 (Always-On Recall) — 11 test assertions prove recall injection in before_agent_start, auto-mode skip, empty recall handling

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- Tests written with `node:test` + `npx tsx --test` instead of vitest (matching project convention, not the slice plan's vitest references)
- Paused auto-mode maps to `setGSDStatus(ctx, "idle")` rather than a separate "paused" value

## Known Limitations

- Status bar only shows idle and auto modes until S02/S03 implement quick and chat
- chat/quick subcommands are stubs — they show "coming soon" notifications only
- Pre-existing embed-trigger.test.ts failure remains

## Follow-ups

- none

## Files Created/Modified

- `src/resources/extensions/gsd/status.ts` — new unified status bar helper
- `src/resources/extensions/gsd/auto.ts` — migrated 5 setStatus calls to setGSDStatus
- `src/resources/extensions/gsd/index.ts` — added recall injection for non-auto sessions
- `src/resources/extensions/gsd/commands.ts` — added chat/quick subcommand stubs
- `src/resources/extensions/gsd/tests/gsd-status.test.ts` — 16 assertions
- `src/resources/extensions/gsd/tests/always-on-recall.test.ts` — 11 assertions

## Forward Intelligence

### What the next slice should know
- `setGSDStatus(ctx, 'quick')` is ready to use — just import from `status.ts` and call it at quick mode start/end
- Recall injection is automatic for non-auto sessions — quick mode gets it for free via `before_agent_start`
- The "quick" subcommand stub in `commands.ts` needs its handler replaced with real dispatch logic

### What's fragile
- `isAutoActive()` uses module-level state (`currentMode`) — if multiple modes could theoretically overlap, this would break. Currently safe because modes are mutually exclusive.

### Authoritative diagnostics
- `getGSDMode()` — returns the current mode string, trustworthy because it reads the same module state that `setGSDStatus` writes

### What assumptions changed
- Assumed vitest was the test runner — project actually uses `node:test` with `npx tsx --test`
