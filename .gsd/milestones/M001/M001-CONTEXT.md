# M001: Adaptive Intelligence — Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

## Project Description

Integrate observation/learning loop, quality gating, and tech debt tracking from the gsdup fork into gsd2's programmatic architecture. These features were built as CJS hooks and markdown workflows in gsdup; they need to be reimplemented as TypeScript modules in gsd2's extension system, leveraging gsd2's architectural advantages (fresh session per task, programmatic prompt injection, state machine control, metrics ledger).

## Why This Milestone

GSD2 can build software autonomously but has no memory of mistakes, no quality enforcement, and no structured debt tracking. The gsdup fork proved these concepts work (7 shipped milestones, 1,802 LOC of hook libraries, 3,448 LOC of tests). Now we bring the ideas to a better architecture.

## User-Visible Outcome

### When this milestone is complete, the user can:

- See their correction history and promoted preferences in `.gsd/patterns/`
- Have past corrections automatically surfaced in dispatch prompts before they can repeat
- Set quality levels (fast/standard/strict) via `/gsd prefs` and see quality gate metrics in the dashboard
- Have code issues discovered during work auto-logged to `.gsd/TECH-DEBT.md`
- See plan-vs-outcome drift analysis after each slice completes
- Have preferences that appear across 3+ projects automatically promoted to user-level

### Entry point / environment

- Entry point: `gsd` CLI, auto mode, `/gsd prefs`, dashboard overlay
- Environment: local dev terminal
- Live dependencies involved: none (all local filesystem)

## Completion Class

- Contract complete means: TypeScript modules compile, unit tests pass, JSONL files are written correctly
- Integration complete means: auto mode dispatches prompts with corrections/quality instructions injected, metrics ledger records gate events
- Operational complete means: a full auto-mode milestone run produces correction data, preferences, and quality gate records

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- Auto mode dispatches a task, the agent makes a mistake (simulated or real), the correction is captured, and on the next dispatch the correction appears in the prompt
- Quality level set to `standard` produces measurably different dispatch prompts than `fast`
- A tech debt entry logged during execution appears in `.gsd/TECH-DEBT.md` with correct provenance

## Risks and Unknowns

- **Prompt injection budget** — Adding corrections + quality instructions to dispatch prompts consumes context. Must stay under ~3K tokens total. Mitigate by filtering corrections by relevance and capping injection
- **Correction detection without hooks** — gsdup uses PostToolUse hooks (Claude Code native). gsd2 needs a different mechanism — session forensics, diff analysis, or activity log analysis. This is the biggest architectural difference
- **Self-report vs programmatic detection** — gsdup relies heavily on the LLM self-reporting corrections via a skill. In gsd2, we can combine programmatic detection (retry count, stuck detection, session rollback) with self-report instructions in dispatch prompts

## Existing Codebase / Prior Art

- `src/resources/extensions/gsd/auto.ts` — State machine, dispatch loop, unit lifecycle
- `src/resources/extensions/gsd/prompt-loader.ts` — Template loading with `{{variable}}` substitution
- `src/resources/extensions/gsd/metrics.ts` — Per-unit token/cost ledger, extends naturally for quality gates
- `src/resources/extensions/gsd/preferences.ts` — YAML frontmatter preferences with global/project scope
- `src/resources/extensions/gsd/state.ts` — State derivation from disk files
- `src/resources/extensions/gsd/skill-discovery.ts` — Skill snapshot and detection
- `src/resources/extensions/gsd/session-forensics.ts` — Crash recovery briefing from session data
- `src/resources/extensions/gsd/activity-log.ts` — Session log saving for retry diagnostics
- `gsdup/.claude/hooks/lib/` — Reference implementations: write-correction.cjs, write-preference.cjs, analyze-patterns.cjs, retire.cjs, promote-preference.cjs, write-gate-execution.cjs, attribute-gates.cjs
- `gsdup/tests/hooks/` — Reference test suites (3,448 LOC)

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R001-R003 — Correction capture, taxonomy, storage
- R004-R006 — Preference promotion, scope hierarchy, observer engine
- R007-R009 — Live recall, skill refinement, cross-project promotion
- R010-R012 — Quality levels, sentinel prompts, gate metrics
- R013-R015 — Tech debt register, auto-logging, passive monitoring

## Scope

### In Scope

- TypeScript modules for correction capture, preference tracking, observer engine
- Quality level configuration extending existing preferences system
- Quality sentinel instructions injected into dispatch prompts
- Quality gate metrics extending existing metrics ledger
- Tech debt register (.gsd/TECH-DEBT.md) with structured entries
- Live recall injection into dispatch prompts
- Cross-project preference promotion to ~/.gsd/
- Plan-vs-summary passive monitoring
- Reference gsdup implementations as design guides (not copy-paste)

### Out of Scope / Non-Goals

- Browser-based multi-project dashboard (deferred — R017)
- Concurrent milestones (out of scope — R018)
- Tmux integration (out of scope — R019)
- Gate-to-correction attribution analytics (deferred — R016)
- Direct porting of gsdup CJS code — all new TypeScript implementations

## Technical Constraints

- All new code must be TypeScript modules in `src/resources/extensions/gsd/`
- Must compile with existing tsconfig
- Must not add runtime dependencies beyond what Pi SDK provides
- Correction/preference files go in `.gsd/patterns/` (added to .gitignore)
- Quality level must extend existing `preferences.md` format, not a separate config
- Prompt injection must stay within ~3K token budget for corrections + quality instructions

## Integration Points

- `auto.ts` — Post-completion hooks for correction detection, pre-dispatch hooks for recall injection
- `prompt-loader.ts` — New template variables for corrections, quality instructions
- `metrics.ts` — Extended ledger for quality gate events
- `preferences.ts` — New quality_level field
- `dashboard-overlay.ts` — Quality gate summary display
- Prompt templates in `prompts/` — New sections for quality sentinel and correction recall

## Open Questions

- **Correction detection mechanism** — Should corrections be detected programmatically (diff analysis, retry detection, stuck detection) or via self-report instructions in dispatch prompts, or both? Current thinking: both — programmatic detection for hard signals (retries, reverts), self-report for soft signals (user says "wrong")
- **Preference file format** — JSONL (like gsdup) or extend the existing YAML preferences.md? Current thinking: JSONL for corrections/preferences (append-heavy), YAML preferences.md for quality config (read-heavy)
