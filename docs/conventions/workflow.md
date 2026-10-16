# Workflow per task and open placeholders

Moved out of `CLAUDE.md` to keep it short. Requirements: [PRD §17](../prd.md#17-ai-assisted-development-plan-35-of-the-score). Where each kind of truth lives: [docs/README.md](../README.md).

## Workflow per task (PRD §17)

1. **Plan mode first.** Restate the task ID (e.g. `M1.2`), the PRD section it implements and the files you'll touch.
2. **Tests first**, then the implementation.
3. `npm test && npm run typecheck && npm run lint` must be green. Skills, agents and hooks use the quiet wrappers (`scripts/quiet/`) instead.
4. Run `/review` on the diff. Fix the findings, or log them.
5. Rahul reads the diff. Commit only through the `envdrift-commit` skill (`/commit`), and only after Rahul's explicit confirmation. Never push. Message format: `feat(M2.3): …`, see [commits.md](commits.md).
6. If an AI mistake is caught, run `/log-ai-failure`. If it reveals a missing rule, update `CLAUDE.md` **in the same commit**.

Also update the doc that owns the behaviour when you change it. Docs and code drift is a bug.

## Looking things up without reading whole files

```bash
node scripts/doc-lookup.mjs prd 11       # a PRD section (also: prd D5, prd M2.3)
node scripts/doc-lookup.mjs rule ED009   # one rule's entry in docs/rules.md
node scripts/doc-lookup.mjs pattern P07  # one row of the patterns catalogue
```

## Placeholders (replace when known)

- `@rahulkumar`: npm scope (D11). Confirm in M2.5.
- `<gh-user>`: GitHub owner, used in the Action `uses:`, repo URLs and SARIF `helpUri`.
