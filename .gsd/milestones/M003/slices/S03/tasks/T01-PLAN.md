---
estimated_steps: 6
estimated_files: 8
---

# T01: Chat module, prompt template, and test scaffolding

**Slice:** S03 — Chat Mode with Quick Handoff
**Milestone:** M003

## Description

Build the core chat mode lifecycle: `chat.ts` module (mirroring quick.ts), `chat-session.md` prompt template, command routing in `commands.ts`, agent_end handling in `index.ts`, and both test files with all assertions.

## Steps

1. Create `chat.ts` with `startChat()`, `endChat()`, `checkChatEnd()`, `isChatPending()`, `findRecentTaskList()`, and `_resetChat()`. Follow quick.ts lifecycle pattern exactly — pendingChatEnd flag checked in agent_end, try/finally for status reset, correction capture reusing transformSessionEntries + detectCorrections + writeCorrection + checkAndPromote pipeline.
2. Create `prompts/chat-session.md` with template variables `{{outputDir}}` and `{{quality}}`. Instructions: brainstorming role with recall (injected automatically via before_agent_start), suggest `/gsd quick` when actionable work detected, write `summary.md` and `tasks.md` (markdown checkboxes `- [ ] Task title`) to `{{outputDir}}` when `/gsd chat end` is called.
3. Replace chat stub in `commands.ts`: parse `"chat end"` → call `endChat(ctx, pi)`; bare `"chat"` → call `startChat(ctx, pi)`. Import from chat.ts.
4. Add chat mode handling in `index.ts` agent_end block: after the quick mode check, add `if (getGSDMode() === "chat") { await checkChatEnd(ctx, pi); return; }`. Import `checkChatEnd` from chat.ts.
5. Create `tests/chat-mode.test.ts` with assertions: startChat sets mode to "chat", startChat guards against double-start (shows notification), endChat sets pendingChatEnd flag, checkChatEnd resets mode to "idle", checkChatEnd only runs when pendingChatEnd is set, status resets on error (try/finally), correction capture invoked on end.
6. Create `tests/chat-handoff.test.ts` with assertions: findRecentTaskList returns path to most recent tasks.md, returns null when no conversations exist, returns null when conversations exist but none have tasks.md, sorts by directory name descending (most recent first).

## Must-Haves

- [ ] `chat.ts` exports startChat, endChat, checkChatEnd, isChatPending, findRecentTaskList, _resetChat
- [ ] `chat-session.md` prompt instructs agent to write tasks.md with `- [ ] ` format
- [ ] `/gsd chat` starts session, `/gsd chat end` triggers summarization
- [ ] agent_end handles chat mode with pendingChatEnd guard
- [ ] All test assertions pass in both test files

## Verification

- `npx tsx --test src/resources/extensions/gsd/tests/chat-mode.test.ts` — all assertions pass
- `npx tsx --test src/resources/extensions/gsd/tests/chat-handoff.test.ts` — all assertions pass
- `grep -c 'checkChatEnd' src/resources/extensions/gsd/index.ts` returns 2+ (import + usage)

## Observability Impact

- Signals added/changed: `getGSDMode()` returns `'chat'` during active session; `isChatPending()` returns true during active chat
- How a future agent inspects this: call `getGSDMode()` or `isChatPending()` to check chat state; `.gsd/conversations/` directory presence
- Failure state exposed: chat end errors caught in try/finally — status always resets to idle even on failure

## Inputs

- `src/resources/extensions/gsd/quick.ts` — lifecycle pattern to mirror
- `src/resources/extensions/gsd/status.ts` — setGSDStatus, getGSDMode
- `src/resources/extensions/gsd/task-list.ts` — loadTaskList for handoff consumption
- `src/resources/extensions/gsd/commands.ts` — current chat stub to replace
- `src/resources/extensions/gsd/index.ts` — agent_end block to extend

## Expected Output

- `src/resources/extensions/gsd/chat.ts` — new module with full chat lifecycle
- `src/resources/extensions/gsd/prompts/chat-session.md` — new prompt template
- `src/resources/extensions/gsd/commands.ts` — chat/chat end routing
- `src/resources/extensions/gsd/index.ts` — chat mode agent_end handling
- `src/resources/extensions/gsd/tests/chat-mode.test.ts` — ~10 assertions passing
- `src/resources/extensions/gsd/tests/chat-handoff.test.ts` — ~6 assertions passing
