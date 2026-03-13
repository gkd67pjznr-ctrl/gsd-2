# S03: Chat Mode with Quick Handoff — Research

**Date:** 2026-03-12

## Summary

S03 adds `/gsd chat` — a brainstorming mode with full recall injection, conversation persistence to `.gsd/conversations/`, summarization on end, task detection with `/gsd quick` suggestion, and task list creation for chat-to-quick handoff. The codebase is well-prepared: S01's always-on recall means chat sessions automatically get recall via `before_agent_start`; S02's `loadTaskList()` is ready to consume task lists; the `showDiscuss()` lifecycle pattern in `guided-flow.ts` (pending state + `agent_end` cleanup) is the exact model to follow.

The primary implementation challenge is the lifecycle: chat mode needs to (1) set status on start, (2) inject a prompt instructing the agent about its chat role, task detection, and persistence duties, (3) detect end-of-chat via an explicit `/gsd chat end` command or a new session, and (4) persist the conversation and capture corrections on end. The conversation persistence is instruction-based — the prompt tells the agent to write a summary and task list to `.gsd/conversations/` — not programmatic extraction.

**Primary recommendation:** Follow the quick mode pattern closely. `startChat()` sets status + dispatches prompt; `checkChatEnd()` captures corrections + resets status; `/gsd chat end` triggers summarization. The prompt template is the key artifact — it must instruct the agent to suggest `/gsd quick` when actionable work emerges and to write a task list file that `loadTaskList()` can parse.

## Recommendation

Build chat mode as a thin lifecycle wrapper around a well-crafted prompt template, following quick mode's structure:

1. **`chat.ts`** module with `startChat()`, `checkChatEnd()`, `isChatPending()` — mirrors `quick.ts`
2. **`chat-session.md`** prompt template instructing the agent about its role (brainstorming with recall), task detection (suggest `/gsd quick` when work emerges), and persistence (write summary + task list to output dir)
3. **`/gsd chat end`** subcommand triggers `endChat()` which sends a summarization prompt, then `agent_end` cleans up
4. **Chat-to-quick handoff**: chat prompt instructs agent to write `tasks.md` with markdown checkboxes to `<sessionDir>/tasks.md`; `/gsd quick` (without `--`) checks for recent task lists via `findRecentTaskList()` scanning `.gsd/conversations/`

Key difference from quick mode: chat is multi-turn. The initial prompt sets the context, but the agent continues conversing. End is explicit (`/gsd chat end`). The `agent_end` hook must distinguish between mid-conversation turns (do nothing) and the end-of-chat turn (capture + cleanup).

Use a `pendingChatEnd` flag: `/gsd chat end` sets it + dispatches summarization prompt; `agent_end` checks the flag and runs cleanup only when set.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Recall injection | `before_agent_start` in index.ts (S01) | Chat gets recall for free — no template var needed |
| Status bar transitions | `setGSDStatus(ctx, 'chat')` from status.ts | Single-line mode change |
| Correction capture | `transformSessionEntries` + `detectCorrections` + `writeCorrection` + `checkAndPromote` | Proven in quick.ts, copy the pattern |
| Task list parsing | `loadTaskList()` from task-list.ts (S02) | Already parses markdown checkboxes to `{title, done}[]` |
| Prompt template loading | `loadPrompt()` from prompt-loader.ts | `{{variable}}` substitution |
| Quality instructions | `buildQualityInstructions(resolveQualityLevel())` | Reuse same quality injection |
| Message dispatch | `pi.sendMessage()` with `triggerTurn: true` | Proven pattern in quick.ts, guided-flow.ts |

## Existing Code and Patterns

