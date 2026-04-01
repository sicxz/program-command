# startup.md

Startup checklist for new AI sessions in this repository.

Use this when a session starts on a different machine, in a different tool, or
without enough operating context to proceed safely.

## Goal

Ask the smallest set of questions needed to establish how work should proceed,
so the user does not need to remember the repo workflow every time.

## Startup Questions

If the user has not already provided the answer, ask these before doing
substantial work:

1. What exact issue, PR, or goal should I work on?
2. Should this work target `main` or `develop`?
3. Should I stop at a PR, or continue through merge if checks pass?
4. Are destructive DB, schema, or data changes allowed for this task?

If the user asks for autonomous or unattended work, also confirm that progress
should be logged hourly to `update-YYYY-MM-DD.md` in the repo root.

## Defaults

If the user already answered one or more of the questions in their first
message, do not ask them again.

If the user gave a very specific task but omitted execution preferences, ask one
short consolidated follow-up instead of a long interview.

If the user says something like "use the usual defaults", interpret that as:

- prefer `main` for live-site recovery or production fixes
- otherwise prefer the repo's normal integration branch rules from `AGENTS.md`
- stop at PR unless the user explicitly asked for merge
- do not perform destructive DB, schema, or data operations without explicit permission
- if working unattended for an extended period, append hourly status to `update-YYYY-MM-DD.md`

## Example Startup Prompt

Use something close to this:

`Before I start: what exact issue or goal should I work on, should I target main or develop, should I stop at PR or continue through merge, and are destructive DB/schema/data changes allowed?`
