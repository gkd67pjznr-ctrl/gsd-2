# Requirements

This file is the explicit capability and coverage contract for the project.

## Active

### R001 — Correction Capture
- Class: core-capability
- Status: active
- Description: When the user corrects the agent's work (reverts a file, rewrites output, explicitly says "no/wrong/redo"), a structured entry is persisted with what was wrong, what was expected, a diagnosis category, scope, and timestamp
- Why it matters: Corrections are the highest-signal learning data — without capture, the system has no memory of its mistakes
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: partial — contract proven (types, I/O, detection from fixtures); runtime proof pending real auto-mode runs in S02/S03
- Notes: Implemented via dual approach: programmatic detection (detectCorrections with 4 signals: retry, stuck, timeout, revert) + self-report instructions in dispatch prompts. Wired into auto.ts at post-completion and stuck detection points. Kill switch via correction_capture preference.

### R002 — Diagnosis Taxonomy
- Class: core-capability
- Status: active
- Description: Each captured correction includes a root cause classification from a defined taxonomy (code.wrong_pattern, code.missing_context, code.stale_knowledge, code.over_engineering, code.under_engineering, code.style_mismatch, code.scope_drift, process.planning_error, process.research_gap, process.implementation_bug, process.integration_miss, process.convention_violation, process.requirement_misread, process.regression)
- Why it matters: Categorization enables pattern aggregation — without it, corrections are just anecdotes
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: validated — 82 test assertions prove all 14 categories valid, validators reject invalid categories, type guards enforce membership (S01)
- Notes: 14 categories across code tier and process tier, proven in gsdup v6.0. Implemented as VALID_CATEGORIES Set with isValidCategory() and isValidEntry() guards.

### R003 — Correction Storage and Rotation
- Class: continuity
- Status: active
- Description: Corrections are stored as append-only JSONL, rotated to dated archive files when exceeding a configurable threshold (default 1000 lines), respecting retention_days config
- Why it matters: Without rotation, correction files grow unbounded; without retention, old data wastes disk and query time
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: validated — 26 test assertions prove write/read/rotate lifecycle, validation rejection, field truncation, rotation at threshold, archive collision handling, retention cleanup (S01)
- Notes: Storage location is `.gsd/patterns/corrections.jsonl`. Archive naming: `corrections-YYYY-MM-DD.jsonl` with `-N` suffix for same-day collisions.

### R004 — Preference Promotion
- Class: core-capability
- Status: active
- Description: When the same correction category+scope pattern appears 3+ times, it is automatically promoted to a durable preference with a confidence score, scope tag, and upsert semantics
- Why it matters: The jump from individual corrections to stable preferences is where the system transitions from logging to learning
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: none
- Validation: validated — 53 test assertions prove promotion at/below threshold, confidence formula (count/(count+2)), upsert create/update semantics, atomic writes, and structured failure reporting (S02)
- Notes: Confidence formula: count/(count+2). Preferences stored in `.gsd/patterns/preferences.jsonl`

### R005 — Preference Scope Hierarchy
- Class: core-capability
- Status: active
- Description: Preferences are tagged with scope (file, filetype, phase, project, global) defaulting to the narrowest applicable scope, and are queryable by scope for context-appropriate filtering
- Why it matters: A file-level preference shouldn't override all projects; a global preference should apply everywhere
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: none
- Validation: validated — test assertions prove scope tagging on preferences and query-time scope filtering across file, project, global scopes (S02)
- Notes: Scope filtering at query time, not storage time

### R006 — Observer Engine with Bounded Guardrails
- Class: core-capability
- Status: active
- Description: A pattern analysis engine reads corrections, aggregates across scopes by category, enforces bounded learning guardrails (max 20% change per refinement, min 3 corrections, 7-day cooldown, user confirmation required, permission checks never skipped, 5+ co-activations for agent composition), and writes suggestions for skill refinement
- Why it matters: The guardrails prevent a self-modifying system from drifting beyond user intent — they are the safety boundary
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: M001/S03
- Validation: partial — 40 test assertions prove 4 of 6 guardrails (min corrections, cooldown, auto-dismiss, no-duplicate-pending), cross-scope grouping, three-layer dedup, and suggestion lifecycle (S02). User confirmation and permission checks are S03 runtime concerns. Co-activation guardrail deferred (needs agent composition data).
- Notes: All 6 guardrails are non-negotiable. Auto-dismiss expired suggestions after 30 days

