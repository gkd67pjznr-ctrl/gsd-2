---
id: T02
parent: S03
milestone: M002
provides:
  - embeddingCost and embeddingTokens fields on UnitMetrics
  - Dashboard embedding cost rendering section
  - rotateVectorIndex() function for index lifecycle
key_files:
  - src/resources/extensions/gsd/metrics.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/dashboard-overlay.ts
  - src/resources/extensions/gsd/vector-index.ts
  - src/resources/extensions/gsd/corrections.ts
  - src/resources/extensions/gsd/tests/vector-rotation.test.ts
key_decisions:
  - Full clear approach for vector rotation (not selective by timestamp) — simpler and acceptable for small corpora
  - Vector rotation fires from rotateCorrections as fire-and-forget async call
patterns_established:
  - Fire-and-forget async from sync context with .catch(() => {}) for D013 compliance
observability_surfaces:
  - embeddingCost and embeddingTokens on UnitMetrics in metrics.json
  - Dashboard "Embedding Costs" section (visible only when cost > 0)
duration: 8min
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T02: Add embeddingCost to UnitMetrics, dashboard rendering, and vector rotation

**Wired embedding costs into the metrics ledger and dashboard display, and implemented vector index rotation alongside correction JSONL lifecycle.**

## What Happened

1. Extended `UnitMetrics` with optional `embeddingCost` and `embeddingTokens` fields.
2. In auto.ts, added `flushEmbeddingCosts()` call at unit snapshot boundary, merging cost/tokens into the unit record when cost > 0.
3. Added "Embedding Costs" section to dashboard-overlay.ts after Quality Gates — renders total cost and token count, hidden when no embedding costs exist.
4. Added `rotateVectorIndex(indexPath)` to vector-index.ts — creates a temporary LocalIndex, lists all items, deletes them all (full clear approach). Silent on errors per D013.
5. Hooked `rotateVectorIndex` into `rotateCorrections()` in corrections.ts — fires as async fire-and-forget when JSONL rotation occurs.
6. Created vector-rotation.test.ts with 6 tests covering clear, empty, missing, invalid path, idempotency.

## Verification

- `npx tsx src/resources/extensions/gsd/tests/vector-rotation.test.ts` — 6 passed, 0 failed
- `npx tsc --noEmit` — no type errors
- `npx tsx src/resources/extensions/gsd/tests/embedding-cost.test.ts` — 11 passed, 0 failed

### Slice-level checks
- ✅ embedding-cost.test.ts — all pass
- ✅ vector-rotation.test.ts — all pass
- ✅ tsc --noEmit — clean
- ⏳ semantic-recall.test.ts — not run (unrelated to this task)

## Diagnostics

- Check `metrics.json` for `embeddingCost`/`embeddingTokens` on unit records
- Dashboard shows "Embedding Costs" section only when accumulated cost > 0
- `rotateVectorIndex()` returns `{ cleared: N }` for observability

## Deviations

- Plan suggested selective deletion by timestamp; chose full clear (simpler, acceptable for small corpora as noted in plan)
- `rotateCorrections` is not called from auto.ts; hooked vector rotation into corrections.ts directly

## Known Issues

None.
