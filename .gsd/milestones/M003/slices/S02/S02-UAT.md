# S02: Quick Mode — UAT

**Milestone:** M003
**Written:** 2026-03-12

## UAT Type

- UAT mode: mixed (artifact-driven + human-experience)
- Why this mode is sufficient: Contract tests prove dispatch mechanics, but "feels lightweight" requires a human running the real command

## Preconditions

- Pi installed and working
- GSD extension loaded (gsd2up project)
- A GSD project with `.gsd/` directory initialized

## Smoke Test

Run `/gsd quick --fix a typo in README` — status bar should show "quick", agent should execute, and `.gsd/quick/<timestamp>/` directory should appear after completion.

## Test Cases

### 1. Basic quick task execution

1. Open Pi in a GSD project
2. Run `/gsd quick --fix the login button hover state`
3. Observe status bar shows "quick"
4. Wait for agent to complete
5. **Expected:** Status bar returns to idle, `.gsd/quick/<timestamp>/summary.md` exists

### 2. Bare text description (no `--` prefix)

1. Run `/gsd quick fix the login button`
2. **Expected:** Works identically to `--fix the login button` — `--` prefix is stripped if present but not required

### 3. Empty description rejected

1. Run `/gsd quick`
2. **Expected:** Error message asking for a task description, no directory created

### 4. Recall injection present

1. Add some corrections to `.gsd/patterns/corrections.jsonl`
2. Run `/gsd quick --refactor the header component`
3. **Expected:** Agent session includes recall data from before_agent_start (visible in agent behavior referencing past corrections)

### 5. Error recovery

1. Force an error during quick mode (e.g., kill the session)
2. **Expected:** Status bar resets to "idle" (not stuck on "quick")

## Edge Cases

### Long description

1. Run `/gsd quick --fix the login button hover state, also update the color scheme to match the new brand guidelines, and make sure the responsive layout works on mobile`
2. **Expected:** Full description passed to prompt template, agent receives complete context

### Quick mode during auto mode

1. Start auto mode (`/gsd auto`)
2. Attempt `/gsd quick --fix something`
3. **Expected:** Appropriate guard — either queued or rejected (auto mode takes priority)

## Failure Signals

- Status bar stuck on "quick" after completion or error
- No `.gsd/quick/<timestamp>/` directory created
- Agent doesn't receive quality instructions in prompt
- Corrections not captured after quick mode session

## Requirements Proved By This UAT

- R021 (Quick Mode) — full end-to-end quick task execution with recall, corrections, and summary output
- R022 (Status Bar) — quick mode status transitions visible to user

## Not Proven By This UAT

- R024 (Chat-to-Quick Handoff) — loadTaskList is implemented but handoff flow requires S03's chat mode
- Runtime performance of quick mode dispatch (no load testing)
- Agent actually writes a useful summary (instruction-based, not programmatic)

## Notes for Tester

- The 1 failing test in embed-trigger.test.ts is pre-existing and unrelated to quick mode
- Quick mode relies on `before_agent_start` for recall — if that hook isn't firing, recall won't appear
- Summary quality depends on the LLM following prompt instructions — check that `quick-task.md` template variables are substituted correctly
