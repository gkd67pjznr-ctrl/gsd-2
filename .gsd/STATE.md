# GSD State

**Active Milestone:** M001 — Adaptive Intelligence
**Active Slice:** S01 — Correction Capture Foundation (complete)
**Phase:** complete

## Recent Decisions
- D013: Correction I/O never throws — returns structured WriteResult
- D014: Programmatic detection prefers false negatives over false positives
- D015: Self-report via `{{corrections}}` template variable, replaced by dynamic recall in S03
- D016: Kill switch reads preferences.md directly (cwd-relative) instead of loadEffectiveGSDPreferences() due to cached path
- D017: Pi session entry transformation via transformSessionEntries() in auto.ts
- D018: auto.ts correction guards use loadEffectiveGSDPreferences() (not direct file read)

## Completed
- S01: Correction Capture Foundation — 4 tasks, 133 test assertions, all verification passing
  - correction-types.ts: 14-category taxonomy with type guards
  - corrections.ts: JSONL I/O (write/read/rotate) with non-throwing error handling
  - correction-detector.ts: Programmatic detection (retry, stuck, timeout, revert)
  - auto.ts: Self-report instructions in dispatch, programmatic detection at post-completion and stuck detection
  - preferences.ts: correction_capture kill switch
  - gitignore.ts: .gsd/patterns/ baseline pattern

## Blockers
- None

## Next Action
S02: Preference Engine (depends on S01)
