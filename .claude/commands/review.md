---
description: Review the current diff, a commit range, files or a task ID (e.g. M2.3) with the envdrift-code-review skill. Reports findings; does not edit source.
argument-hint: [task ID | commit range | file paths]
---

Use the **envdrift-code-review** skill to review: $ARGUMENTS

If no argument is given, review the uncommitted diff (`git diff HEAD` plus untracked files). The skill runs its pre-flight script, applies the checklists in `.claude/skills/envdrift-code-review/references/`, and writes the report to `docs/reviews/`. It never edits source, tests or docs.
