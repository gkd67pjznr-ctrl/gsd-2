# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| # | When | Scope | Decision | Choice | Rationale | Revisable? |
|---|------|-------|----------|--------|-----------|------------|
| D001 | M001 | arch | Correction detection mechanism | Dual: programmatic (retries, stuck, reverts from activity logs) + self-report (dispatch prompt instructions) | gsdup hooks aren't available in gsd2; programmatic catches hard signals, self-report catches soft signals | Yes — if Pi SDK adds hook support |
| D002 | M001 | arch | Correction/preference storage format | JSONL in `.gsd/patterns/` | Append-heavy writes suit JSONL; matches gsdup's proven schema; separate from YAML preferences which are read-heavy config | No |
| D003 | M001 | arch | Quality level storage | Extend existing `preferences.md` YAML frontmatter | Quality is a preference, not a separate config; avoids config proliferation | No |
| D004 | M001 | arch | Quality enforcement mechanism | Prompt injection via template variables | gsd2 controls dispatch prompts programmatically; more reliable than embedding instructions in agent files (gsdup approach) | No |
| D005 | M001 | arch | Quality gate metrics storage | Extend existing `metrics.ts` ledger | Gate events are unit-scoped metrics; extending the ledger is cleaner than a separate JSONL file | Yes — if volume is too high |
| D006 | M001 | arch | Tech debt file location | `.gsd/TECH-DEBT.md` (project-level, not milestone-scoped) | Debt spans milestones; matches gsdup's proven design | No |
| D007 | M001 | pattern | Correction taxonomy | 14-category taxonomy from gsdup (7 code + 7 process categories) | Proven in production across gsdup v6.0; well-tested coverage | Yes — if new categories emerge |
| D008 | M001 | pattern | Preference confidence formula | Bayesian-ish: count / (count + 2) | Starts at 0.6 at threshold (3 corrections), asymptotically approaches 1.0; proven in gsdup | No |
| D009 | M001 | pattern | Bounded learning guardrails | 6 non-negotiable constraints from gsdup (20% max change, 3 min corrections, 7-day cooldown, user confirmation, permission checks, 5+ co-activations) | Safety boundary for self-modifying system; proven in gsdup | No |
| D010 | M001 | scope | Browser dashboard | Deferred | gsd2 has TUI dashboard; browser dashboard is a different product surface requiring a Node.js server, SSE, component system | Yes — if user demand |
| D011 | M001 | scope | Concurrent milestones | Out of scope | gsd2's sequential model with `/gsd queue` + programmatic session management eliminates the workspace isolation problem | No |
| D012 | M001 | arch | Implementation approach | New TypeScript modules referencing gsdup designs, not porting CJS code | Different runtime (Pi SDK vs Claude Code hooks), different patterns (async/await vs sync CJS), different integration surfaces | No |
