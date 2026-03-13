# S02: Semantic Recall in Dispatch — UAT

**Milestone:** M002
**Written:** 2026-03-12

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All behavior is proven by deterministic tests with mock providers and fixture vectors — no live API calls or runtime observation needed. The write→embed→recall pipeline is fully exercised in tests.

## Preconditions

- Node.js 20+ installed
- Project dependencies installed (`npm install`)
- No embedding provider env vars needed (tests use mocks)

## Smoke Test

Run `npx tsx src/resources/extensions/gsd/tests/semantic-recall.test.ts` — should report 24 passed, 0 failed.

## Test Cases

### 1. Vector similarity recall returns relevant corrections

1. Run `npx tsx src/resources/extensions/gsd/tests/semantic-recall.test.ts`
2. Look for "vector path returns similar corrections ranked by score" assertion
3. **Expected:** Corrections semantically similar to task context are returned, ranked by cosine similarity

### 2. Fallback to category-based recall when no provider

1. Run `npx tsx src/resources/extensions/gsd/tests/semantic-recall.test.ts`
2. Look for "fallback to category-based when no provider" assertion
3. **Expected:** Output identical to pre-S02 category-based recall

### 3. Fire-and-forget embedding after writeCorrection

1. Run `npx vitest run src/resources/extensions/gsd/tests/embed-trigger.test.ts`
2. **Expected:** 9/9 pass — embedding fires after write, failures swallowed, kill switch respected

### 4. Full pipeline: write → embed → recall

1. Run `npx tsx src/resources/extensions/gsd/tests/semantic-recall.test.ts`
2. Look for "integration: write→embed→recall pipeline" assertion
3. **Expected:** A correction written and embedded is retrievable by buildRecallBlock via vector similarity

### 5. Existing recall tests unbroken

1. Run `npx tsx src/resources/extensions/gsd/tests/recall.test.ts`
2. **Expected:** 27 passed, 0 failed — identical behavior to pre-S02

## Edge Cases

### Embed failure does not block correction capture

1. Run embed-trigger test with "provider throws" case
2. **Expected:** Error swallowed, no throw propagated, correction still written

### Empty vector index returns no results, falls back to category

1. Run semantic-recall test with "empty index" case
2. **Expected:** Empty vector results trigger category-based fallback

### Kill switch disables both embedding and vector recall

1. Run semantic-recall test with kill switch case and embed-trigger kill switch case
2. **Expected:** No embedding attempt, no vector query — category-based only

## Failure Signals

- Any test assertion failure in the 3 test files
- Type errors from `npx tsc --noEmit`
- Existing recall.test.ts failures (would indicate backward compatibility break)
- `VectorIndex.getStats()` returning 0 after embed pipeline runs

## Requirements Proved By This UAT

- R007 (Live Recall Injection) — semantic recall via vector similarity augments category-based recall; fallback preserves identical behavior; token budget and slot allocation unchanged
- CR-1 (semantic recall) — buildRecallBlock returns corrections ranked by vector similarity
- CR-3 (graceful degradation) — no embedding provider → identical category-based behavior
- CR-4 (async embedding) — fire-and-forget embedding trigger at all write sites, failure isolated

## Not Proven By This UAT

- CR-6 (embedding cost tracking) — deferred to S03
- CR-5 (vector index rotation) — deferred to S03
- Real API provider integration (tests use mocks) — verified manually or in future integration tests
- Runtime behavior in actual auto-mode dispatch (would require live run with configured embedding provider)

## Notes for Tester

- semantic-recall.test.ts and recall.test.ts must be run with `npx tsx`, not `npx vitest run` (tsx runner pattern, not vitest describe/it)
- embed-trigger.test.ts must be run with `npx vitest run` (uses vitest describe/it)
- Pre-existing vitest "No test suite found" failures for tsx-runner test files are expected and not a regression
