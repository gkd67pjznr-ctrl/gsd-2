# S02: Quick Mode — Research

**Date:** 2026-03-12

## Summary

Quick mode (`/gsd quick --fix the login button`) is a compressed dispatch loop: parse the description from args, create a `.gsd/quick/<timestamp>/` directory, execute through research→plan→execute→verify phases via `sendMessage` with `triggerTurn`, capture corrections, write a summary, and update the status bar. The codebase is well-prepared: `status.ts` exports `setGSDStatus(ctx, 'quick')`, `commands.ts` has the stub ready to replace, `buildRecallBlock()` injects recall automatically via `before_agent_start`, and `auto.ts` demonstrates the exact `loadPrompt()` → `sendMessage()` → `agent_end` pattern.

The main design decision is how to manage quick mode's lifecycle. Auto-mode uses a state machine driven by `agent_end` hooks with fresh sessions per unit. Quick mode should be simpler: a single session with sequential phase prompts, no timeout/retry machinery, no fresh sessions between phases. The user typed a description — the agent should just do it.

**Primary recommendation:** Single-session, sequential-phase dispatch. One new prompt template (`quick-task.md`) with all four phase instructions. The agent executes all phases in one turn. Corrections captured at session end via the same `agent_end` hook. Summary written to `.gsd/quick/<timestamp>/summary.md`.

## Recommendation

Quick mode should be a single-dispatch flow, not a multi-unit state machine:

1. Parse `--<description>` from args (everything after `quick` with leading `--` stripped)
2. Create `.gsd/quick/<timestamp>/` directory
3. Call `setGSDStatus(ctx, 'quick')`
4. Build prompt from `quick-task.md` template with `{{description}}`, `{{corrections}}` (via `buildCorrectionsVar()`), `{{quality}}` (via `buildQualityVar()`)
5. `sendMessage()` with `triggerTurn: true` — agent executes all phases in one turn
6. On `agent_end`, detect corrections from session, write summary, call `setGSDStatus(ctx, 'idle')`

This mirrors `showDiscuss()` in `guided-flow.ts` which sets pending state and checks it in `agent_end`. Quick mode can use the same pattern: set a module-level `pendingQuick` state, check in `agent_end`.

**Do NOT** create fresh sessions between phases — that's auto-mode ceremony. Quick mode is one prompt, one session, one turn (or a few turns if the agent needs tool calls).

For the task list loading feature (S03 dependency): export a `loadTaskList(path)` function that reads a markdown file with checkboxes and returns structured tasks. This is consumed by S03's chat-to-quick handoff.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Recall injection | `buildRecallBlock()` via `before_agent_start` | Already injected for non-auto sessions (S01). Quick mode gets it for free |
| Quality instructions | `buildQualityVar()` in auto.ts | Reuse directly — same quality levels apply |
| Correction capture | `writeCorrection()` + `checkAndPromote()` | Full pipeline from capture through preference promotion |
| Prompt template loading | `loadPrompt()` in prompt-loader.ts | Handles `{{variable}}` substitution |
| Status bar updates | `setGSDStatus(ctx, 'quick')` from status.ts | Ready to use per S01 |
| Correction embedding | `embedCorrection()` in auto.ts | Fire-and-forget vector embedding |
| Message dispatch | `pi.sendMessage()` with `triggerTurn` | Proven in auto.ts, guided-flow.ts |

## Existing Code and Patterns

- `src/resources/extensions/gsd/commands.ts` — The `quick` stub (line ~195) needs its handler replaced. Args come as raw string — `"quick --fix the login button"` → strip `"quick"` prefix, strip leading `--`, trim. Also needs to handle bare `quick` (no description) for task-list-loading path.
- `src/resources/extensions/gsd/guided-flow.ts` — `showDiscuss()` is the closest pattern: sets pending state, sends a prompt via `pi.sendMessage()`, then checks in `agent_end` for cleanup. Quick mode should follow this exact lifecycle pattern.
- `src/resources/extensions/gsd/auto.ts` — `buildCorrectionsVar()` (line 1283) and `buildQualityVar()` (line 1291) are async/sync respectively. Both are currently module-private. They need to be exported or their logic extracted for quick mode to reuse. `buildCorrectionsVar()` calls `buildRecallBlock()` with embedding singletons; quick mode can call `buildRecallBlock()` directly (simpler, no embedding singletons needed since `before_agent_start` already injects basic recall).
- `src/resources/extensions/gsd/auto.ts` — `transformSessionEntries()` and correction detection in `agent_end` block (~line 1370-1420). Quick mode needs the same correction detection. This logic should be callable from quick mode's `agent_end` handler.
- `src/resources/extensions/gsd/status.ts` — `setGSDStatus(ctx, 'quick')` and `setGSDStatus(ctx, 'idle')` ready to use.
- `src/resources/extensions/gsd/index.ts` — `before_agent_start` hook already injects recall for non-auto sessions. Quick mode needs to ensure `isAutoActive()` returns false so recall flows through this path (it will, since quick mode sets mode to 'quick' not 'auto').

