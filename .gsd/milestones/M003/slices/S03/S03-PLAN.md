# S03: Chat Mode with Quick Handoff

**Goal:** `/gsd chat` starts a brainstorming session with full recall, persists conversations to `.gsd/conversations/`, suggests `/gsd quick` when actionable work is detected, and creates task lists that `/gsd quick` discovers and loads.
**Demo:** User types `/gsd chat`, converses with the agent (recall injected automatically), types `/gsd chat end` to summarize, agent writes summary + task list to `.gsd/conversations/<session>/`, then `/gsd quick` (without `--`) finds and executes that task list. Status bar shows "chat" throughout.

## Must-Haves

- `chat.ts` module with `startChat()`, `checkChatEnd()`, `isChatPending()` mirroring quick.ts lifecycle
- `chat-session.md` prompt template instructing agent about brainstorming role, task detection, `/gsd quick` suggestion, and persistence duties
- `/gsd chat end` triggers summarization prompt; `agent_end` cleans up only when `pendingChatEnd` flag is set
- Chat sessions write summary + `tasks.md` to `.gsd/conversations/<timestamp>/`
- `findRecentTaskList()` scans `.gsd/conversations/` for most recent `tasks.md`; `/gsd quick` (bare) invokes it
- Status bar shows "chat" during session, resets to "idle" on end
- Correction capture on chat end (reuse auto-mode pipeline)

## Proof Level

- This slice proves: contract + integration
- Real runtime required: no (contract proven via unit tests; UAT deferred to milestone verification)
- Human/UAT required: yes (for feel/experience, at milestone level)

## Verification

- `npx tsx --test src/resources/extensions/gsd/tests/chat-mode.test.ts` — chat lifecycle: startChat sets status, checkChatEnd resets, pendingChatEnd flag, guard against double-start, correction capture
- `npx tsx --test src/resources/extensions/gsd/tests/chat-handoff.test.ts` — findRecentTaskList discovery, quick mode task list integration, empty directory handling
- Full suite: `npx tsx --test src/resources/extensions/gsd/tests/*.test.ts` — all existing + new tests pass

## Observability / Diagnostics

- Runtime signals: `getGSDMode()` returns `'chat'` during active session, `'idle'` after
- Inspection surfaces: `.gsd/conversations/<timestamp>/` directory presence confirms chat ran; `tasks.md` confirms task list created
- Failure visibility: `isChatPending()` — true during active chat, false otherwise; chat end errors caught in try/finally (status always resets)
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `status.ts` (setGSDStatus, getGSDMode), `recall.ts` (buildRecallBlock via before_agent_start), `task-list.ts` (loadTaskList), `prompt-loader.ts` (loadPrompt), `auto.ts` (transformSessionEntries), `correction-detector.ts` (detectCorrections), `corrections.ts` (writeCorrection), `pattern-preferences.ts` (checkAndPromote), `quality-gating.ts` (resolveQualityLevel, buildQualityInstructions)
- New wiring introduced in this slice: `chat.ts` module, `chat-session.md` prompt, `findRecentTaskList()` in `chat.ts`, command routing for `chat`/`chat end` in `commands.ts`, `agent_end` chat handling in `index.ts`, quick mode bare invocation wired to task list discovery
- What remains before the milestone is truly usable end-to-end: nothing — all M003 slices complete after this

## Tasks

- [x] **T01: Chat module, prompt template, and test scaffolding** `est:45m`
  - Why: Core chat lifecycle — creates the module, prompt, command wiring, and agent_end handling. Also creates both test files with assertions (initially failing).
  - Files: `src/resources/extensions/gsd/chat.ts`, `src/resources/extensions/gsd/prompts/chat-session.md`, `src/resources/extensions/gsd/commands.ts`, `src/resources/extensions/gsd/index.ts`, `src/resources/extensions/gsd/tests/chat-mode.test.ts`, `src/resources/extensions/gsd/tests/chat-handoff.test.ts`
  - Do: (1) Create `chat.ts` with `startChat()` (guard double-start, mkdir `.gsd/conversations/<timestamp>`, set status to chat, load chat-session prompt, sendMessage), `checkChatEnd()` (capture corrections via reused pipeline, reset status in try/finally, clear pendingChatEnd), `isChatPending()`, `endChat()` (set pendingChatEnd flag, send summarization prompt), `findRecentTaskList()` (scan `.gsd/conversations/*/tasks.md` sorted by dir name descending, return path or null), `_resetChat()` for testing. (2) Create `chat-session.md` prompt with role instructions, task detection guidance, `/gsd quick` suggestion, persistence instructions (write summary.md + tasks.md with markdown checkboxes to `{{outputDir}}`). (3) Replace chat stub in `commands.ts`: route `chat end` to `endChat()`, bare `chat` to `startChat()`. (4) Add chat mode handling in `index.ts` agent_end: when mode is chat and pendingChatEnd is set, call `checkChatEnd()`. (5) Create `chat-mode.test.ts` with assertions for: startChat sets mode to chat, checkChatEnd resets to idle, pendingChatEnd flag lifecycle, double-start guard, correction capture call. (6) Create `chat-handoff.test.ts` with assertions for: findRecentTaskList finds most recent, returns null on empty dir, skips dirs without tasks.md.
  - Verify: `npx tsx --test src/resources/extensions/gsd/tests/chat-mode.test.ts && npx tsx --test src/resources/extensions/gsd/tests/chat-handoff.test.ts`
  - Done when: Both test files pass all assertions, chat command routing works, agent_end handles chat mode

- [x] **T02: Wire quick mode to discover and load chat task lists** `est:20m`
  - Why: Completes the chat-to-quick handoff — bare `/gsd quick` finds the most recent task list from chat and dispatches it
  - Files: `src/resources/extensions/gsd/quick.ts`, `src/resources/extensions/gsd/commands.ts`, `src/resources/extensions/gsd/tests/chat-handoff.test.ts`
  - Do: (1) In quick.ts `startQuick()`, when `parseQuickDescription()` returns empty string, call `findRecentTaskList()` — if found, load via `loadTaskList()`, format task titles into description, pass to prompt. (2) Update `chat-handoff.test.ts` with assertions for: bare `/gsd quick` triggers task list discovery, task list items formatted into quick prompt description. (3) Verify full test suite passes.
  - Verify: `npx tsx --test src/resources/extensions/gsd/tests/chat-handoff.test.ts && npx tsx --test src/resources/extensions/gsd/tests/*.test.ts`
  - Done when: Bare `/gsd quick` discovers most recent chat task list and dispatches it as a quick mode task; all tests pass including pre-existing

## Files Likely Touched

- `src/resources/extensions/gsd/chat.ts` — new
- `src/resources/extensions/gsd/prompts/chat-session.md` — new
- `src/resources/extensions/gsd/commands.ts` — route chat/chat end
- `src/resources/extensions/gsd/index.ts` — agent_end chat handling
- `src/resources/extensions/gsd/quick.ts` — bare invocation task list discovery
- `src/resources/extensions/gsd/tests/chat-mode.test.ts` — new
- `src/resources/extensions/gsd/tests/chat-handoff.test.ts` — new
