---
estimated_steps: 4
estimated_files: 2
---

# T02: Implement recall.ts — build recall block with token-budgeted slot allocation

**Slice:** S03 — Learning Loop Closure
**Milestone:** M001

## Description

Create `recall.ts` with `buildRecallBlock()` — the function that replaces static self-report text with dynamic, context-filtered recall of past corrections and preferences. This is the core of R007 (Live Recall Injection) and retires M001's prompt injection budget risk by proving filtered recall stays under ~3K tokens.

The function is synchronous (required by `loadPrompt()` vars object in auto.ts) and non-throwing (established pattern). It reads active preferences and corrections, deduplicates, applies slot allocation (preferences first, 10 max), enforces ~3K token budget with word-based estimation, and appends self-report instructions at the end.

## Steps

1. Create `src/resources/extensions/gsd/recall.ts` with the following exports:
   - `buildRecallBlock(options?: { cwd?: string }): string` — main public function
   - `estimateTokens(text: string): number` — exported for test verification (word count / 0.75)
2. Implement `buildRecallBlock`:
   - Check kill switch: read preferences.md for `correction_capture === false`, return "" if disabled
   - Read active preferences via `readPreferences({ status: 'active' }, { cwd })`
   - Read active corrections via `readCorrections({ status: 'active' }, { cwd })`
   - Build dedup set: `Set<string>` of `category:scope` from preferences
   - Filter corrections: exclude those whose `diagnosis_category:scope` is in the dedup set
   - Slot allocation: take up to 10 entries — preferences first, corrections fill remaining
   - Token budget assembly: header text, preference lines, correction header, correction lines, each checked against 3000 token budget with 20-token footer reserve
   - Append self-report instructions block (the existing `SELF_REPORT_INSTRUCTIONS` text) after the recall content
   - Wrap dynamic recall in `<system-reminder>` tags
   - Return the complete block, or just self-report instructions if no recall data exists
3. Handle all edge cases: empty preferences, empty corrections, both empty, all entries exceed budget, malformed entries
4. Run recall test suite to verify all assertions pass

## Must-Haves

- [ ] `buildRecallBlock()` is synchronous and non-throwing
- [ ] Slot allocation: preferences first, corrections fill remaining, max 10 total entries
- [ ] Token budget: output stays under 3000 tokens using `Math.ceil(text.split(/\s+/).filter(Boolean).length / 0.75)` estimation
- [ ] Deduplication: corrections already promoted to preferences (matching category:scope) excluded
- [ ] Self-report instructions appended after recall data in every non-empty output
- [ ] Kill switch: returns "" when `correction_capture` is false in preferences.md
- [ ] Empty state: returns self-report instructions only (no `<system-reminder>` block) when no recall data exists

## Verification

- `npx tsx src/resources/extensions/gsd/tests/recall.test.ts` — all recall assertions pass
- Token budget proof: test with 20 synthetic entries shows output under 3000 tokens

## Observability Impact

- Signals added/changed: `buildRecallBlock()` return value is the observable output — the assembled text is what gets injected into dispatch prompts via `{{corrections}}`
- How a future agent inspects this: call `buildRecallBlock({ cwd })` directly or inspect the `{{corrections}}` variable value in dispatch logs
- Failure state exposed: returns "" on any error (silent failure, matching existing `buildCorrectionsVar()` contract); no partial outputs

## Inputs

- `src/resources/extensions/gsd/corrections.ts` — `readCorrections({ status: 'active' }, { cwd })` API
- `src/resources/extensions/gsd/pattern-preferences.ts` — `readPreferences({ status: 'active' }, { cwd })` API
- `src/resources/extensions/gsd/auto.ts` lines 1113-1136 — `SELF_REPORT_INSTRUCTIONS` text to embed
- `gsdup/.claude/hooks/gsd-recall-corrections.cjs` — reference implementation for slot allocation and token budget
- T01 test suite as acceptance criteria

## Expected Output

- `src/resources/extensions/gsd/recall.ts` — recall module with `buildRecallBlock()` and `estimateTokens()` exports
- All recall test assertions passing
