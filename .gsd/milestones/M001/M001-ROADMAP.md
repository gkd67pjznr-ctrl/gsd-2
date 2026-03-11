# M001: Adaptive Intelligence

**Vision:** Bring gsd2's autonomous execution engine from "builds correctly" to "builds correctly and learns from mistakes." Integrate the observation loop, learning pipeline, quality gating, and tech debt tracking proven in the gsdup fork, reimplemented as native TypeScript modules that leverage gsd2's programmatic architecture.

## Success Criteria

- Corrections are captured automatically when the agent makes mistakes (retries, reverts, user corrections)
- Repeated correction patterns are promoted to preferences and surfaced in future dispatch prompts
- Quality level (fast/standard/strict) produces measurably different dispatch prompts and gate metrics
- Tech debt is auto-logged during execution and visible in a structured register
- A full auto-mode run produces correction data, preferences, quality gate records, and tech debt entries

## Key Risks / Unknowns

- **Correction detection without Claude Code hooks** — gsdup uses PostToolUse hooks. gsd2 must detect corrections via session analysis, activity logs, and retry signals. Risk: lower signal quality than hook-based detection
- **Prompt injection budget** — corrections + quality instructions + existing context must fit within ~3K additional tokens. Risk: noisy corrections bloat prompts
- **Self-report reliability** — instructions telling the LLM to self-report corrections may be ignored under context pressure. Risk: under-reporting

## Proof Strategy

- Correction detection without hooks → retire in S01 by proving corrections are captured from activity logs and retry events in a real auto-mode run
- Prompt injection budget → retire in S03 by proving filtered recall stays under 3K tokens with real correction data
- Self-report reliability → retire in S01 by testing self-report instructions in dispatch prompts against known error scenarios

## Verification Classes

- Contract verification: TypeScript compilation, unit tests for all modules, JSONL format validation
- Integration verification: auto mode end-to-end with correction capture → preference promotion → recall injection cycle
- Operational verification: full milestone auto-mode run producing quality gate metrics and tech debt entries
- UAT / human verification: user reviews correction accuracy and preference relevance

## Milestone Definition of Done

This milestone is complete only when all are true:

- All 5 slices complete with verified must-haves
- Corrections captured from real auto-mode runs, not just test fixtures
- Preferences promoted from correction patterns and injected into dispatch prompts
- Quality level config integrated into existing preferences system
- Quality gate metrics visible in dashboard overlay
- Tech debt register populated during execution
- Cross-project preference promotion functional via `~/.gsd/`
- Final integration slice proves the assembled system works end-to-end

## Requirement Coverage

- Covers: R001, R002, R003, R004, R005, R006, R007, R008, R009, R010, R011, R012, R013, R014, R015
- Partially covers: none
- Leaves for later: R016 (gate-to-correction attribution), R017 (browser dashboard)
- Orphan risks: none

## Slices

- [x] **S01: Correction Capture Foundation** `risk:high` `depends:[]`
  > After this: auto-mode runs produce structured correction entries in `.gsd/patterns/corrections.jsonl` with diagnosis categories, from both programmatic detection (retries, stuck, reverts) and self-report instructions.

- [x] **S02: Preference Engine** `risk:medium` `depends:[S01]`
  > After this: repeated corrections auto-promote to preferences with confidence scores, the observer engine aggregates patterns with bounded guardrails, and suggestions appear for skill refinement.

- [x] **S03: Learning Loop Closure** `risk:medium` `depends:[S02]`
  > After this: dispatch prompts include relevant past corrections filtered by context, skill refinement retires source corrections, and preferences appearing in 3+ projects promote to user-level.

- [ ] **S04: Quality Gating** `risk:low` `depends:[]`
  > After this: setting quality level to `standard` or `strict` via `/gsd prefs` injects codebase scan, Context7 lookup, and test mandates into dispatch prompts, with gate outcomes recorded in the metrics ledger and visible in the dashboard.

- [ ] **S05: Tech Debt & Passive Monitoring** `risk:low` `depends:[S01, S04]`
  > After this: code issues discovered during execution are auto-logged to `.gsd/TECH-DEBT.md` with severity and provenance, and plan-vs-summary drift analysis runs after each slice completion, feeding results into the observation system.

## Boundary Map

### S01 → S02

Produces:
- `corrections.ts` — `writeCorrection(entry)`, `readCorrections(filters)`, `rotateCorrections(threshold)` functions
- `correction-types.ts` — `CorrectionEntry` interface with 14-category taxonomy, scope enum, JSONL schema
- `correction-detector.ts` — `detectCorrections(session: DetectionSession)` for programmatic detection from activity logs/retries
- Self-report prompt instructions embedded in dispatch templates

Consumes:
- nothing (first slice)

### S01 → S05

Produces:
- `correction-types.ts` — `CorrectionEntry` interface reused for passive monitoring observations
- `.gsd/patterns/` directory with `.gitignore` entry

Consumes:
- nothing (first slice)

### S02 → S03

Produces:
- `preferences.ts` (patterns module, not the existing config preferences) — `writePreference(entry)`, `readPreferences(filters)`, `checkAndPromote(correction)`
- `observer.ts` — `analyzePatterns(corrections, preferences)` with guardrail enforcement, `suggestions.json` output
- `PreferenceEntry` interface with confidence score, scope, upsert semantics

Consumes from S01:
- `corrections.ts` → `readCorrections()`
- `correction-types.ts` → `CorrectionEntry`, taxonomy constants

### S03 → (terminal)

Produces:
- Dispatch prompt templates with `{{corrections}}` variable for recall injection
- `recall.ts` — `buildRecallBlock(corrections, preferences, context)` filtered to ~3K tokens
- `retire.ts` — `retireByCategory(category, suggestionId)` marking corrections/preferences as retired
- `promote-preference.ts` — `promoteToUserLevel(preference)` writing to `~/.gsd/preferences.json`

Consumes from S02:
- `preferences.ts` (patterns) → `readPreferences()`
- `observer.ts` → `analyzePatterns()` (for suggestion-driven refinement)

Consumes from S01:
- `corrections.ts` → `readCorrections()`

### S04 → S05

Produces:
- `quality_level` field in preferences.md schema (fast/standard/strict)
- `quality-gating.ts` — `buildQualityInstructions(level)` returning prompt injection text
- Quality gate event type in metrics ledger (`gate-execution` entries)
- `resolveQualityLevel()` reading from preferences

Consumes:
- nothing (independent of S01-S03)

### S05 → (terminal)

Produces:
- `.gsd/TECH-DEBT.md` register with TD-NNN entries
- `tech-debt.ts` — `logDebt(entry)`, `listDebt(filters)`, `resolveDebt(id)`
- `passive-monitor.ts` — `diffPlanVsSummary(plan, summary)`, `detectScopeChange()` feeding into correction system
- Auto-logging instructions in dispatch prompts at standard/strict levels

Consumes from S01:
- `correction-types.ts` — observation type definitions
- `corrections.ts` — `writeCorrection()` for monitoring observations

Consumes from S04:
- `quality-gating.ts` — `resolveQualityLevel()` to gate auto-logging severity