- `src/resources/extensions/gsd/quick.ts` — Direct model to follow. `startQuick()` (parse args → mkdir → set status → load prompt → send message) and `checkQuickEnd()` (capture corrections in try/finally → reset status). Chat mode is this same skeleton with multi-turn lifecycle.
- `src/resources/extensions/gsd/guided-flow.ts` lines 1-20 — `pendingAutoStart` pattern: stash state in a module-level variable, check it from `agent_end`. Chat mode needs `pendingChatEnd` similarly: set by `/gsd chat end`, checked in `agent_end`.
- `src/resources/extensions/gsd/commands.ts` line handling `"chat"` — Currently a stub showing "coming soon". Replace with `startChat()` dispatch. Also need to handle `"chat end"` as a subcommand.
- `src/resources/extensions/gsd/index.ts` `agent_end` handler — Already handles quick mode with `if (getGSDMode() === "quick")`. Add analogous `if (getGSDMode() === "chat")` block calling `checkChatEnd()`.
- `src/resources/extensions/gsd/task-list.ts` — `loadTaskList(path)` returns `TaskItem[]`. Chat-to-quick handoff: quick mode discovers task list file, passes path to `loadTaskList()`.

## Constraints

- Chat mode is multi-turn — `agent_end` fires after every LLM response, not just at session end. Must distinguish mid-conversation from end-of-chat.
- `/gsd chat end` must work as a command during an active chat session — the command handler fires in the same extension context.
- Conversation persistence is instruction-based (agent writes the files per prompt) — not programmatic. We cannot reliably extract conversation content from Pi session entries.
- Task list format must match what `loadTaskList()` expects: markdown lines `- [ ] Task title` or `- [x] Done task`.
- `.gsd/conversations/` directory must not interfere with milestone structure — separate from `.gsd/milestones/`.
- Quick mode's `parseQuickDescription()` returns empty string for bare `/gsd quick` — this is where task list discovery should trigger.

## Common Pitfalls

- **Running cleanup on every `agent_end` during chat** — Chat is multi-turn. Only clean up when `pendingChatEnd` is set. Otherwise you'd reset status after the first response.
- **Programmatic conversation extraction** — Don't try to extract conversation from session entries. The prompt tells the agent to write a summary file. This is consistent with how quick mode handles its summary (instruction-based, not programmatic).
- **Over-engineering task detection** — Don't build heuristics. The prompt instructs the agent to suggest `/gsd quick` when it notices actionable work. Instruction-based per D001's dual approach.
- **Complex handoff protocol** — A file in `.gsd/conversations/<session>/tasks.md` is sufficient. Quick mode scans for the most recent one. No IPC, no shared state.
- **Forgetting to handle `/gsd chat` while already in chat** — Guard against starting a new chat while one is active. Show a notification instead.

## Open Risks

- **End-of-chat detection edge case** — If the user closes Pi without running `/gsd chat end`, the session is orphaned (no summary). Mitigation: `session_shutdown` hook could set `pendingChatEnd` as a fallback, but the summarization prompt won't run. Accept this limitation — the conversation is still captured in Pi's session history.
- **Task list quality** — The agent may write task lists in unexpected formats. `loadTaskList()` handles this gracefully (returns empty array for non-matching lines), but the prompt must be explicit about the format.
- **Quick mode task list discovery** — `/gsd quick` without `--` needs to find the most recent task list. Scanning `.gsd/conversations/*/tasks.md` sorted by directory name (timestamp) is simple and sufficient.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| TypeScript | typescript-patterns | installed |
| Pi SDK | (project-internal) | N/A |

No external technologies — purely internal extension development.

## Sources

- `src/resources/extensions/gsd/quick.ts` — quick mode lifecycle pattern
- `src/resources/extensions/gsd/guided-flow.ts` — `pendingAutoStart` / `checkAutoStartAfterDiscuss()` pattern for deferred agent_end actions
- `src/resources/extensions/gsd/index.ts` — agent_end routing, before_agent_start recall injection
- `src/resources/extensions/gsd/task-list.ts` — `loadTaskList()` for handoff consumption
- `src/resources/extensions/gsd/status.ts` — mode management
- `src/resources/extensions/gsd/commands.ts` — command routing with stub to replace
