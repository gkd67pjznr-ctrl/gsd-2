# M003: Conversational Modes & Lightweight Execution — Research

**Date:** 2026-03-12

## Summary

M003 adds two new entry points (`/gsd chat`, `/gsd quick`) and a persistent status bar. The codebase is well-structured for this: command registration is centralized in `commands.ts`, recall injection flows through `buildRecallBlock()` in `recall.ts`, and the `before_agent_start` hook in `index.ts` is the universal injection point. The existing `setStatus("gsd-auto", ...)` pattern in `auto.ts` proves status bar usage; extending it to cover chat/quick modes is straightforward.

The primary risk is `/gsd chat` session management — specifically how to persist conversations, detect actionable work, and summarize sessions without over-engineering. The quick mode is lower risk because it closely mirrors existing auto-mode dispatch patterns (prompt injection, recall, corrections) at a smaller scale. The status bar is trivial.

**Primary recommendation:** Start with status bar (proves TUI wiring), then quick mode (highest value, reuses most existing infra), then chat mode (most novel, benefits from quick mode being available for handoff).

## Recommendation

Slice ordering should be: S01 status bar → S02 quick mode → S03 chat mode. Status bar is a dependency for both modes (they need to set state). Quick mode is a dependency for chat mode (chat suggests `/gsd quick`). This ordering front-loads the lowest-risk work and defers the most uncertain (conversation summarization, task detection) until the foundation is proven.

Quick mode should reuse `buildRecallBlock()`, `buildCorrectionsVar()`, `buildQualityVar()`, `writeCorrection()`, and `checkAndPromote()` directly. It should NOT create its own parallel recall/correction pipeline. The dispatch pattern from `auto.ts` (load template → substitute vars → `sendMessage` with `triggerTurn`) is the proven pattern.

Chat mode should use `sendMessage` to inject recall into the current session rather than creating a fresh session. A fresh session loses conversational flow, which defeats the purpose. Persistence should use a simple `conversations/` directory with timestamped JSONL or markdown files.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Recall injection into prompts | `buildRecallBlock()` in `recall.ts` | Already handles token budgeting, dedup, vector similarity, kill switch, self-report instructions |
| Quality instructions in prompts | `buildQualityVar()` in `auto.ts` | Handles quality level resolution and template substitution |
| Correction capture after execution | `writeCorrection()` + `detectCorrections()` + `checkAndPromote()` | Full pipeline from capture through preference promotion |
| Template loading with variable substitution | `loadPrompt()` in `prompt-loader.ts` | Handles `{{variable}}` substitution from vars object |
| State derivation from disk | `deriveState()` in `state.ts` | Reads roadmap/plan files, returns typed `GSDState` |
| Status bar updates | `ctx.ui.setStatus(key, text)` | Already used in `auto.ts` for auto-mode status |
| Progress widgets | `ctx.ui.setWidget(key, renderer)` | Already used in `auto.ts` for progress display |
| Command registration with completions | `pi.registerCommand()` in `commands.ts` | Handles argument parsing, tab completions |
| Message dispatch to agent | `pi.sendMessage()` with `triggerTurn` | Proven in auto.ts, guided-flow.ts, commands.ts |

## Existing Code and Patterns

