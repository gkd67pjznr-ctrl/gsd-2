# S03: Chat Mode with Quick Handoff — UAT

**Milestone:** M003
**Written:** 2026-03-12

## UAT Type

- UAT mode: mixed (artifact-driven + human-experience)
- Why this mode is sufficient: Core lifecycle and handoff mechanics are contract-proven via 31 test assertions. Human experience testing needed to verify the agent actually brainstorms well, suggests `/gsd quick` at the right time, and writes useful summaries/task lists.

## Preconditions

- Pi installed with GSD extension active
- A project with `.gsd/` directory initialized
- At least one correction/preference in `.gsd/patterns/` (to verify recall injection)

## Smoke Test

Run `/gsd chat`, type a message, verify status bar shows "chat". Type `/gsd chat end`, verify status resets to idle and `.gsd/conversations/` contains a new timestamped directory.

## Test Cases

### 1. Chat session lifecycle

1. Run `/gsd chat` in a GSD project
2. Send a brainstorming message about a code change
3. Verify the agent responds with recall context visible
4. Type `/gsd chat end`
5. **Expected:** Status bar resets to idle, `.gsd/conversations/<timestamp>/` created with `summary.md` and `tasks.md`

### 2. Chat-to-quick handoff

1. Complete test case 1 (ensure tasks.md exists with unchecked items)
2. Run `/gsd quick` (no `--` description)
3. **Expected:** Quick mode discovers the task list, shows "Execute task list from chat" in its prompt, executes the tasks

### 3. Double-start guard

1. Run `/gsd chat`
2. Run `/gsd chat` again
3. **Expected:** Second invocation shows a notification that chat is already active, does not create a duplicate session

### 4. Status bar during chat

1. Run `/gsd chat`
2. Press `Ctrl+Alt+G` to view dashboard
3. **Expected:** Status bar shows "chat" mode
4. Run `/gsd chat end`
5. **Expected:** Status bar shows idle (cleared)

## Edge Cases

### No task list exists

1. Ensure `.gsd/conversations/` is empty or absent
2. Run `/gsd quick` (bare)
3. **Expected:** Shows usage notification, does not crash

### Chat end with error

1. Start a chat session
2. Trigger `/gsd chat end`
3. **Expected:** Even if correction capture fails, status bar always resets to idle (try/finally)

## Failure Signals

- Status bar stuck on "chat" after session ends
- `.gsd/conversations/` directory not created after chat session
- Bare `/gsd quick` crashes or shows empty description instead of discovering task list
- Double `/gsd chat` creates parallel sessions

## Requirements Proved By This UAT

- R020 (Chat Persistence) — test case 1 proves conversations are persisted with summary + task list
- R022 (Status Bar) — test cases 1, 3, 4 prove chat mode status transitions
- R024 (Chat-to-Quick Handoff) — test case 2 proves task list flows from chat to quick mode

## Not Proven By This UAT

- Quality of agent brainstorming responses (depends on LLM behavior, not code)
- Whether the agent reliably suggests `/gsd quick` at the right moment (instruction-based, not programmatic)
- Whether summary.md content is actually useful for human review
- Recall injection quality during chat (proven by S01 tests, not re-proven here)

## Notes for Tester

- The chat-session.md prompt instructs the agent to write tasks.md with `- [ ]` checkbox format — verify the format is correct for loadTaskList() parsing
- The pre-existing embed-trigger.test.ts failure is unrelated and can be ignored
