---
estimated_steps: 6
estimated_files: 7
---

# T01: Implement quick mode dispatch and prompt template

**Slice:** S02 — Quick Mode
**Milestone:** M003

## Description

Build the core quick mode: a `quick.ts` module with `startQuick()` that parses the description, creates the output directory, sets status to "quick", loads and sends the prompt, and resets on completion. Wire it into `commands.ts` (replacing the stub) and `index.ts` `agent_end` (for correction capture and status reset). Create the `quick-task.md` prompt template. Write comprehensive tests.

## Steps

1. Create `src/resources/extensions/gsd/quick.ts`:
   - Export `startQuick(ctx, pi, rawArgs: string)` — parse description (strip leading `quick`, strip `--`, trim), create `.gsd/quick/<ISO-timestamp>/` dir with `mkdirSync({recursive: true})`, call `setGSDStatus(ctx, 'quick')`, load `quick-task.md` prompt with `{{description}}` and `{{quality}}` (call `resolveQualityLevel()` + `buildQualityInstructions()`), send via `pi.sendMessage()` with `triggerTurn: true`. Store pending quick state (directory path) in module-level variable for `agent_end` cleanup.
   - Export `checkQuickEnd(ctx, pi)` — called from `agent_end`, checks `getGSDMode() === 'quick'`, runs correction detection (import `transformSessionEntries` from auto.ts, call `detectCorrections`, `writeCorrection`, `checkAndPromote`), reset status to idle, clear pending state. Wrap in try/finally for status reset.
   - Export `isQuickPending()` for guard checks.

2. Export `transformSessionEntries` from `auto.ts` (change from private to exported function, no logic changes).

3. Create `src/resources/extensions/gsd/prompts/quick-task.md` — prompt template with `{{description}}` and `{{quality}}` variables. Instruct the agent to: research the problem, plan the fix, execute the fix, verify it works, then write a summary to the quick directory path (embedded in prompt). Include self-report correction instructions.

4. Replace the quick stub in `commands.ts` — import `startQuick` from `quick.ts`, call it with ctx, pi, and the raw trimmed args string.

5. Add quick mode `agent_end` handling in `index.ts` — after the discuss check and before the auto-mode check, add: `if (getGSDMode() === 'quick') { await checkQuickEnd(ctx, pi); return; }`.

6. Write `src/resources/extensions/gsd/tests/quick-mode.test.ts` with tests:
   - Arg parsing: `"quick --fix the login button"` → `"fix the login button"`, `"quick fix login"` → `"fix login"`, bare `"quick"` → empty string
   - Directory creation: verify `.gsd/quick/<timestamp>/` is created
   - Prompt template: verify `quick-task.md` loads with substituted description and quality
   - Status transitions: verify `setGSDStatus` called with `'quick'` at start, `'idle'` at end
   - Agent_end correction capture: verify `transformSessionEntries` + `detectCorrections` called, corrections written
   - Error recovery: verify status resets to idle even when dispatch throws

## Must-Haves

- [ ] `startQuick()` parses description from raw args correctly
- [ ] `.gsd/quick/<timestamp>/` directory created before dispatch
- [ ] Status bar shows "quick" during execution, "idle" after
- [ ] `quick-task.md` prompt loaded with `{{description}}` and `{{quality}}`
- [ ] `agent_end` hook captures corrections from quick session
- [ ] Status resets to idle on error (try/finally)
- [ ] `transformSessionEntries` exported from auto.ts

## Verification

- `npx tsx --test src/resources/extensions/gsd/tests/quick-mode.test.ts` — all assertions pass
- `grep 'export function transformSessionEntries' src/resources/extensions/gsd/auto.ts` — confirms export

## Observability Impact

- Signals added/changed: `getGSDMode()` returns `'quick'` during quick execution
- How a future agent inspects this: call `getGSDMode()` or check status bar key `"gsd-mode"`
- Failure state exposed: status resets to idle on error; correction capture failures are silent (D013)

## Inputs

- `src/resources/extensions/gsd/status.ts` — `setGSDStatus`, `getGSDMode`, `isAutoActive` (from S01)
- `src/resources/extensions/gsd/auto.ts` — `transformSessionEntries` (to be exported), correction detection pattern
- `src/resources/extensions/gsd/guided-flow.ts` — `showDiscuss()` lifecycle pattern reference
- `src/resources/extensions/gsd/commands.ts` — quick stub at line ~150

## Expected Output

- `src/resources/extensions/gsd/quick.ts` — new module with `startQuick`, `checkQuickEnd`, `isQuickPending`
- `src/resources/extensions/gsd/prompts/quick-task.md` — new prompt template
- `src/resources/extensions/gsd/commands.ts` — quick stub replaced with real dispatch
- `src/resources/extensions/gsd/index.ts` — agent_end handles quick mode
- `src/resources/extensions/gsd/auto.ts` — `transformSessionEntries` exported
- `src/resources/extensions/gsd/tests/quick-mode.test.ts` — comprehensive test file