- `src/resources/extensions/gsd/commands.ts` — Command registration with `getArgumentCompletions`. Add `chat` and `quick` to the subcommands array and route in the handler switch. Pattern: parse args string, dispatch to handler function.
- `src/resources/extensions/gsd/auto.ts` — `buildCorrectionsVar()` (async, calls `buildRecallBlock()`) and `buildQualityVar()` (sync, calls `buildQualityInstructions()`) are the recall/quality injection functions. Currently scoped to auto-mode; quick mode should call these same functions. `setStatus("gsd-auto", ...)` pattern for status bar.
- `src/resources/extensions/gsd/recall.ts` — `buildRecallBlock()` is the core recall assembly. Already async, already handles vector similarity fallback. Accepts `{cwd, provider, vectorIndex, taskContext}` options — quick mode can pass these directly.
- `src/resources/extensions/gsd/index.ts` — `before_agent_start` hook is where system prompt injection happens. Currently only injects GSD contract + preferences. For always-on recall, this hook needs to also inject recall data (currently only happens during auto-mode dispatch via template vars).
- `src/resources/extensions/gsd/guided-flow.ts` — `showSmartEntry()` and `showDiscuss()` show how to build interactive wizard flows. `showDiscuss()` pattern (set pending state, check in `agent_end`, dispatch) is directly relevant for chat mode.
- `src/resources/extensions/gsd/prompt-loader.ts` — Templates live in `templates/` dir. New templates needed: `chat-session.md`, `quick-task.md`. Variable substitution via `{{varName}}` syntax.
- `src/resources/extensions/gsd/state.ts` — `deriveState()` returns `GSDState` with phase, active milestone/slice/task. Needs extension for chat/quick states, or these modes can track state independently (they don't map to milestone/slice/task hierarchy).
- `src/resources/extensions/gsd/corrections.ts` — `writeCorrection()` for persisting corrections. Quick mode should call this for any detected corrections.
- `src/resources/extensions/gsd/auto.ts` lines using `ctx.ui.setStatus("gsd-auto", ...)` — Three states: `"auto"`, `"paused"`, `undefined` (clear). Status bar key is `"gsd-auto"`. New modes need their own keys or a shared key with different values.

## Constraints

- `ctx.ui.setStatus(key, text)` is key-value only — no rich formatting, no custom components. Multiple keys display as separate entries. Use a single key `"gsd-mode"` with values like `"chat"`, `"quick"`, `"auto"`, `undefined` for clear.
- `pi.registerCommand()` handler receives `args` as a raw string — `--fix the login button` needs manual parsing (split on first `--` and trim).
- `pi.sendMessage()` with `triggerTurn: true` starts a new agent turn — this is how to inject prompts programmatically. `deliverAs: "steer"` is for mid-conversation steering.
- The `before_agent_start` hook fires on every agent turn, not just the first. Recall injection here means it's available in every turn of a chat session, not just the first.
- Conversation persistence must use `.gsd/conversations/` (not `.gsd/milestones/`) to avoid interfering with milestone structure.
- Quick mode must work without any milestone existing — it's for ad-hoc tasks outside the milestone hierarchy.
- `newSession()` creates a fresh Pi session (clears conversation). For chat mode, this would destroy the conversation — use `sendMessage` into the current session instead.

## Common Pitfalls

- **Over-engineering chat summarization** — Don't build an NLP pipeline. Use a simple prompt at `/gsd chat end` that asks the agent to summarize the conversation into a structured markdown file. The agent is already good at summarization.
- **Making quick mode too ceremonious** — The whole point is lightweight execution. If quick mode creates milestones, slices, roadmaps, or branches, it's failed. A single task file in `.gsd/quick/` with a summary is sufficient.
- **Separate recall pipeline for new modes** — The temptation to build mode-specific recall is strong but wrong. `buildRecallBlock()` is mode-agnostic. Use it everywhere.
- **Status bar key collision with auto-mode** — Auto-mode uses `"gsd-auto"` key. If chat/quick use the same key, mode transitions could conflict. Use a single shared key OR separate keys and clear the old one on transition.
- **Chat-to-quick handoff complexity** — Don't over-engineer the task list format. A simple markdown file in `.gsd/conversations/<session-id>-tasks.md` with checkboxes is enough. Quick mode just needs to `find` the most recent one.
- **Always-on recall in `before_agent_start` breaking performance** — `buildRecallBlock()` is async and reads files. In `before_agent_start` it would run on every agent turn. This is fine for normal usage but needs the kill switch check first to avoid unnecessary I/O when corrections are disabled.
- **Task detection false positives** — Don't auto-detect "this needs work" during chat. Instead, give the agent instructions to suggest `/gsd quick` when it notices actionable items. Instruction-based, not heuristic-based, consistent with D001's dual approach.

## Open Risks

- **Status bar key strategy** — Auto-mode already uses `setStatus("gsd-auto", ...)`. Need to decide: single key for all modes (simpler, but mode transitions must be careful) vs. separate keys (more isolated, but multiple status entries visible). Recommend single key `"gsd-mode"` and migrate auto-mode to use it.
- **Quick mode failure handling** — Auto-mode has retry/stuck detection/crash recovery. Quick mode needs something lighter — probably just report failure and let the user decide. Over-engineering recovery defeats "quick."
- **Conversation file growth** — If users have long chat sessions, conversation files could get large. Pragmatically, this is unlikely to be a real problem — cap at a reasonable size and move on.
- **Always-on recall token overhead** — Injecting recall into every session adds ~500-3000 tokens. For non-GSD sessions (no `.gsd/` directory), this is already gated by the early return in `before_agent_start`. For GSD sessions, the overhead is acceptable — it's the same budget auto-mode uses.

## Candidate Requirements

These should be considered during roadmap planning but are advisory, not auto-binding:

- **R020 — Chat Mode Conversation Persistence**: Chat sessions persisted to `.gsd/conversations/` with timestamp-based naming, structured summary on session end, task list extraction when actionable work is detected. *Table stakes for the chat feature to be useful.*
- **R021 — Quick Mode Lightweight Execution**: Single-task execution through compressed phases (research → plan → execute → verify) without milestone scaffolding, recall injection, correction capture, summary output. *Table stakes for the quick feature to be useful.*
- **R022 — Persistent Status Bar**: `ctx.ui.setStatus()` showing current GSD mode (idle/chat/quick/auto), updated on all mode transitions. *Table stakes — trivially implementable.*
- **R023 — Always-On Recall Injection**: `before_agent_start` hook injects recall data into every GSD session regardless of mode, not just auto-mode dispatch. *Extends R007 — this is the primary motivator for M003.*
- **R024 — Chat-to-Quick Handoff**: Chat sessions can produce task lists that `/gsd quick` discovers and loads. *Integration requirement — makes the two modes cohesive.*

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Pi SDK | (project-internal) | N/A — this is the Pi SDK itself |
| TypeScript | typescript-patterns | installed |

No external technologies are involved — M003 is purely internal extension development using the Pi SDK. All relevant skills are already installed.

## Sources

- Pi SDK extension API: `src/resources/extensions/gsd/index.ts` (hooks, commands, status bar)
- Auto-mode dispatch: `src/resources/extensions/gsd/auto.ts` (recall injection, status updates, session management)
- Recall assembly: `src/resources/extensions/gsd/recall.ts` (buildRecallBlock)
- Command registration: `src/resources/extensions/gsd/commands.ts` (argument parsing, routing)
- Guided flow: `src/resources/extensions/gsd/guided-flow.ts` (wizard pattern, discuss mode)
- State derivation: `src/resources/extensions/gsd/state.ts` (GSDState types)
- Decisions register: `.gsd/DECISIONS.md` (D001-D050, architectural constraints)
