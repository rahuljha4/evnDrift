# AI log

Every time AI-generated work was wrong, weak or misleading, and a human or a check caught it, add a row here. Use the `/log-ai-failure` command. The **Context change** column is the point of the log: it records what was changed in `CLAUDE.md`, a command, the catalogue, a test or a doc so that the same mistake cannot happen again. If no context change was made, say why.

Target for submission ([PRD §4](prd.md#4-goals-non-goals-success-criteria)): **≥ 8 real entries**. Do not invent or embellish entries. Judges read this file.

| # | Date | Task | What the AI did | How it was caught | Impact if missed | Context change (file + summary) |
|---|---|---|---|---|---|---|

<!-- Example shape (delete when the first real row lands):
| 1 | 2026-10-10 | M0.2 | Treated `process.env.X = 'v'` as a reference | P/N catalogue test N02 failed | ED003 false negatives | patterns-catalogue.md N02 clarified; CLAUDE.md: "writes are not references" |
-->

## Categories (for the M7.3 summary)

- **Spec drift**: implemented something not in the PRD or catalogue.
- **Weak test**: the test passes but asserts too little. Usually exposed by Stryker (M6.1).
- **Value leak risk**: code path where a config value could reach output.
- **Purity breach**: I/O or `process.env` in `packages/core`.
- **Non-determinism**: unstable ordering, timestamps or Map iteration in output.
- **Tooling/config**: wrong flag, version or path.
