You are executing a GSD quick task. Complete this task in a single session.

## Task

{{description}}

## Quality

{{quality}}

## Instructions

1. **Research** — Understand the problem. Read relevant files, check current state.
2. **Plan** — Decide on the approach. Keep it focused and minimal.
3. **Execute** — Make the changes. Build the real thing, not stubs.
4. **Verify** — Run tests, check the build, confirm the fix works.
5. **Summarize** — Write a summary of what you did to `{{outputDir}}/summary.md`.

## Summary Format

Write `{{outputDir}}/summary.md` with:
- What was done (1-2 sentences)
- Files changed
- How it was verified

## Self-Report Corrections

If you catch yourself making a mistake and correcting it during this session, that's valuable signal. The system will automatically detect corrections from your tool usage patterns — no special action needed from you.

## Rules

- Fix the root cause, not symptoms.
- Verify your work before finishing.
- Do not ask the user questions — execute autonomously.
- Keep changes minimal and focused on the task.