## Constraints

- `buildCorrectionsVar()` and `buildQualityVar()` are module-private in `auto.ts` — need to either export them, duplicate the 3-line logic, or call the underlying functions directly. Calling `buildRecallBlock()` and `buildQualityInstructions(resolveQualityLevel())` directly is simplest.
- Quick mode's `agent_end` handler must not conflict with auto-mode's. Since modes are mutually exclusive (`isAutoActive()` guard), they won't overlap — but the handler registration needs to be in the right place (index.ts `agent_end` hook or a separate quick module's handler).
- `pi.sendMessage()` args parsing: everything after `quick` is the description. `--` prefix is conventional but optional. Handle both `quick --fix login` and `quick fix login`.
- `.gsd/quick/` directory may not exist on first use — must `mkdirSync` with `recursive: true`.
- Quick mode must work without any milestone existing — `deriveState()` may return empty state, which is fine.

## Common Pitfalls

- **Over-engineering the phase loop** — Don't build a state machine. One prompt, one session. The agent handles research/plan/execute/verify as sections of a single prompt, not as separate dispatched units.
- **Duplicating correction detection logic** — Extract or reuse `transformSessionEntries()` and the detection loop from auto.ts rather than reimplementing. The transform function is already well-isolated.
- **Forgetting to clear quick mode on error** — If `sendMessage` or directory creation fails, `setGSDStatus` must still reset to idle. Use try/finally.
- **Making quick mode create git branches** — Per M003-CONTEXT, git branches are optional and overhead for small tasks. Skip entirely in S02.
- **Blocking on recall injection** — `before_agent_start` already handles recall for non-auto sessions. Quick mode does NOT need to inject recall into its prompt template — it's already in the system prompt. Only `{{quality}}` needs template injection (quality instructions are auto-mode-specific, not in `before_agent_start`).

## Open Risks

- **`buildCorrectionsVar()` export decision** — Exporting from auto.ts creates a dependency direction concern (other modules importing from auto.ts). Alternative: call `buildRecallBlock()` directly in the quick prompt and rely on `before_agent_start` for recall. Since `before_agent_start` already injects recall, the `{{corrections}}` var in the quick template could be empty or omitted entirely. Need to decide: duplicate recall in template (like auto-mode) or rely solely on `before_agent_start` injection.
- **`agent_end` hook coordination** — index.ts registers the `agent_end` hook. Quick mode's post-session cleanup (correction detection, summary writing, status reset) needs to run in this hook. Must ensure it doesn't interfere with auto-mode's `agent_end` handling. Guard with mode check: `if (getGSDMode() === 'quick') { ... }`.
- **Summary quality** — The quick task prompt should instruct the agent to write its own summary to `.gsd/quick/<timestamp>/summary.md` as part of execution, rather than trying to extract/generate it programmatically after the session. Instruction-based, consistent with D001.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| TypeScript | typescript-patterns | installed |
| Pi SDK | (project-internal) | N/A |

No external technologies involved — purely internal extension development.

## Sources

- `src/resources/extensions/gsd/commands.ts` — command routing and stub location
- `src/resources/extensions/gsd/auto.ts` — correction detection, recall/quality var building, dispatch pattern
- `src/resources/extensions/gsd/guided-flow.ts` — `showDiscuss()` lifecycle pattern
- `src/resources/extensions/gsd/status.ts` — mode management API
- `src/resources/extensions/gsd/index.ts` — `before_agent_start` recall injection
- `src/resources/extensions/gsd/prompt-loader.ts` — template loading API
