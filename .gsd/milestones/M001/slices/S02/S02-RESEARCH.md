# S02: Preference Engine — Research

**Date:** 2026-03-11

## Summary

S02 builds three capabilities on top of S01's correction capture foundation: (1) automatic preference promotion when correction patterns repeat, (2) a preference I/O layer with JSONL persistence, scope filtering, and upsert semantics, and (3) an observer engine that aggregates corrections cross-scope, enforces bounded learning guardrails, and writes skill refinement suggestions.

The gsdup reference implementations (`write-preference.cjs`, `analyze-patterns.cjs`, `promote-preference.cjs`, `retire.cjs`) are well-tested (200+ test assertions across 4 test files) and provide proven designs for all three components. The gsd2 reimplementation is straightforward — the core algorithms (confidence formula, guardrail checks, watermark-based dedup, upsert semantics) transfer directly. The main adaptation work is: (a) TypeScript async-friendly module design instead of CJS, (b) using gsd2's `.gsd/patterns/` directory instead of gsdup's `.planning/patterns/`, (c) using gsd2's skill directory structure (`~/.gsd/agent/skills/`) instead of gsdup's (`.claude/skills/`), and (d) reading observer config from preferences rather than a separate `config.json`.

The six bounded-learning guardrails (D009) are non-negotiable safety constraints. The gsdup reference enforces two of them directly in the observer engine (3-correction minimum, 7-day cooldown). The remaining four (20% max change, user confirmation, permission checks, 5+ co-activations) are enforced at the refinement execution point in S03, not in the observer itself. This means S02's observer only needs to enforce minimum threshold, cooldown, and auto-dismiss — the rest are S03's responsibility.

## Recommendation

Implement three modules mirroring the gsdup reference architecture, adapted for gsd2's TypeScript patterns:

1. **`preferences.ts` (patterns module)** — Preference JSONL I/O: `writePreference()` (upsert by category+scope), `readPreferences()` (filtered read with scope/status), `checkAndPromote()` (count matching corrections, promote at threshold ≥3). Follow the same non-throwing I/O pattern established in S01's `corrections.ts` (D013).

2. **`observer.ts`** — Observer engine: `analyzePatterns()` reads corrections, deduplicates against active preferences and a watermark, groups by category cross-scope, enforces guardrails (threshold, cooldown, no duplicate pending), generates suggestions with skill mapping, auto-dismisses expired suggestions. Writes `suggestions.json` atomically.

3. **Integration in `auto.ts`** — Wire `checkAndPromote()` into the correction write path so preferences are promoted automatically after each correction capture. Wire `analyzePatterns()` as a post-completion hook so suggestions are generated after task completion.

Do NOT implement cross-project promotion (`promoteToUserLevel`) in S02 — the boundary map explicitly assigns that to S03 (R009). Do NOT implement retirement (`retireByCategory`) — that's S03 (R008). S02 produces the preference and suggestion data; S03 consumes it for recall, refinement, and promotion.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Correction counting by category+scope | gsdup `countMatchingCorrections()` | Proven pattern: reads active + archive files, tracks latest timestamp and text |
| Confidence formula | `count / (count + 2)` (D008) | Bayesian-ish formula: 0.6 at threshold (3), asymptotically approaches 1.0 |
| JSONL upsert | gsdup `upsertPreference()` with tmp+rename | Atomic writes, preserves `created_at`/`retired_at` on update, battle-tested |
| Suggestion ID generation | gsdup `generateSuggestionId()` with epoch+counter | Guarantees uniqueness within document, human-readable |
| Guardrail enforcement | gsdup `checkGuardrails()` | Cooldown check against accepted/refined suggestions per target skill |
| Non-throwing I/O | S01 `WriteResult` pattern (D013) | All preference/observer I/O should return structured results, never throw |

## Existing Code and Patterns

