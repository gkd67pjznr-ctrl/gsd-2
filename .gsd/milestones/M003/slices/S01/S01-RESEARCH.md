# S01: Always-On Recall & Status Bar — Research

**Date:** 2026-03-12

## Summary

S01 has two deliverables: (1) inject recall into every GSD session via `before_agent_start`, and (2) add a persistent status bar showing the current GSD mode. Both are low-complexity changes to existing infrastructure. The `before_agent_start` hook in `index.ts` already fires for every GSD project session and injects system prompt content — adding `buildRecallBlock()` there is a ~10 line change. The status bar is already proven via `setStatus("gsd-auto", ...)` in `auto.ts` — migrating to a unified `"gsd-mode"` key with a helper function is straightforward.

The highest-risk element is performance: `buildRecallBlock()` is async and reads files (corrections, preferences, optionally vector index). Running it on every agent turn adds latency. The kill switch check (`isCaptureDisabled()`) provides an early return, and the `.gsd/` directory check already gates the entire hook. This is acceptable — auto-mode already runs this on every dispatch.

**Primary recommendation:** Two tasks — T01 for always-on recall injection in `before_agent_start`, T02 for unified status bar key migration and helper. Both are small and independently testable.

## Recommendation

### Always-on recall (T01)
Call `buildRecallBlock()` in the `before_agent_start` hook in `index.ts` and append the result to the system prompt injection. This gives every GSD session recall data without any mode-specific wiring. The function already handles kill switch, token budgeting, dedup, and error recovery (never throws, returns "").

Key decision: where in the system prompt to place recall. Currently it goes after the GSD contract + preferences. Recall should go after preferences — it's context-specific data that augments the contract.

### Status bar (T02)
Create a `setGSDStatus(mode: 'idle' | 'chat' | 'quick' | 'auto')` helper exported from a small module. Migrate `auto.ts` from `setStatus("gsd-auto", ...)` to the shared helper. Register `chat` and `quick` as subcommand stubs in `commands.ts` (routing only, no implementation).

Per D051, the unified key is `"gsd-mode"`. Passing `undefined` clears the status (idle state).

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Recall assembly | `buildRecallBlock()` in `recall.ts` | Already handles token budgeting, dedup, vector similarity, kill switch, self-report instructions |
| Status bar updates | `ctx.ui.setStatus(key, text)` | Already used in auto.ts — proven API |
| Command registration | `pi.registerCommand()` in `commands.ts` | Existing subcommand array + routing switch |
| Preferences/kill switch | `isCaptureDisabled()` in `correction-io.ts` | Already used by `buildRecallBlock()` internally |
| Embedding singletons | `getEmbeddingSingletons()` in `auto.ts` | Provides provider/index for vector recall |

## Existing Code and Patterns

