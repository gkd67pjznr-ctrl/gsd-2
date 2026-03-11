# S03: Learning Loop Closure — Research

**Date:** 2026-03-11

## Summary

S03 closes the learning loop by delivering three capabilities: (1) live recall injection — replacing the static `{{corrections}}` self-report block in dispatch prompts with dynamic, filtered, token-budgeted recall of past corrections and preferences; (2) skill refinement retirement — marking corrections and preferences as retired after skill refinement so they exit active recall; and (3) cross-project preference promotion — writing preferences that appear in 3+ projects to `~/.gsd/preferences.json` as user-level preferences.

All three capabilities have clear gsdup reference implementations to guide the design. The primary integration point is `buildCorrectionsVar()` in `auto.ts`, which currently returns static self-report text and needs to become dynamic. The new modules (`recall.ts`, `retire.ts`, `promote-preference.ts`) follow the same non-throwing, structured-result patterns established in S01/S02. The `{{corrections}}` template variable in `execute-task.md` requires no changes — only the function that populates it changes.

The main risk is the **prompt injection budget** (M001's proof strategy targets retiring this risk in S03): the recall block must stay under ~3K tokens with real correction data. The gsdup reference uses a slot-based approach (10 max entries, preferences first, corrections fill remaining) with a `words / 0.75` token estimator. This approach is proven and directly portable.

## Recommendation

Implement three new modules plus one modification to `auto.ts`:

1. **`recall.ts`** — `buildRecallBlock(options)` reads active preferences and active non-retired corrections, deduplicates (corrections already promoted to preferences are excluded), applies slot allocation (preferences first, up to 10 entries total), enforces ~3K token budget with word-based estimation, and returns a formatted `<system-reminder>` block. Also preserves the existing self-report instruction text at the end of the block so agents continue to self-report.
2. **`retire.ts`** — `retireByCategory(category, suggestionId, options)` marks all active corrections and preferences matching a category as retired (sets `retired_at`, `retired_by`), and updates the matching suggestion to `status: 'refined'`. Uses atomic tmp+rename writes. Non-destructive — entries stay in JSONL, just gain retirement fields.
3. **`promote-preference.ts`** — `promoteToUserLevel(preference, options)` upserts to `~/.gsd/preferences.json` tracking `source_projects` per category+scope, promotes when 3+ distinct projects contribute. Uses `path.basename(cwd)` as projectId (matching gsdup).
4. **`auto.ts` modification** — Replace `buildCorrectionsVar()` body to call `buildRecallBlock()` from `recall.ts`. The function signature stays the same; only the implementation changes from static text to dynamic recall.

Test-first: write tests before implementations, following the `assert/assertEq` + temp directory pattern from S01/S02.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Token estimation | gsdup's `Math.ceil(text.split(/\s+/).filter(Boolean).length / 0.75)` | Proven formula used in production gsdup recall injection; matches the ~3K budget constraint |
| Cross-project promotion | gsdup `promote-preference.cjs` with `source_projects` tracking | Proven pattern with 173 LOC of tests; `~/.gsd/preferences.json` already exists with this exact schema |
| Retirement flow | gsdup `retire.cjs` with atomic rewrite of JSONL files | Proven non-destructive retirement pattern with 333 LOC of tests |
| Recall block formatting | gsdup `gsd-recall-corrections.cjs` with `<system-reminder>` wrapper | Proven slot allocation + token budget assembly |

## Existing Code and Patterns

- `src/resources/extensions/gsd/auto.ts` lines 1113-1136 — `SELF_REPORT_INSTRUCTIONS` and `buildCorrectionsVar()` are the exact replacement target. S03 replaces the body of `buildCorrectionsVar()` to call `recall.ts`. The self-report text should be appended after the recall block (not replaced) so agents continue to self-report corrections.
- `src/resources/extensions/gsd/auto.ts` line 1543 — `corrections: buildCorrectionsVar()` is where the template variable gets populated in the dispatch prompt. No change needed here.
- `src/resources/extensions/gsd/corrections.ts` — `readCorrections({ status: 'active' })` returns active corrections sorted by timestamp descending. This is the read API for recall.
- `src/resources/extensions/gsd/pattern-preferences.ts` — `readPreferences({ status: 'active' })` returns active preferences. This is the other read API for recall. `writePreference()` provides atomic upsert — retire.ts reuses the same tmp+rename pattern.
- `src/resources/extensions/gsd/preference-types.ts` — `PreferenceEntry` has `retired_at` and `retired_by` fields ready for retirement. `SuggestionEntry` has `status`, `refined_at` ready for refinement tracking.
- `src/resources/extensions/gsd/observer.ts` — `analyzePatterns()` loads and writes `suggestions.json`. The retirement module needs to read/write the same file format (`SuggestionsDocument`).
- `~/.gsd/preferences.json` — Already exists with the correct schema: `{ version, preferences: [{ category, scope, preference_text, confidence, source_projects, promoted_at, updated_at }] }`. The promote module writes to this file.
- `gsdup/.claude/hooks/gsd-recall-corrections.cjs` — Reference implementation for recall assembly. Key design: slot-based (10 entries max), preferences get priority, corrections fill remaining, `<system-reminder>` wrapper, word-based token estimation, footer showing skipped count.
- `gsdup/.claude/hooks/lib/retire.cjs` — Reference implementation for retirement. Key design: processes active file + all archive files, marks entries with `retired_at`/`retired_by`, updates suggestion status to `'refined'`, all atomic writes.
- `gsdup/.claude/hooks/lib/promote-preference.cjs` — Reference implementation for cross-project promotion. Key design: `source_projects` array per entry, `promoted_at` set when 3+ projects, `path.basename(cwd)` as projectId, `Math.max()` for confidence merging.

## Constraints

- **~3K token budget** for the entire recall block including self-report instructions. The gsdup reference uses `MAX_TOKENS = 3000` with `FOOTER_RESERVE = 20`. The self-report instructions block is ~200 words ≈ ~267 tokens, leaving ~2733 tokens for dynamic recall.
- **Non-throwing I/O pattern** — All three new modules must never throw. All public functions return structured results or safe defaults. This is the established pattern from S01/S02 (D013).
- **`cwd` parameter for testability** — All I/O functions accept `options.cwd` for test isolation in temp directories. Established in S01 corrections.ts.
- **Atomic writes via tmp+rename** — All file mutations use the tmp+rename pattern established in S01/S02.
- **`buildCorrectionsVar()` must remain synchronous** — It's called synchronously in the `loadPrompt()` vars object (line 1543 in auto.ts). `readCorrections()` and `readPreferences()` are both synchronous, so `buildRecallBlock()` can be synchronous too.
- **Must preserve self-report instructions** — The recall block should include self-report text so agents continue logging corrections manually. The gsdup reference puts recall in a session-start hook (separate from self-report). In gsd2, both share the `{{corrections}}` variable, so the recall block must contain both.
- **User-level preferences.json is shared** — `~/.gsd/preferences.json` is accessed by all projects. Reads/writes must be atomic and handle concurrent access gracefully. The file is small (typically <50 entries).
- **Must not import Pi SDK at module level** — The ESM/CJS incompatibility issue from D022 applies. Use `homedir()` from `node:os` for `~/.gsd/` paths, not `getAgentDir()`.

## Common Pitfalls

- **Forgetting to include self-report instructions** — The `{{corrections}}` variable currently serves double duty: self-report instructions AND (in S03) recall data. If recall replaces self-report entirely, agents stop logging corrections. Solution: append self-report text after recall block.
- **Token budget exceeded by preferences alone** — If there are many active preferences, they could consume the entire budget before any corrections appear. Solution: use slot allocation (gsdup's approach) with a fixed max of 10 entries total, preferences first.
- **Retirement not covering archive files** — `readCorrections()` reads both the active file and `corrections-*.jsonl` archives. Retirement must also process all archive files, not just the active file. The gsdup reference correctly handles this.
- **Cross-project promotion during tests pollutes `~/.gsd/preferences.json`** — Tests must either mock the home directory or use `GSD_HOME` env var to redirect. The gsdup reference uses `GSD_HOME` env var override via `getGsdHome()`.
- **Suggestion status update race with observer** — `retireByCategory()` writes to `suggestions.json`, and `analyzePatterns()` also writes to it. If both run in the same tick, last-write-wins. In practice this is safe because retirement is user-initiated (via a future `/gsd suggest` command) and observation runs at task completion — they don't overlap.
- **`readPreferences` in recall must use pattern-preferences module** — There are two different `readPreferences` concepts: config preferences from `preferences.ts` (YAML frontmatter) and learned preferences from `pattern-preferences.ts` (JSONL). Recall needs the JSONL learned preferences.

## Open Risks

- **Prompt injection budget proof** — M001's proof strategy requires proving filtered recall stays under 3K tokens with real correction data. Since there's no real correction data yet (`.gsd/patterns/` is empty), the proof will be tested with synthetic data in unit tests. Real-world proof deferred to actual auto-mode runs.
- **Skill refinement is partially deferred** — R008 (Skill Refinement Workflow) describes a full collaborative refinement workflow (user reviews changes, confirms, writes skill file). The retirement module (`retire.ts`) enables this by providing `retireByCategory()`, but the actual interactive refinement command (equivalent to gsdup's `/gsd:suggest`) is NOT in S03's scope — it requires a gsd2 command implementation. S03 provides the machinery; the user-facing workflow is a follow-up.
- **R006 guardrails partially proven** — S02 proved 4 of 6 guardrails. S03's retirement module addresses the "permission path" aspect (user must confirm before retirement occurs). User confirmation and co-activation guardrails remain runtime concerns that need end-to-end verification.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| TypeScript | n/a | No skills needed — pure TS modules with Node.js built-ins only |
| Node.js fs | n/a | All I/O uses `node:fs` sync APIs already established in S01/S02 |

## Sources

- gsdup recall injection hook and its ~3K token budget approach (source: `gsdup/.claude/hooks/gsd-recall-corrections.cjs`)
- gsdup retirement library with non-destructive JSONL rewrite (source: `gsdup/.claude/hooks/lib/retire.cjs`)
- gsdup cross-project promotion with source_projects tracking (source: `gsdup/.claude/hooks/lib/promote-preference.cjs`)
- gsdup suggest command with full refinement workflow (source: `gsdup/commands/gsd/suggest.md`)
- gsdup test suites for retire (333 LOC), promote-preference (173 LOC), recall-injection (312 LOC) (source: `gsdup/tests/hooks/`)
- S01 forward intelligence on `buildCorrectionsVar()` replacement path (source: S01-SUMMARY.md)
- S02 forward intelligence on `readPreferences()` API and suggestion lifecycle (source: S02-SUMMARY.md)
- Existing `~/.gsd/preferences.json` schema verified on disk (source: `~/.gsd/preferences.json`)