### R007 — Live Recall Injection
- Class: core-capability
- Status: active
- Description: When auto mode dispatches a task, relevant corrections and preferences are included in the dispatch prompt — filtered by current phase/scope, capped at ~3K tokens, excluding corrections already retired by skill refinement
- Why it matters: This is where the learning loop closes — past mistakes are surfaced before they can repeat
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: none
- Validation: validated — 22 test assertions prove recall assembly with token budget (3K cap), 10-slot allocation (preferences first), deduplication (promoted corrections excluded), kill switch, and self-report preservation. buildCorrectionsVar() in auto.ts calls buildRecallBlock() (S03)
- Notes: Implemented via buildRecallBlock() in recall.ts, wired into auto.ts buildCorrectionsVar(). Token estimation uses words/0.75. Self-report instructions appended after dynamic recall block.

### R008 — Skill Refinement Workflow
- Class: core-capability
- Status: active
- Description: When 3+ corrections point to the same skill, the system proposes a collaborative refinement — the user reviews and approves changes to the skill file, then source corrections/preferences are retired from active recall
- Why it matters: Skills that don't evolve based on feedback become stale instructions; refinement closes the loop
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: none
- Validation: validated — 21 test assertions prove retirement of corrections (active + archive), preferences, suggestion status updates to 'refined', idempotency, malformed line preservation, missing file handling. Observer suggestions from S02 provide the proposal side (S03)
- Notes: Implemented via retireByCategory() in retire.ts. Processes corrections.jsonl, preferences.jsonl, and suggestions.json. Non-destructive: sets retired_at/retired_by fields. No CLI surface yet — retirement must be triggered programmatically.

### R009 — Cross-Project Preference Promotion
- Class: differentiator
- Status: active
- Description: When a preference appears in 3+ projects, it is promoted to `~/.gsd/preferences.json` as a user-level preference available to all projects
- Why it matters: Learning that transfers across projects is the ultimate value of the system — user-level preferences represent proven patterns
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: none
- Validation: validated — 29 test assertions prove cross-project tracking via source_projects, promotion at 3+ projects, upsert semantics, confidence merging (max), GSD_HOME redirect for testability, and input validation with structured error codes (S03)
- Notes: Implemented via promoteToUserLevel() in promote-preference.ts. Called from checkAndPromote() in pattern-preferences.ts after successful preference write. User-level store uses JSON at ~/.gsd/preferences.json (read-heavy), project-level uses JSONL (append-heavy).

### R010 — Quality Level Configuration
- Class: core-capability
- Status: active
- Description: Projects have a configurable quality level (fast/standard/strict) stored in preferences, defaulting to fast (zero behavioral change). Quality level can be set per-project and globally
- Why it matters: Quality enforcement must be opt-in and configurable — forcing strict mode on every project would slow execution unacceptably
- Source: user
- Primary owning slice: M001/S04
- Supporting slices: none
- Validation: unmapped
- Notes: Stored in `.gsd/preferences.md` as quality_level field. Extends existing preferences system

### R011 — Quality Sentinel in Dispatch Prompts
- Class: core-capability
- Status: active
- Description: At standard/strict quality levels, task dispatch prompts include mandatory instructions for pre-task codebase scan, Context7 library lookup (new deps at standard, always at strict), post-task diff review, and test step for new exports
- Why it matters: Quality enforcement at the prompt injection level is more reliable than hoping the LLM reads a separate agent file — gsd2 controls what goes into each session
- Source: user
- Primary owning slice: M001/S04
- Supporting slices: none
- Validation: unmapped
- Notes: This is architecturally superior to gsdup's approach because gsd2 programmatically controls dispatch prompts

### R012 — Quality Gate Metrics
- Class: quality-attribute
- Status: active
- Description: Every quality gate execution produces a record in the metrics ledger — gate name, outcome (pass/warn/block/skip), quality level, timestamp. Quality metrics are visible in the dashboard overlay
- Why it matters: Quality gates you can't see are quality gates you can't trust or tune
- Source: user
- Primary owning slice: M001/S04
- Supporting slices: none
- Validation: unmapped
- Notes: Extends existing metrics.ts ledger, not a separate JSONL file