- `src/resources/extensions/gsd/index.ts:115-170` — `before_agent_start` hook. Returns `{ systemPrompt: ... }` with injected content. Already gates on `.gsd/` directory existence. Recall injection goes here, appended to systemPrompt after preferences block.
- `src/resources/extensions/gsd/auto.ts:1282-1295` — `buildCorrectionsVar()` wraps `buildRecallBlock()` with embedding singletons from `getEmbeddingSingletons()`. For always-on recall in `before_agent_start`, embedding singletons may not be initialized (they're auto-mode specific). Call `buildRecallBlock()` directly without vector args for non-auto sessions — it falls back to category-based matching.
- `src/resources/extensions/gsd/auto.ts:287,314,338,433,1069` — Five places using `setStatus("gsd-auto", ...)`. All need migration to the shared helper.
- `src/resources/extensions/gsd/commands.ts:58` — Subcommands array: `["auto", "stop", "status", "queue", "discuss", "prefs", "doctor", "migrate"]`. Add `"chat"` and `"quick"` here.
- `src/resources/extensions/gsd/recall.ts:146` — `buildRecallBlock()` signature: `async (options?: { cwd?, provider?, vectorIndex?, taskContext? })`. All optional — calling with no args works and uses `process.cwd()`.

## Constraints

- `buildRecallBlock()` is async — `before_agent_start` handler is already async, so this is fine.
- `before_agent_start` fires on every agent turn, not just session start. Recall is re-assembled each turn. This is the same behavior auto-mode has — acceptable.
- `getEmbeddingSingletons()` is scoped to auto-mode (initializes on first auto dispatch). In `before_agent_start`, vector recall won't be available unless auto-mode has been started. This is acceptable — category-based fallback works. Don't try to initialize embedding singletons in the hook.
- `ctx.ui.setStatus()` requires an `ExtensionContext` — the `before_agent_start` handler has `ctx`. The helper function needs `ctx` passed in or stored.
- The `setStatus` helper needs to be importable by `auto.ts`, `commands.ts`, and future mode modules. A small `status.ts` module is appropriate.

## Common Pitfalls

- **Initializing embedding singletons in `before_agent_start`** — Don't. The hook runs for every session including non-auto. Embedding init requires env vars and creates Vectra index. Call `buildRecallBlock()` without vector args; it falls back gracefully.
- **Recall duplication in auto-mode** — Once recall is in `before_agent_start`, auto-mode's `{{corrections}}` template variable would double-inject recall. Auto-mode dispatch templates must stop injecting recall via `{{corrections}}` OR `before_agent_start` must skip recall when auto-mode is active. Recommend: `before_agent_start` always injects recall; auto-mode's `buildCorrectionsVar()` returns only the vector-enhanced delta (or is removed). **This is the key design risk.**
- **Status bar key collision during migration** — During the `auto.ts` migration, ensure no code path sets both `"gsd-auto"` and `"gsd-mode"`. Clean migration: change all `"gsd-auto"` references to the helper in one pass.
- **Forgetting to clear status on mode exit** — Every mode entry must have a corresponding exit that clears or resets status. The helper should accept `undefined` or `'idle'` to clear.

## Open Risks

- **Recall duplication between `before_agent_start` and auto-mode dispatch** — The biggest design decision for T01. Auto-mode injects recall via `{{corrections}}` in task templates. `before_agent_start` would inject it in the system prompt. Both run during auto-mode. Options: (a) `before_agent_start` skips recall when auto-mode is active (check `isAutoActive()`), letting auto-mode handle it with vector-enhanced recall; (b) `before_agent_start` always injects basic recall, auto-mode injects only the vector-enhanced delta. Option (a) is simpler and preserves auto-mode's existing behavior exactly.
- **Performance of `buildRecallBlock()` on every turn** — Reads corrections.jsonl + preferences.jsonl + optionally user preferences. For projects with many corrections, this could add 50-200ms per turn. Acceptable for now; monitor if users report sluggishness.

## Requirements Mapping

| Requirement | Role | What S01 Must Prove |
|------------|------|---------------------|
| R022 (Status Bar) | primary owner | Status bar shows current mode, updates on transitions |
| R023 (Always-On Recall) | primary owner | `before_agent_start` injects recall into every GSD session |
| R007 (Live Recall Injection) | extends | Recall injection works outside auto-mode (chat, quick, regular sessions) |

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| TypeScript | typescript-patterns | installed |
| Pi SDK | (project-internal) | N/A |

No external technologies involved — purely internal extension development.

## Sources

- `src/resources/extensions/gsd/index.ts` — `before_agent_start` hook implementation
- `src/resources/extensions/gsd/auto.ts` — `buildCorrectionsVar()`, `setStatus("gsd-auto", ...)` usage
- `src/resources/extensions/gsd/recall.ts` — `buildRecallBlock()` signature and behavior
- `src/resources/extensions/gsd/commands.ts` — subcommand registration
- `.gsd/DECISIONS.md` — D051 (unified status key), D052 (always-on recall via hook)
