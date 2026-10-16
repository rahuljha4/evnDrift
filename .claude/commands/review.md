---
description: Independent read-only review of the staged diff (or a task ID, range or files) by the envdrift-reviewer agent. Reports findings; never edits source.
argument-hint: [task ID | commit range | file paths]
---

Review: $ARGUMENTS

1. **Staged review (no argument).**
   - Run `node scripts/commit-checks/review-bundle.mjs cached`. On a hit (exit 0) show its output and stop: the same staged tree was already reviewed. Do not re-run the reviewer.
   - On a miss, run `node scripts/commit-checks/review-bundle.mjs bundle` and start the **envdrift-reviewer** agent with that bundle as its input and the instruction `review the staged diff`.
2. **Task ID, commit range or files.** Start **envdrift-reviewer** with the argument as the scope. For a range, give it the output of `node scripts/commit-checks/review-bundle.mjs bundle --base <ref>`. These reviews are not cached.
3. Relay the agent's summary as returned (verdict, counts per tier, report path, diff hash, top findings). You may not reword, merge or downgrade a finding. Only the user can overrule one, explicitly.
4. If there are BLOCKER or HIGH findings, say the commit is blocked until they are fixed or the user decides otherwise.
