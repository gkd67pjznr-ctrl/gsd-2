---
id: T02
parent: S02
milestone: M001
provides:
  - checkAndPromote() — promotion logic with threshold, confidence, validation
  - writePreference() — atomic upsert to preferences.jsonl via tmp+rename
  - readPreferences() — filtered reads by scope and status
  - countMatchingCorrections() — internal helper using readCorrections()
  - PreferenceReadFilters, PreferenceOptions, PromoteInput types
key_files:
  - src/resources/extensions/gsd/pattern-preferences.ts
key_decisions:
  - checkAndPromote takes {category, scope} (not full CorrectionEntry) for cleaner API
  - countMatchingCorrections uses readCorrections() from corrections.ts rather than raw file reads
  - writePreference preserves created_at, retired_at, retired_by from existing on upsert
  - capture_disabled reason typed via cast since PromoteResult.reason union doesn't include it
patterns_established:
  - Atomic upsert pattern: read all lines → map with merge → write tmp → rename
  - Confidence formula: count/(count+2) — monotonically increasing, bounded (0,1)
  - Kill switch check pattern reused from corrections.ts (D016)
observability_surfaces:
  - PromoteResult.reason codes: invalid_entry, below_threshold, error, capture_disabled
  - WritePreferenceResult.reason: error
  - readPreferences returns [] on any failure (safe default)
  - .gsd/patterns/preferences.jsonl as human-readable inspection surface
duration: 12m
verification_result: passed
completed_at: 2026-03-11
blocker_discovered: false
---

# T02: Build preference promotion module (pattern-preferences.ts)

**Implemented the preference I/O layer and promotion logic with 3 public functions: checkAndPromote, writePreference, readPreferences — all non-throwing, all with test isolation support.**

## What Happened

Created `pattern-preferences.ts` with the three public functions specified in the plan. The module implements:

- **`checkAndPromote(entry, options)`** — validates category (against VALID_CATEGORIES) and scope, checks kill switch via preferences.md frontmatter, counts matching corrections using `readCorrections()` from corrections.ts, promotes at ≥3 with confidence = count/(count+2), and upserts via writePreference. Returns structured PromoteResult with reason codes for all failure paths.

- **`writePreference(preference, options)`** — atomic upsert using tmp+rename. Reads existing preferences.jsonl, matches by category+scope, merges while preserving created_at/retired_at/retired_by from existing entry, writes to .tmp, renames to final path. Creates .gsd/patterns/ directory if needed.

- **`readPreferences(filters, options)`** — reads preferences.jsonl, parses each line, applies optional scope and status filters. Returns [] on missing file or any error.

Internal `countMatchingCorrections()` delegates to `readCorrections()` rather than doing raw file reads, reusing the existing archive-aware read logic from corrections.ts.

## Verification

- `node --experimental-strip-types src/resources/extensions/gsd/tests/preference-engine.test.ts` — **53 passed, 0 failed**
- observer.test.ts — ERR_MODULE_NOT_FOUND (expected, T03 scope)
- auto.ts integration wiring — not present (expected, T04 scope)

## Diagnostics

- Read `.gsd/patterns/preferences.jsonl` for raw preference state
- Call `readPreferences({ status: 'active' })` programmatically for active preferences
- Check `PromoteResult.reason` for promotion failure diagnostics: `invalid_entry` (bad input), `below_threshold` + count (not enough corrections), `capture_disabled` (kill switch), `error` (I/O failure)
- Check `WritePreferenceResult.reason` for write failure diagnostics

## Deviations

None. Implementation matched the plan exactly.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/pattern-preferences.ts` — new preference promotion module with 3 public functions and 2 internal helpers