- `src/resources/extensions/gsd/corrections.ts` — **Consume directly**: `readCorrections({ status: 'active' })` returns `CorrectionEntry[]` sorted by timestamp desc. Reads active + archives. `writeCorrection()` returns `WriteResult`. These are the primary data sources for preference promotion and pattern analysis.
- `src/resources/extensions/gsd/correction-types.ts` — **Consume directly**: `CorrectionEntry`, `DiagnosisCategory`, `CorrectionScope`, `VALID_CATEGORIES`, `isValidCategory()`. All type definitions for the correction domain. Preference entries will reference these types.
- `src/resources/extensions/gsd/auto.ts` — **Integration target**: Lines ~1180-1210 show `emitProgrammaticCorrections()` pattern. S02 needs to add `checkAndPromote()` calls after corrections are written. Also needs an `analyzePatterns()` call at post-completion.
- `src/resources/extensions/gsd/preferences.ts` — **Naming collision alert**: This file is the config preferences system (`GSDPreferences`, `loadEffectiveGSDPreferences()`). The new patterns-level preferences module must NOT be named `preferences.ts`. Use `pattern-preferences.ts` or `preference-engine.ts` to avoid confusion.
- `src/resources/extensions/gsd/skill-discovery.ts` — **Reference for skill directories**: Uses `getAgentDir()` from Pi SDK + `"skills"` subdirectory to find installed skills. The observer's skill mapping needs this path, not gsdup's `.claude/skills/`.
- `src/resources/extensions/gsd/tests/corrections-io.test.ts` — **Test pattern to follow**: Uses custom assert helpers (not vitest), temp directories for isolation, `makeValidEntry()` fixture helper. All S02 tests should match this structure.
- `gsdup/.claude/hooks/lib/write-preference.cjs` — **Reference design**: `checkAndPromote()`, `upsertPreference()`, `countMatchingCorrections()`, `readPreferences()`. Port to TypeScript, change `.planning/patterns` to `.gsd/patterns`.
- `gsdup/.claude/hooks/lib/analyze-patterns.cjs` — **Reference design**: `analyzePatterns()` with watermark, cross-scope grouping, guardrail checks, suggestion generation, auto-dismiss. Port to TypeScript, adapt skill paths, remove config.json dependency.
- `gsdup/.claude/hooks/lib/retire.cjs` — **S03 reference, not S02**: `retireByCategory()` marks corrections/preferences as retired. S02 must design preference entries with `retired_at`/`retired_by` fields so S03 can implement retirement without schema changes.
- `gsdup/.claude/hooks/lib/promote-preference.cjs` — **S03 reference, not S02**: Cross-project promotion to `~/.gsd/preferences.json`. S02 must not implement this — but should not block it either (preference entries should contain all fields S03 needs).

## Constraints

- **Module naming**: Cannot use `preferences.ts` — already taken by config preferences. Must use a distinct name (e.g. `pattern-preferences.ts` or `preference-engine.ts`).
- **Storage path**: Must use `.gsd/patterns/preferences.jsonl` and `.gsd/patterns/suggestions.json` (not `.planning/patterns/` as in gsdup). Already covered by `.gsd/patterns/` gitignore entry from S01.
- **Import style**: Use `.ts` imports (not `.js`) — project convention with Node 25.8.0 `--experimental-strip-types`. Match S01's import pattern.
- **No external dependencies**: All modules must use only Node.js built-ins + Pi SDK. No npm packages.
- **Non-throwing I/O**: All public functions must return structured results or safe defaults, never throw (D013 pattern).
- **Test framework**: Use the project's custom test runner pattern (assert helpers, `process.exit(1)` on failure) — not vitest, not node:test describe/it. Match `corrections-io.test.ts` structure.
- **Skill directory path**: gsd2 skills live at `~/.gsd/agent/skills/<name>/SKILL.md` (via `getAgentDir()` + "skills"). gsdup used `.claude/skills/<name>/`. The observer's skill existence check must use the gsd2 path.
- **No config.json**: gsdup's observer reads `minOccurrences`, `cooldownDays`, `autoDismissAfterDays` from `.planning/config.json`. gsd2 does not have this file. Use hardcoded defaults matching gsdup's values (3, 7, 30) — making them configurable via preferences is a nice-to-have, not a must-have.
- **Atomic writes**: Preference upserts and suggestion writes must use tmp+rename for atomicity, matching the gsdup pattern and the corrections rotation approach.

## Common Pitfalls

