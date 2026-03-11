# S05: Tech Debt & Passive Monitoring — Research

**Date:** 2026-03-11

## Summary

S05 covers three requirements: R013 (Tech Debt Register), R014 (Tech Debt Auto-Logging), and R015 (Passive Monitoring). This is the final slice of M001 — it's low-risk because the integration surfaces are well-established by S01 and S04, and the new modules are largely self-contained.

The tech debt register (`.gsd/TECH-DEBT.md`) is a structured markdown file with sequential TD-NNN entries. The module needs `logDebt()`, `listDebt()`, and `resolveDebt()` functions following the non-throwing I/O pattern established by `corrections.ts`. Auto-logging is gated by quality level via `resolveQualityLevel()` from S04 — critical/high at standard, all severities at strict, nothing at fast. Passive monitoring performs plan-vs-summary drift analysis after slice completion, feeding observations into the correction system via `writeCorrection()` from S01.

The codebase has strong patterns from S01 and S04 that make implementation straightforward. The main design questions are: what format TECH-DEBT.md should use (structured markdown vs JSONL), how to wire auto-logging into dispatch prompts, and where to place the passive monitoring hook in auto.ts.

## Recommendation

**Three modules, three tasks:**

1. **`tech-debt.ts`** — Core module with `logDebt()`, `listDebt()`, `resolveDebt()`. Write entries to `.gsd/TECH-DEBT.md` as structured markdown (not JSONL — this file is meant to be human-readable and browsed during planning, unlike corrections which are machine-processed). Sequential TD-NNN IDs. Types: bug, design, test-gap, doc-gap. Severities: critical, high, medium, low. Non-throwing I/O pattern matching corrections.ts. Include `nextDebtId()` parsing existing entries for auto-increment.

2. **Auto-logging wiring** — Add tech debt auto-logging instructions to quality gating. At `standard` level, add instructions telling the agent to log critical/high issues. At `strict`, all severities. This integrates into the existing `{{quality}}` template variable in `execute-task.md` — extend `buildQualityInstructions()` in `quality-gating.ts` to include auto-logging text, OR add a new `{{techDebt}}` template variable. Recommendation: extend the quality instructions (D030 established single `{{quality}}` variable pattern). Also wire into `complete-slice.md` prompt so tech debt is reviewed during slice completion.

3. **`passive-monitor.ts`** — `diffPlanVsSummary(planContent, summaryContent)` returns structured drift observations (scope expansion, contraction, shift, new requirements surfaced, deviations). `detectScopeChange()` compares plan tasks against summary outcomes. Hook into auto.ts after `complete-slice` unit finishes, before the merge to main. Feed drift observations into `writeCorrection()` as `source: 'programmatic'` with category `process.scope_drift` or `process.planning_error`.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Quality level resolution | `resolveQualityLevel()` in `quality-gating.ts` | Already handles preference reading, error fallback to "fast", all edge cases |
| Correction writing | `writeCorrection()` in `corrections.ts` | Non-throwing JSONL append with validation, kill switch, truncation |
| Plan parsing | `parsePlan()` in `files.ts` | Already parses slice plans into `SlicePlan` with tasks, must-haves, goal, demo |
| Summary parsing | `parseSummary()` in `files.ts` | Already parses frontmatter (provides, affects, deviations) and body sections |
| Preference promotion | `checkAndPromote()` in `pattern-preferences.ts` | Already handles threshold checks, confidence scoring, cross-project promotion |
| File path resolution | `resolveSliceFile()`, `resolveGsdRootFile()` in `paths.ts` | Already knows how to find .gsd/ files with flexible naming |

## Existing Code and Patterns

