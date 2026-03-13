# S01: Always-On Recall & Status Bar — UAT

**Milestone:** M003
**Written:** 2026-03-12

## UAT Type

- UAT mode: mixed (artifact-driven + live-runtime)
- Why this mode is sufficient: Contract tests prove recall injection and status helper logic; live Pi session confirms TUI integration (status bar visibility, recall in prompt)

## Preconditions

- Pi installed with gsd extension
- A GSD-initialized project (`.gsd/` directory exists with patterns data)
- Auto-mode NOT running

## Smoke Test

Open Pi in a GSD project without auto-mode. The system prompt should contain recall data (corrections/preferences) wrapped in `<system-reminder>` tags. No status bar entry should appear (idle = cleared).

## Test Cases

### 1. Always-on recall injection (non-auto)

1. Open Pi in a GSD project that has corrections/preferences in `.gsd/patterns/`
2. Start a conversation (any prompt)
3. **Expected:** System prompt includes recall block from `buildRecallBlock()` — visible as `<system-reminder>` content

### 2. Status bar shows "auto" during auto-mode

1. Run `/gsd auto` in a project with pending work
2. Observe the Pi status bar
3. **Expected:** Status bar shows "auto" mode indicator via `"gsd-mode"` key

### 3. Status bar clears on auto-mode stop

1. While auto-mode is running, run `/gsd stop`
2. **Expected:** Status bar clears (no `"gsd-mode"` entry — idle state)

### 4. Recall skipped during auto-mode

1. While auto-mode is running, observe dispatch prompts
2. **Expected:** `before_agent_start` does NOT inject recall (auto-mode uses `{{corrections}}` template variable instead, avoiding duplication)

### 5. Chat and quick stubs registered

1. Type `/gsd chat` or `/gsd quick`
2. **Expected:** "Coming soon" notification appears

## Edge Cases

### No corrections/preferences exist

1. Open Pi in a GSD project with empty `.gsd/patterns/`
2. **Expected:** `buildRecallBlock()` returns empty string; no recall injected; no errors

### Auto-mode paused

1. Pause auto-mode (if supported)
2. **Expected:** Status bar clears (paused maps to idle)

## Failure Signals

- Status bar shows stale mode after transition (e.g., still shows "auto" after stop)
- Recall block appears during auto-mode (duplication)
- No recall block appears in non-auto sessions despite having corrections data
- Error in console during `before_agent_start` hook

## Requirements Proved By This UAT

- R023 (Always-On Recall) — live confirmation that recall appears in non-auto sessions
- R022 (Status Bar) — live confirmation that status bar reflects mode transitions
- R007 (Live Recall Injection) — extended to all sessions, not just auto-mode dispatch

## Not Proven By This UAT

- R022 status bar showing "chat" and "quick" modes (those modes don't exist yet — S02/S03)
- Performance impact of always-on recall (buildRecallBlock latency in real sessions)
- Chat-to-quick handoff (S03)

## Notes for Tester

- The pre-existing embed-trigger.test.ts failure is unrelated to this slice
- "Coming soon" stubs for chat/quick are intentional — real implementations come in S02/S03
- To verify recall content, you may need to inspect the system prompt programmatically or look for behavioral evidence that the agent references past corrections
