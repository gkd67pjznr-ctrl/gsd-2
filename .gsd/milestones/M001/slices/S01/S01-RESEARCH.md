# S01: Correction Capture Foundation — Research

**Date:** 2026-03-11

## Summary

S01 must deliver three things: (1) TypeScript types and JSONL I/O for corrections in `.gsd/patterns/corrections.jsonl`, (2) programmatic detection of corrections from activity logs (retries, stuck loops, reverts), and (3) self-report instructions injected into dispatch prompts so the LLM explicitly logs soft corrections.

The gsdup reference implementation (`write-correction.cjs`, 10KB, 589-line test suite) provides a proven schema, 14-category taxonomy, validation rules, rotation logic, and JSONL append pattern. The gsd2 architecture is fundamentally different — no CJS hooks, no PostToolUse lifecycle — but the data model is directly reusable. The key architectural question (D001) is already decided: dual detection (programmatic + self-report).

The primary risk is **signal quality from programmatic detection**. gsd2's `session-forensics.ts` already parses session JSONL and extracts `ExecutionTrace` objects with tool calls, errors, files written, and commands run. The `auto.ts` state machine already tracks retries (`retryCount`, `MAX_RETRIES`), stuck detection (`lastUnit`), and timeout recovery. These are strong correction signals that can be captured with minimal new code — the infrastructure is already there, we just need to tap into it.

## Recommendation

**Build three modules in `src/resources/extensions/gsd/`:**

1. **`correction-types.ts`** — Pure types: `CorrectionEntry` interface, `DiagnosisCategory` union type (14 categories), `CorrectionScope` enum, `CorrectionSource` literal union. No runtime code, just the schema contract.

2. **`corrections.ts`** — JSONL I/O: `writeCorrection(entry)`, `readCorrections(filters)`, `rotateCorrections(threshold)`. Follows the gsdup pattern exactly — append-only JSONL, line-count rotation with dated archives, retention cleanup. Location: `.gsd/patterns/corrections.jsonl`.

3. **`correction-detector.ts`** — Programmatic detection: `detectCorrectionsFromSession(sessionData, unitType, unitId)`. Reads activity log JSONL (same format as session-forensics.ts already parses) and produces correction entries for: retries (same unit dispatched twice), stuck loops (MAX_RETRIES exceeded), timeout recoveries, tool call errors, and revert patterns (file written then re-written in same session).

**Self-report mechanism:** Add a `{{corrections}}` template variable to the `execute-task.md` prompt template. In S01, inject a static self-report instruction block telling the agent to call a conventions function or write structured JSONL when it catches its own mistakes. The actual recall injection (filling `{{corrections}}` with past correction data) happens in S03.

**Integration points in `auto.ts`:**
- After `snapshotUnitMetrics()` in `dispatchNextUnit()` (the post-completion hook), call `detectCorrectionsFromSession()` with the current session's activity log.
- The stuck detection block (retryCount > MAX_RETRIES) already captures the signal — emit a correction entry there.
- Timeout recovery in `recoverTimedOutUnit()` already writes runtime records — add correction emission alongside.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Session JSONL parsing | `session-forensics.ts` → `extractTrace()` | Already parses the exact session format, extracts tool calls, errors, files written. Reuse the trace for correction detection |
| Retry/stuck detection signals | `auto.ts` → `retryCount`, `lastUnit`, `MAX_RETRIES` | Already tracks these — just emit correction entries at the detection points |
| Timeout recovery signals | `auto.ts` → `recoverTimedOutUnit()` | Already distinguishes idle vs hard timeouts, writes runtime records |
| JSONL append pattern | `activity-log.ts` → `saveActivityLog()` | Pattern for safe append + directory creation (though corrections need rotation too) |
| `.gitignore` bootstrapping | `gitignore.ts` → `ensureGitignore()` | Add `.gsd/patterns/` to `BASELINE_PATTERNS` array |
| File rotation | gsdup `write-correction.cjs` → `rotateFile()` | Proven rotation: rename to `corrections-YYYY-MM-DD.jsonl`, sequence suffix for same-day, retention cleanup |
| Validation | gsdup `write-correction.cjs` → `validateEntry()` | Required fields, category validation, diagnosis_text word-count cap (100 words) |
| Configuration | `preferences.ts` → `loadEffectiveGSDPreferences()` | Add optional `correction_capture` boolean to `GSDPreferences` interface for kill switch |