- `src/resources/extensions/gsd/corrections.ts` — **Primary pattern to follow.** Non-throwing I/O with `WriteResult` return type, `cwd` parameter for test isolation, silent error handling. `logDebt()` should mirror `writeCorrection()` structure.
- `src/resources/extensions/gsd/quality-gating.ts` — Consumes `resolveQualityLevel()` for gating auto-logging severity. `buildQualityInstructions()` is where auto-logging instructions should be added (extends existing standard/strict instruction text).
- `src/resources/extensions/gsd/auto.ts` lines 655-680 — Post-complete-slice merge logic. Passive monitoring hook should go BEFORE the merge (when plan and summary are both on the slice branch), or AFTER merge (when both files are on main). After merge is cleaner since files are committed and final.
- `src/resources/extensions/gsd/auto.ts` lines 893-910 — Post-completion correction detection + pattern analysis block. Passive monitoring should follow this same pattern: non-fatal try/catch, kill switch check, called at the central post-completion point.
- `src/resources/extensions/gsd/files.ts` — `parsePlan()` returns `SlicePlan` with `{ tasks: TaskPlanEntry[], mustHaves, goal, demo, filesLikelyTouched }`. `parseSummary()` returns `Summary` with `{ frontmatter: { provides, affects, key_files }, whatHappened, deviations, filesModified }`. These are the inputs for plan-vs-summary diffing.
- `src/resources/extensions/gsd/recall.ts` — Pattern for `buildRecallBlock()`: synchronous, non-throwing, reads from `.gsd/patterns/`, returns string for template variable injection. Same pattern should apply to any tech debt template variable.
- `src/resources/extensions/gsd/correction-types.ts` — `DiagnosisCategory` type includes `code.scope_drift`, `process.planning_error`, `process.requirement_misread` which are the natural categories for passive monitoring observations.
- `src/resources/extensions/gsd/tests/corrections-io.test.ts` — Test pattern: custom `assert()`/`assertEq()` helpers, `mkdtempSync()` for isolation, `try/finally` cleanup. All S05 tests should follow this pattern.
- `src/resources/extensions/gsd/prompts/execute-task.md` — Has `{{quality}}` and `{{corrections}}` variables. Tech debt auto-logging instructions should go through `{{quality}}` (already present at standard/strict levels).
- `src/resources/extensions/gsd/prompts/complete-slice.md` — Slice completion prompt. Currently has no tech debt or passive monitoring hooks. This is where we'll add a step to review/log tech debt discoveries during slice completion.

## Constraints

- **All new code must be TypeScript in `src/resources/extensions/gsd/`** — no new directories, no runtime deps
- **TECH-DEBT.md is project-level** (`.gsd/TECH-DEBT.md`), not milestone-scoped — debt spans milestones (D006)
- **Non-throwing I/O** — all public functions return structured results or safe defaults, never throw (D013 pattern)
- **`cwd` parameter for test isolation** — all I/O functions accept optional `cwd` so tests use temp directories
- **Quality instructions token budget** — S04 measured standard at ~130 tokens and strict at ~200 tokens, well under the 400/600 budgets. Adding tech debt auto-logging text should stay conservative (~50-80 additional tokens per level).
- **Passive monitoring is post-completion only** — not a background process, runs synchronously in the auto.ts dispatch loop after slice completion (R015 spec)
- **S04's `resolveQualityLevel()` uses `loadEffectiveGSDPreferences()` which caches `process.cwd()` at module load** — if tech-debt.ts needs cwd-relative quality level, use the direct file read pattern (D016)
- **`aggregateGateOutcomes()` and `formatGateSummaryLine()` referenced in S04 summary don't actually exist** — S04 summary claims dashboard integration but the code doesn't have these functions. S05 does NOT depend on them, but this is a notable discrepancy.
- **Test runner is Node.js with `--experimental-strip-types`** — no Jest, no Vitest. Custom assert helpers, `process.exit()` with pass/fail counts.

## Common Pitfalls

- **Markdown parsing fragility** — TECH-DEBT.md entries will be hand-edited by agents. The parser must be lenient — handle missing fields, extra whitespace, inconsistent formatting. Don't require perfect markdown structure.
- **TD-NNN ID collision** — When parsing existing entries for `nextDebtId()`, handle gaps (TD-001, TD-003 → next is TD-004, not TD-002). Also handle malformed entries that don't parse.
- **Plan-vs-summary false positives** — A task being "different from plan" is normal (deviations section exists for a reason). Only flag structural drift: tasks added/removed, scope significantly expanded/contracted, requirements surfaced that weren't in scope. Don't flag deviations that are already documented.
- **Quality instruction ordering** — S04's `buildQualityInstructions()` returns pre-task and post-task sections. Tech debt auto-logging is a post-task instruction ("after implementation, log any tech debt you noticed"). Must go in the correct section.
- **Passive monitoring timing** — Must run after `complete-slice` produces the summary, but the summary is written by the LLM during the complete-slice unit, then committed on the slice branch, then merged to main. The plan-vs-summary diff should run after merge when both files are definitively on main.
- **Kill switch interaction** — `correction_capture: false` should also disable passive monitoring observations (since they write corrections). Check the kill switch in the passive monitor.

