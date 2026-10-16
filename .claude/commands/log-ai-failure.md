---
description: Append a row to docs/ai-log.md describing an AI mistake and the context change it caused
argument-hint: <short description of what went wrong>
---

Log this AI failure: **$ARGUMENTS**

1. Read only the end of `docs/ai-log.md` (`tail -n 8`) to find the next row number and the column order.
2. Fill in every column from the description and the current session:
   - **Date**: today (YYYY-MM-DD).
   - **Task**: the milestone task ID in progress (e.g. `M1.5`). Ask if it is unclear.
   - **What the AI did**: factual, one sentence. No blame language.
   - **How it was caught**: the test, `/review`, Stryker, human reading the diff, CI, etc.
   - **Impact if missed**: the user-visible consequence, e.g. a false positive or a value leak.
   - **Context change**: the file(s) changed to prevent a repeat, plus a summary. If the fix requires a `CLAUDE.md`, command, catalogue or test change that is not yet made, propose the exact text and make it in the same change. If no change is warranted, write `none — <why>`.
3. Never include a real config value or secret in the row.
4. Append the row. Do not reorder or edit existing rows. Remove the example comment once the first real row exists.
5. Show the added row and any accompanying context-file diff.