## Existing Code and Patterns

- `src/resources/extensions/gsd/session-forensics.ts` — `extractTrace(entries)` parses session JSONL into `ExecutionTrace` with `toolCalls`, `errors`, `filesWritten`, `commandsRun`, `lastReasoning`. This is the foundation for programmatic detection — reuse the trace, don't re-parse.
- `src/resources/extensions/gsd/auto.ts` — Lines ~540-580: stuck detection with `retryCount`, `lastUnit`, `MAX_RETRIES`. Lines ~1880-2100: `recoverTimedOutUnit()` with idle/hard timeout recovery and `inspectExecuteTaskDurability()`. These are the exact points to emit correction entries.
- `src/resources/extensions/gsd/activity-log.ts` — `saveActivityLog()` shows the JSONL append pattern with directory creation. Corrections follow the same pattern but add rotation.
- `src/resources/extensions/gsd/metrics.ts` — `initMetrics()`/`snapshotUnitMetrics()` pattern: init on auto-start, snapshot per unit. Corrections should follow the same lifecycle but append rather than accumulate in-memory.
- `src/resources/extensions/gsd/prompt-loader.ts` — `loadPrompt(name, vars)` with `{{variable}}` substitution. New `{{corrections}}` variable needed in dispatch prompt templates.
- `src/resources/extensions/gsd/preferences.ts` — `GSDPreferences` interface and `loadEffectiveGSDPreferences()`. Extend with optional `correction_capture` field.
- `src/resources/extensions/gsd/gitignore.ts` — `BASELINE_PATTERNS` array. Add `.gsd/patterns/` here.
- `src/resources/extensions/gsd/types.ts` — Pure type definitions, no runtime deps. `correction-types.ts` follows this exact pattern.
- `src/resources/extensions/gsd/unit-runtime.ts` — `writeUnitRuntimeRecord()` pattern for atomic JSON writes. Corrections use JSONL append instead, but the error-silencing pattern is the same.
- `gsdup/.claude/hooks/lib/write-correction.cjs` — Reference implementation: 14-category taxonomy, validation, truncation, rotation, archive cleanup, `readCorrections()` with status filter. Port the data model and validation logic, not the CJS hook infrastructure.
- `gsdup/tests/hooks/correction-capture.test.ts` — 589-line test suite covering: valid/invalid entries, all 14 categories, rotation at threshold, archive cleanup by retention_days, capture_disabled config, field truncation, CLI invocation. Use as a test design reference.

## Constraints

- **No new runtime dependencies** — Node.js `fs`, `path`, `crypto` only. All gsd extension modules follow this.
- **`tsconfig.json` excludes `src/resources/`** from compilation — files use `.ts` extension imports (e.g., `import { x } from "./foo.ts"`), Node.js `--experimental-strip-types` at runtime. Tests use `node:test` runner, not vitest.
- **JSONL format** (D002) — append-only, one JSON object per line. Matches gsdup's proven format and is the right choice for write-heavy correction data.
- **`.gsd/patterns/` must be gitignored** — correction data is local to the dev environment, not committed. Add to `BASELINE_PATTERNS` in `gitignore.ts`.
- **Prompt injection budget** — self-report instructions in dispatch prompts should be concise (~200-300 tokens). The full recall injection (past corrections in context) is S03's scope, not S01's.
- **Error silencing** — all correction I/O must be non-fatal. If writing a correction fails, auto-mode must continue. Pattern: `try { ... } catch { /* silent */ }`. Consistent with `activity-log.ts`, `metrics.ts`.
- **Test framework** — `node:test` with `node --experimental-strip-types`. Tests import from `../module.js` (not `.ts`). See existing tests in `src/resources/extensions/gsd/tests/`.
- **14-category taxonomy** (D007) — frozen for S01. 7 code categories (`code.wrong_pattern`, `code.missing_context`, `code.stale_knowledge`, `code.over_engineering`, `code.under_engineering`, `code.style_mismatch`, `code.scope_drift`) + 7 process categories (`process.planning_error`, `process.research_gap`, `process.implementation_bug`, `process.integration_miss`, `process.convention_violation`, `process.requirement_misread`, `process.regression`).

## Common Pitfalls