- **Confusing the two preference systems** — gsd2 has `preferences.ts` (config preferences: skills, models, etc.) and will now have a patterns-level preferences module (learned patterns from corrections). These are completely different concerns. Name the new module clearly, use distinct types (`PreferenceEntry` not `GSDPreferences`), and document the distinction.
- **Over-scoping S02 with S03 features** — The boundary map is clear: S02 produces preferences and suggestions. S03 consumes them for recall injection, retirement, and cross-project promotion. Don't implement `retireByCategory()`, `promoteToUserLevel()`, or recall building in S02.
- **Observer dedup logic is two-layered** — The observer must dedup against both: (a) active preferences (category:scope match → skip those corrections) AND (b) the watermark timestamp (skip corrections already analyzed). Missing either layer causes duplicate suggestions or wasted analysis.
- **Cross-scope aggregation vs scope-specific promotion** — Preference promotion (`checkAndPromote`) matches by category+scope (a `code.wrong_pattern` at `file` scope is different from one at `project` scope). The observer (`analyzePatterns`) groups by category only (cross-scope) for suggestion generation. These are intentionally different — don't unify them.
- **Skill mapping needs adaptation** — gsdup maps categories to hardcoded skill names (`typescript-patterns`, `code-review`, `gsd-workflow`, `session-awareness`). These skills don't exist in gsd2. The mapping should either reference gsd2's actual skills (`frontend-design`, `swiftui`, `debug-like-expert`) or use a generic/configurable approach. Since gsd2 skills are different from gsdup skills, the CATEGORY_SKILL_MAP concept needs rethinking for S02 or deferral to S03.
- **Kill switch dual-read** — S01 established two different approaches for reading the kill switch (D016/D018). The preference engine module should follow the same cwd-relative direct-read approach as `corrections.ts` (D016) since it needs test isolation via cwd parameter.

## Open Risks

- **Skill mapping gap**: gsdup's `CATEGORY_SKILL_MAP` references skills that don't exist in gsd2 (`typescript-patterns`, `code-review`, `gsd-workflow`, `session-awareness`). The observer generates suggestions that reference target skills. If no skill mapping is applicable, suggestions will always be `new_skill_needed` type. This is acceptable for S02 (the observer still functions), but reduces the value of suggestions. Decision: use a generic mapping or make it configurable — resolve during planning.
- **checkAndPromote call frequency**: In gsdup, `checkAndPromote()` is called inside `writeCorrection()` — every correction write triggers a promotion check. In gsd2, `writeCorrection()` is a pure I/O function that doesn't call preferences. The integration point needs to be in `auto.ts` after each `writeCorrection()` call. This is cleaner (separation of concerns) but requires wiring at each call site.
- **Observer trigger timing**: gsdup calls `analyzePatterns()` as a PostToolUse hook. gsd2 needs to choose when to call it — after each task completion? After each slice? Per-task is more responsive but adds I/O overhead. Per-slice is less noisy. Decision: call after task completion, matching gsdup's granularity.
- **Suggestion storage growth**: `suggestions.json` grows with each analysis run (suggestions are never deleted, only status-transitioned). With many tasks, this could become large. Auto-dismiss at 30 days mitigates this. Monitor size if needed.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| TypeScript JSONL persistence | none found | No relevant skills — hand-roll following S01 patterns |

## Sources

- gsdup `write-preference.cjs` — preference promotion logic, upsert semantics, confidence formula (source: local reference)
- gsdup `analyze-patterns.cjs` — observer engine, guardrails, watermark, cross-scope aggregation (source: local reference)
- gsdup `promote-preference.cjs` — cross-project promotion design (source: local reference, S03 scope)
- gsdup `retire.cjs` — retirement design (source: local reference, S03 scope)
- gsdup `preference-tracking.test.ts` — 30+ test assertions for promotion, confidence, upsert, scope, status filtering (source: local reference)
- gsdup `analyze-patterns.test.ts` — 20+ test assertions for threshold, dedup, watermark, skill mapping, guardrails, auto-dismiss (source: local reference)
- S01 summary — forward intelligence on readCorrections API, WriteResult pattern, kill switch approaches (source: S01-SUMMARY.md)
- D008 (confidence formula), D009 (guardrails), D013 (non-throwing I/O), D014 (conservative detection) — key decisions constraining S02 design (source: DECISIONS.md)