## Open Risks

- **Agent compliance with auto-logging** — Auto-logging instructions tell the LLM to write TECH-DEBT.md entries. The LLM may ignore these at high context pressure, just as self-report corrections can be under-reported (known risk from M001 context). This is acceptable — programmatic detection supplements self-report.
- **Plan format variability** — `parsePlan()` and `parseSummary()` parse specific markdown structures. If a plan or summary deviates from the template, the passive monitor may not extract useful data. Mitigation: fail gracefully (return empty drift result, don't crash).
- **TECH-DEBT.md concurrent writes** — Multiple auto-mode tasks won't write simultaneously (sequential execution), but manual edits during auto-mode could race. Mitigation: read-before-write for ID assignment, but accept that manual edits during auto-mode are the user's responsibility.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| TypeScript | N/A | Core language — no skill needed |
| Node.js filesystem | N/A | Standard library — no skill needed |
| Markdown parsing | N/A | Simple regex/string parsing — no library skill needed |

No external technologies or frameworks are involved in this slice. All work uses Node.js standard library and existing codebase patterns.

## Sources

- S01 Summary — correction I/O patterns, non-throwing WriteResult, cwd parameter convention
- S04 Summary — quality gating integration, resolveQualityLevel, buildQualityInstructions, {{quality}} template variable
- `corrections.ts` — reference implementation for non-throwing file I/O
- `quality-gating.ts` — reference for quality level gating and instruction text
- `files.ts` — parsePlan/parseSummary interfaces for drift analysis inputs
- `auto.ts` — post-completion hooks, dispatch loop, correction emission pattern
- `execute-task.md` / `complete-slice.md` — dispatch prompt templates for wiring
- D006 — Tech debt file location decision (`.gsd/TECH-DEBT.md`)
- R013/R014/R015 — Requirement specifications for tech debt register, auto-logging, passive monitoring

## Architecture Notes

### TECH-DEBT.md Format

Structured markdown with sequential entries:

```markdown
# Tech Debt Register

## TD-001: Missing test coverage for edge case X
- **Type:** test-gap
- **Severity:** medium
- **Component:** src/resources/extensions/gsd/corrections.ts
- **Status:** open
- **Logged:** 2026-03-11 during M001/S05/T01
- **Description:** The rotation function doesn't handle the case where...

## TD-002: Hardcoded timeout value
- **Type:** design
- **Severity:** low
- **Component:** src/resources/extensions/gsd/auto.ts
- **Status:** resolved
- **Resolved:** 2026-03-12 in M001/S05/T03
- **Description:** The 500ms settle delay should be configurable...
```

This format is chosen over JSONL because:
1. TECH-DEBT.md is browsed by humans and agents during planning (read-heavy)
2. Sequential IDs make it easy to reference ("see TD-003")
3. Markdown headings enable section-level reading with existing file tools
4. Status changes are visible in git diffs

### Passive Monitor Integration Point

```
complete-slice unit finishes
  → auto.ts merges slice branch to main (existing)
  → auto.ts checks for UAT (existing)
  → auto.ts checks for reassessment (existing)
  → NEW: auto.ts runs passive monitoring (plan-vs-summary diff)
       reads plan and summary from disk
       compares task lists, must-haves, scope
       writes drift observations as corrections
```

The monitoring runs at the `complete-slice` transition in `dispatchNextUnit()`, after the merge to main and before UAT/reassessment dispatch. This is the natural point because both plan and summary are finalized and on the current branch.

### Quality-Gated Auto-Logging

Extend `buildQualityInstructions()` to append tech debt logging instructions:
- **standard**: "Log critical/high severity code issues to `.gsd/TECH-DEBT.md`"
- **strict**: "Log ALL code issues discovered to `.gsd/TECH-DEBT.md`"
- **fast**: no instructions (zero behavioral change)

This keeps the auto-logging within the existing `{{quality}}` template variable pipeline — no new template variables needed.
