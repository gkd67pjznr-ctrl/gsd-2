# Project

## What This Is

GSD 2 (Get Shit Done) is a standalone TypeScript CLI built on the Pi SDK that structures AI-assisted coding into milestones → slices → tasks, with programmatic session management, auto mode, crash recovery, cost tracking, and clean git strategy. It's a complete rewrite of the original GSD prompt framework.

Currently, gsd2 manages the planning/execution lifecycle well and has implemented four of five adaptive intelligence capabilities from the gsdup fork: correction capture, preference engine, learning loop closure, and quality gating. The remaining capability — tech debt tracking for noting code issues discovered during work — is next.

## Core Value

The auto-mode state machine that drives fresh-context-per-task execution through an entire milestone without human intervention, producing clean git history and verified outcomes.

## Current State

- Auto mode fully functional with fresh session per task
- State derivation from disk files (roadmap, plan, summaries)
- Crash recovery via lock files and session forensics
- Stuck detection with retry and diagnostics
- Timeout supervision (soft/idle/hard)
- Cost tracking per-unit with dashboard overlay
- Git branch-per-slice with automatic squash merge
- Skill discovery during research phases
- Preferences system (models, skills, custom instructions)
- Migration tool for v1 `.planning/` directories
- 20+ LLM provider support via Pi SDK
- **Correction capture foundation** (M001/S01): 14-category diagnosis taxonomy, JSONL persistence with rotation, programmatic detection from session traces, self-report instructions in dispatch prompts, kill switch via preferences
- **Preference engine** (M001/S02): Automatic promotion of repeated corrections to preferences with confidence scoring, observer engine with cross-scope pattern analysis and bounded guardrails, suggestion generation for skill refinement, wired into auto-mode execution loop
- **Learning loop closure** (M001/S03): Dynamic recall injection of past corrections and preferences into dispatch prompts (token-budgeted, deduplicated, 10-slot max), correction/preference retirement via retireByCategory(), cross-project preference promotion to `~/.gsd/preferences.json` at 3+ project threshold
- **Quality gating** (M001/S04): Configurable quality level (fast/standard/strict) on GSDPreferences, prompt injection of codebase scan/Context7/test/diff instructions via `{{quality}}` template variable, gate event recording with 5 gates × 4 outcomes persisted on UnitMetrics, dashboard overlay quality summary section

## Architecture / Key Patterns

- **Runtime**: TypeScript application embedding Pi SDK, compiled and shipped as `gsd-pi` npm package
- **Extension system**: TypeScript modules under `src/resources/extensions/gsd/`
- **State machine**: `auto.ts` reads disk state, derives next unit, dispatches fresh session
- **Prompt injection**: `prompt-loader.ts` loads `.md` templates, substitutes `{{variables}}`
- **Metrics**: `metrics.ts` accumulates per-unit token/cost data to `.gsd/metrics.json`
- **State derivation**: `state.ts` reads roadmap/plan files, returns typed `GSDState`
- **Preferences**: `preferences.ts` loads YAML frontmatter from global/project `.gsd/preferences.md`
- **Skill discovery**: `skill-discovery.ts` snapshots skills at auto-start, detects new installations
- **File parsers**: `files.ts` parses roadmaps, plans, summaries, requirements
- **Session forensics**: `crash-recovery.ts` + `session-forensics.ts` for crash resume
- **Dashboard**: TUI overlay via `dashboard-overlay.ts` with `Ctrl+Alt+G` toggle

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [ ] M001: Adaptive Intelligence — Observation loop, learning pipeline, quality gating, and tech debt tracking integrated into gsd2's programmatic architecture
