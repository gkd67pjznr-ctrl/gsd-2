# S02: Quick Mode

**Goal:** `/gsd quick --fix the login button` dispatches a single-session task through all phases with recall, correction capture, and summary output.
**Demo:** User runs `/gsd quick --fix the login button`, status bar shows "quick", agent executes the task in one session, corrections are captured, summary is written to `.gsd/quick/<timestamp>/summary.md`, status bar returns to "idle".

## Must-Haves

- Parse description from `/gsd quick --<description>` args (handle `--` prefix or bare text)
- Create `.gsd/quick/<timestamp>/` directory for task artifacts
- Set status bar to "quick" during execution, reset to "idle" on completion/error
- Load and send `quick-task.md` prompt template with `{{description}}` and `{{quality}}` vars
- Dispatch via `pi.sendMessage()` with `triggerTurn: true`
- Capture corrections from session via `agent_end` hook (reuse `transformSessionEntries` + `detectCorrections`)
- Write summary to `.gsd/quick/<timestamp>/summary.md` (instruction-based per D001)
- Export `loadTaskList(path)` function for S03's chat-to-quick handoff
- Recall injection happens automatically via `before_agent_start` (S01) — no duplication needed

## Proof Level

- This slice proves: contract + integration
- Real runtime required: no (contract proven via unit tests; live Pi exercise is UAT)
- Human/UAT required: yes (final verification that the command feels lightweight in real Pi)

## Verification

- `npx tsx --test src/resources/extensions/gsd/tests/quick-mode.test.ts` — tests for arg parsing, directory creation, prompt loading, status transitions, correction capture in agent_end, error recovery (status reset)
- `npx tsx --test src/resources/extensions/gsd/tests/load-task-list.test.ts` — tests for markdown task list parsing (checkboxes, edge cases)
- Full suite: `npx tsx --test src/resources/extensions/gsd/tests/*.test.ts` — all existing tests still pass

## Observability / Diagnostics

- Runtime signals: `getGSDMode()` returns `'quick'` during execution, `'idle'` after
- Inspection surfaces: `.gsd/quick/<timestamp>/summary.md` exists after completion; `getGSDMode()` for current state
- Failure visibility: status bar resets to idle on error (try/finally); correction capture failures are non-fatal (consistent with D013)
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `status.ts` (setGSDStatus, isAutoActive, getGSDMode), `prompt-loader.ts` (loadPrompt), `index.ts` (agent_end hook, before_agent_start recall), `auto.ts` (transformSessionEntries, detectCorrections pattern, buildQualityVar pattern), `commands.ts` (quick stub)
- New wiring introduced in this slice: quick mode dispatch in commands.ts, quick mode cleanup in index.ts agent_end, quick-task.md prompt template
- What remains before the milestone is truly usable end-to-end: S03 (chat mode, chat-to-quick handoff via loadTaskList)

## Tasks

- [x] **T01: Implement quick mode dispatch and prompt template** `est:45m`
  - Why: Core quick mode functionality — arg parsing, directory setup, prompt template, dispatch, status bar transitions, agent_end cleanup with correction capture
  - Files: `src/resources/extensions/gsd/quick.ts`, `src/resources/extensions/gsd/prompts/quick-task.md`, `src/resources/extensions/gsd/commands.ts`, `src/resources/extensions/gsd/index.ts`, `src/resources/extensions/gsd/auto.ts`
  - Do: Create `quick.ts` with `startQuick(ctx, pi, description)` function following `showDiscuss()` lifecycle pattern. Create `quick-task.md` prompt with `{{description}}` and `{{quality}}` vars instructing the agent to research→plan→execute→verify in one session and write summary to the quick directory. Replace the quick stub in `commands.ts`. Add quick mode check in `index.ts` `agent_end` hook (guarded by `getGSDMode() === 'quick'`). Export `transformSessionEntries` from `auto.ts` (or extract to shared module). Use try/finally for status reset.
  - Verify: `npx tsx --test src/resources/extensions/gsd/tests/quick-mode.test.ts`
  - Done when: All quick-mode tests pass covering arg parsing, directory creation, prompt template loading, status transitions, and agent_end correction capture

- [x] **T02: Implement loadTaskList and verify full test suite** `est:20m`
  - Why: S03 boundary dependency — quick mode needs to accept task lists from chat sessions. Also final verification that all existing tests pass.
  - Files: `src/resources/extensions/gsd/task-list.ts`, `src/resources/extensions/gsd/tests/load-task-list.test.ts`
  - Do: Create `task-list.ts` exporting `loadTaskList(path)` that reads a markdown file with `- [ ] task` / `- [x] task` checkboxes and returns `{title: string, done: boolean}[]`. Handle missing files (return empty array), malformed lines (skip), nested content (ignore non-checkbox lines). Write tests covering: valid file with mixed done/undone, empty file, missing file, lines without checkboxes ignored.
  - Verify: `npx tsx --test src/resources/extensions/gsd/tests/load-task-list.test.ts` and full suite `npx tsx --test src/resources/extensions/gsd/tests/*.test.ts`
  - Done when: loadTaskList tests pass, full test suite passes (existing 67+ tests unbroken)

## Files Likely Touched

- `src/resources/extensions/gsd/quick.ts` (new)
- `src/resources/extensions/gsd/task-list.ts` (new)
- `src/resources/extensions/gsd/prompts/quick-task.md` (new)
- `src/resources/extensions/gsd/commands.ts`
- `src/resources/extensions/gsd/index.ts`
- `src/resources/extensions/gsd/auto.ts`
- `src/resources/extensions/gsd/tests/quick-mode.test.ts` (new)
- `src/resources/extensions/gsd/tests/load-task-list.test.ts` (new)
