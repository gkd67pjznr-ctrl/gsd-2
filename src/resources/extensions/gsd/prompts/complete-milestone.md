You are executing GSD auto-mode.

## UNIT: Complete Milestone {{milestoneId}} ("{{milestoneTitle}}")

All relevant context has been preloaded below — the roadmap, all slice summaries, requirements, decisions, and project context are inlined. Start working immediately without re-reading these files.

{{inlinedContext}}

Then:
1. Read the milestone-summary template at `~/.gsd/agent/extensions/gsd/templates/milestone-summary.md`
2. If a `GSD Skill Preferences` block is present in system context, use it to decide which skills to load and follow during completion, without relaxing required verification or artifact rules
3. Verify each **success criterion** from the milestone definition in `{{roadmapPath}}`. For each criterion, confirm it was met with specific evidence from slice summaries, test results, or observable behavior. List any criterion that was NOT met.
4. Verify the milestone's **definition of done** — all slices are `[x]`, all slice summaries exist, and any cross-slice integration points work correctly.
5. **Resolve follow-ups.** Collect every item from "Follow-ups" and "Known Limitations" sections across all slice summaries. For each one:
   - If it's a small fix (< ~20 lines, no new module), **fix it now** and note it as resolved.
   - If it's addressed by a later slice within this milestone, **mark it as resolved** with a reference.
   - If it genuinely belongs to a future milestone, **defer it explicitly** with a one-line reason.
   - Do NOT silently repeat a follow-up as a "known limitation" in the milestone summary without resolving or deferring it. Every follow-up must have a disposition.
6. Validate **requirement status transitions**. For each requirement that changed status during this milestone, confirm the transition is supported by evidence. Requirements can move between Active, Validated, Deferred, Blocked, or Out of Scope — but only with proof.
7. Write `{{milestoneSummaryAbsPath}}` using the milestone-summary template. Fill all frontmatter fields and narrative sections. The `requirement_outcomes` field must list every requirement that changed status with `from_status`, `to_status`, and `proof`. The `follow_up_resolutions` section must list every follow-up with its disposition.
8. Update `.gsd/REQUIREMENTS.md` if any requirement status transitions were validated in step 6.
9. Update `.gsd/PROJECT.md` to reflect milestone completion and current project state.
10. Commit all changes: `git add -A && git commit -m 'feat(gsd): complete {{milestoneId}}'`
11. Update `.gsd/STATE.md`

**Important:** Do NOT skip the success criteria and definition of done verification (steps 3-4). The milestone summary must reflect actual verified outcomes, not assumed success. If any criterion was not met, document it clearly in the summary and do not mark the milestone as passing verification.

**Important:** Do NOT skip follow-up resolution (step 5). The milestone completion agent is the last line of defense before work is marked done. Small gaps that can be fixed in this context window MUST be fixed, not documented as debt. Every slice follow-up must have an explicit disposition: resolved, addressed by later slice, or deferred with reason.

**You MUST write `{{milestoneSummaryAbsPath}}` AND update PROJECT.md before finishing.**

When done, say: "Milestone {{milestoneId}} complete."