- **Don't hook into Pi SDK internals** — gsd2 has no PostToolUse lifecycle like Claude Code. Detection must work from activity logs and state machine signals. Do not try to intercept individual tool calls at runtime.
- **Don't block the dispatch loop** — `writeCorrection()` must be synchronous and non-throwing. `auto.ts`'s `dispatchNextUnit()` is the hot path; any async correction I/O risks delaying the next unit dispatch. Use `appendFileSync` like the gsdup reference.
- **Don't over-detect** — programmatic detection should be high-precision. A retry doesn't always mean a correction (the LLM may have hit a transient error). Focus on clear signals: same unit dispatched twice (retry), stuck detection triggered, timeout recovery fired. Don't try to infer corrections from every tool error.
- **Don't conflate correction capture with recall injection** — S01 captures and stores corrections. S03 reads them back and injects them into prompts. The `{{corrections}}` template variable in S01 should contain only static self-report instructions, not dynamic correction data.
- **Don't use `readFileSync` for rotation line-count check on hot path** — gsdup reads the whole file to count lines before deciding to rotate. For gsd2, count lines lazily or track line count as a side channel (e.g., a counter in the file header or a separate counter file). Given expected volumes (dozens of corrections per auto run, not thousands), the gsdup approach of reading the whole file is actually fine for now — premature optimization risk.
- **Self-report instructions must be specific** — vague instructions like "report corrections" get ignored under context pressure. Instructions must specify: what format, what fields, where to write. The agent should append to corrections.jsonl using a bash command with a structured JSON line.

## Open Risks

- **Self-report reliability under context pressure** (roadmap risk) — the LLM may ignore self-report instructions when deep in a complex task. S01 should measure this by comparing programmatic detection count vs self-report count in test runs. Mitigation: make self-report instructions prominent and specific in the dispatch prompt.
- **Activity log format stability** — `session-forensics.ts` parses a specific JSONL format from Pi's SessionManager. If Pi's session format changes, both forensics and correction detection break. Mitigation: share the same parser (`extractTrace()`), so both break and fix together.
- **Correction volume** — a pathological auto-mode run (many retries, many stuck detections) could produce hundreds of corrections. The rotation mechanism (default 1000-line threshold) handles this, but recall injection in S03 needs to filter aggressively. S01 should track this as a data point.
- **Integration test complexity** — testing programmatic detection requires simulating auto-mode state machine signals (retries, stuck loops, timeouts). Unit tests can use fixtures from `session-forensics.ts` test patterns, but a full integration test needs a mock auto-mode cycle. Consider testing detection logic in isolation with fixture data first.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| JSONL parsing/writing | none found | No relevant skill — standard Node.js `fs` operations |
| Session log analysis | panaversity/agentfactory@session-intelligence-harvester (48 installs) | Available — tangentially related but we already have `session-forensics.ts` which is purpose-built |
| Lessons/corrections | shihyuho/skills@lessons-learned (41 installs) | Available — generic lessons-learned pattern, but gsdup's proven schema is more specific and battle-tested |

No skills warrant installation. The existing `session-forensics.ts` and gsdup reference implementations provide better foundations than generic third-party skills.

## Sources

- gsdup `write-correction.cjs` — 14-category taxonomy, validation rules, rotation logic, JSONL schema (source: `gsdup/.claude/hooks/lib/write-correction.cjs`)
- gsdup `write-preference.cjs` — preference promotion triggered by corrections, confidence formula (source: `gsdup/.claude/hooks/lib/write-preference.cjs`)
- gsdup `correction-capture.test.ts` — 589-line test suite covering all correction scenarios (source: `gsdup/tests/hooks/correction-capture.test.ts`)
- gsd2 `session-forensics.ts` — `ExecutionTrace` extraction from session JSONL (source: `src/resources/extensions/gsd/session-forensics.ts`)
- gsd2 `auto.ts` — state machine with retry/stuck detection, timeout recovery, dispatch loop (source: `src/resources/extensions/gsd/auto.ts`)
- gsd2 `activity-log.ts` — JSONL append pattern for session logs (source: `src/resources/extensions/gsd/activity-log.ts`)
- gsd2 `metrics.ts` — init/snapshot lifecycle for per-unit data (source: `src/resources/extensions/gsd/metrics.ts`)
- gsd2 `preferences.ts` — `GSDPreferences` interface extension pattern (source: `src/resources/extensions/gsd/preferences.ts`)
- gsd2 `gitignore.ts` — `BASELINE_PATTERNS` for bootstrap patterns (source: `src/resources/extensions/gsd/gitignore.ts`)