### R013 — Tech Debt Register
- Class: core-capability
- Status: active
- Description: A structured `.gsd/TECH-DEBT.md` register with sequential TD-NNN entries tracking type (bug/design/test-gap/doc-gap), severity, component, description, provenance (which slice/task logged it), and status (open/resolved/deferred)
- Why it matters: Code issues noticed during work should be logged immediately, not forgotten — the agent touches many files and notices patterns a human would miss
- Source: user
- Primary owning slice: M001/S05
- Supporting slices: none
- Validation: unmapped
- Notes: Auto-logging at standard/strict quality levels. Project-level, not milestone-scoped

### R014 — Tech Debt Auto-Logging
- Class: quality-attribute
- Status: active
- Description: At standard quality level, critical/high severity issues auto-log to TECH-DEBT.md during execution. At strict, all severities auto-log. At fast, no auto-logging
- Why it matters: Manual-only tech debt tracking means debt goes unlogged — auto-logging ensures the register reflects reality
- Source: user
- Primary owning slice: M001/S05
- Supporting slices: M001/S04
- Validation: unmapped
- Notes: Auto-logging instructions injected into dispatch prompts at standard/strict levels

### R015 — Passive Monitoring
- Class: quality-attribute
- Status: active
- Description: After each slice completes, auto mode runs plan-vs-summary diffs (detecting scope expansion/contraction/shift) and state transition detection, feeding results into the observation system
- Why it matters: Structural drift between plans and outcomes is a leading indicator of planning quality issues
- Source: inferred
- Primary owning slice: M001/S05
- Supporting slices: M001/S01
- Validation: unmapped
- Notes: Runs as a post-completion step in auto mode, not a background process

## Deferred

### R016 — Gate-to-Correction Attribution
- Class: quality-attribute
- Status: deferred
- Description: Heuristic analysis mapping corrections to originating quality gates with confidence scores
- Why it matters: Helps tune which gates are most effective at preventing which categories of mistakes
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred because it requires significant correction and gate data to be meaningful. Implemented in gsdup v7.0 but needs data to be useful

### R017 — Browser-Based Multi-Project Dashboard
- Class: differentiator
- Status: deferred
- Description: A localhost web dashboard aggregating state from all registered GSD projects with real-time updates
- Why it matters: Power users running multiple projects benefit from a unified view
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred because gsd2 already has a TUI dashboard. A browser dashboard is a different product surface — valuable but large scope

## Out of Scope

### R018 — Concurrent Milestones
- Class: constraint
- Status: out-of-scope
- Description: Multiple milestones running in parallel with isolated workspaces
- Why it matters: Prevents scope confusion — gsd2's sequential model with `/gsd queue` handles this differently
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: GSD2's programmatic session management eliminates the need for concurrent workspace isolation. Sequential milestones with queue is the chosen approach

### R019 — Tmux Integration
- Class: constraint
- Status: out-of-scope
- Description: Tmux session monitoring, embedded terminals, session detection
- Why it matters: GSD2 manages sessions programmatically via Pi SDK, not through tmux
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: tmux was necessary in gsdup because it was a prompt framework. gsd2 has native session control

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | core-capability | active | M001/S01 | none | partial (S01) |
| R002 | core-capability | active | M001/S01 | none | validated (S01) |
| R003 | continuity | active | M001/S01 | none | validated (S01) |
| R004 | core-capability | active | M001/S02 | none | validated (S02) |
| R005 | core-capability | active | M001/S02 | none | validated (S02) |
| R006 | core-capability | active | M001/S02 | M001/S03 | partial (S02) |
| R007 | core-capability | active | M001/S03 | none | validated (S03) |
| R008 | core-capability | active | M001/S03 | none | validated (S03) |
| R009 | differentiator | active | M001/S03 | none | validated (S03) |
| R010 | core-capability | active | M001/S04 | none | unmapped |
| R011 | core-capability | active | M001/S04 | none | unmapped |
| R012 | quality-attribute | active | M001/S04 | none | unmapped |
| R013 | core-capability | active | M001/S05 | none | unmapped |
| R014 | quality-attribute | active | M001/S05 | M001/S04 | unmapped |
| R015 | quality-attribute | active | M001/S05 | M001/S01 | unmapped |
| R016 | quality-attribute | deferred | none | none | unmapped |
| R017 | differentiator | deferred | none | none | unmapped |
| R018 | constraint | out-of-scope | none | none | n/a |
| R019 | constraint | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 15
- Mapped to slices: 15
- Validated: 7 (R002, R003, R004, R005, R007, R008, R009)
- Partially validated: 2 (R001 — contract proven, runtime pending; R006 — 4/6 guardrails proven, user confirmation and permission checks pending)
- Unmapped active requirements: 0
