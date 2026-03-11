---
id: T03
parent: S02
milestone: M001
provides:
  - analyzePatterns() — observer engine with cross-scope grouping, guardrails, and suggestion generation
  - CATEGORY_SKILL_MAP mapping 14 categories to gsd2 skills (3 mapped, 11 null)
  - autoDismissExpired() — auto-expires pending suggestions older than 30 days
  - checkGuardrails() — cooldown enforcement for target skill suggestions
  - determineSuggestionType() — skill existence check via homedir path
key_files:
  - src/resources/extensions/gsd/observer.ts
key_decisions:
  - Skill existence check uses homedir() path (~/.gsd/agent/skills/<name>/SKILL.md) instead of dynamic import of getAgentDir() — avoids ESM/CJS compatibility issues with @mariozechner/pi-coding-agent require() while matching the same real path
  - Cooldown guardrail matches by target_skill when skill exists, falls back to matching by category when target_skill is null — prevents cooldown from blocking unrelated categories that happen to map to the same null skill
  - Suggestion ID format: sug-<epoch_seconds>-<zero_padded_counter> — deterministic, sortable, guaranteed unique within existing IDs set
patterns_established:
  - Cross-scope grouping: corrections grouped by category only (not scope) using Map<string, CorrectionGroup> with Set<string> for scopes
  - Suggestions dedup: three layers — watermark (temporal), active-preference dedup (category:scope), no-duplicate-pending (category)
  - Guardrail recording: blocked suggestions recorded in metadata.skipped_suggestions with reason and cooldown_expires timestamp
observability_surfaces:
  - suggestions.json metadata.last_analyzed_at — watermark timestamp for dedup
  - suggestions.json metadata.skipped_suggestions — guardrail-blocked suggestions with reason and timing
  - suggestions.json suggestions array — full suggestion lifecycle state (pending/accepted/dismissed/refined)
  - AnalyzeResult.suggestions_written — count of new suggestions per run
  - AnalyzeResult.reason — 'error' on failure
duration: 15m
verification_result: passed
blocker_discovered: false
---

# T03: Build observer engine (observer.ts)

**Implemented the pattern analysis engine with cross-scope grouping, three-layer dedup, bounded guardrails, and atomic suggestion writes — 40 test assertions pass.**

## What Happened

Created `observer.ts` with `analyzePatterns()` as the main export. The function:

1. Loads or creates `suggestions.json` with metadata tracking
2. Auto-dismisses expired pending suggestions (>30 days → status:dismissed, dismiss_reason:auto_expired)
3. Reads all active corrections and active preferences
4. Filters corrections through three dedup layers: active-preference dedup (category:scope pairs), watermark dedup (temporal), and no-duplicate-pending check
5. Groups filtered corrections by category cross-scope (same category, different scopes merge)
6. For groups at/above threshold (3), enforces cooldown guardrail, maps to target skill via CATEGORY_SKILL_MAP, checks skill existence, and generates suggestions
7. Updates watermark and writes suggestions.json atomically (tmp+rename)

The CATEGORY_SKILL_MAP maps `code.style_mismatch` → `frontend-design`, `process.implementation_bug` → `debug-like-expert`, `process.regression` → `debug-like-expert`, and all other categories → null (producing `new_skill_needed` type suggestions).

## Verification

- `node --experimental-strip-types src/resources/extensions/gsd/tests/observer.test.ts` — **40 passed, 0 failed** (exceeds ≥25 requirement)
- `node --experimental-strip-types src/resources/extensions/gsd/tests/preference-engine.test.ts` — **53 passed, 0 failed** (no regressions)
- Slice-level verification partial results:
  - ✅ observer.test.ts: 40 assertions pass
  - ✅ preference-engine.test.ts: 53 assertions pass
  - ❌ `grep -q "checkAndPromote" auto.ts` — expected to fail until T04
  - ❌ `grep -q "analyzePatterns" auto.ts` — expected to fail until T04

## Diagnostics

- Read `.gsd/patterns/suggestions.json` for full suggestion state including all pending/accepted/dismissed entries
- Check `metadata.last_analyzed_at` for when analysis last ran (watermark)
- Check `metadata.skipped_suggestions` for guardrail-blocked suggestions with reason ('cooldown_active') and cooldown_expires
- Check individual suggestion `status`, `dismiss_reason`, `dismissed_at` for lifecycle tracking
- `analyzePatterns()` returns `{ analyzed: false, reason: 'error' }` on any unhandled failure

## Deviations

- Used `homedir()` from `node:os` for skill path resolution instead of `getAgentDir()` from `@mariozechner/pi-coding-agent` — `require()` fails due to ESM-only package exports, and a static import would make the module untestable in isolation. The homedir path resolves to the same `~/.gsd/agent/skills/` directory.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/observer.ts` — Complete observer engine module with analyzePatterns(), CATEGORY_SKILL_MAP, guardrail helpers, and atomic suggestion writes
