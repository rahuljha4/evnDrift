# Module Reference — `packages/action`

> GitHub Action wrapper ([PRD §14](../prd.md#14-github-action), [ADR 0008](adr/0008-distribution-npm-and-action.md)). Private package. It is bundled by tsup into a single ESM file, `dist/index.js`, which is committed on the release tag so the runner needs no `npm install`. Usage: `uses: <gh-user>/envdrift@v0`.
> Built in M4.2. Functional spec: [functional/github-action.md](../functional/github-action.md).

## Files

| File | Responsibility | Milestone |
|---|---|---|
| `action.yml` | Inputs, `runs.using: node24`, `runs.main: dist/index.js` | M0.0 (stub), M4.2 |
| `src/index.ts` | Reads inputs, runs the scan, writes outputs, upserts the comment | M4.2 |
| `dist/index.js` | Bundled output (built, committed only on release tags) | M4.2 / M7.1 |

Note: [ADR 0010](adr/0010-node20-esm-only.md) sets the floor for the CLI at Node ≥ 20. The Action runs on the runner-provided `node24` runtime, because GitHub has deprecated the `node20` Action runtime. Both choices are compatible.

## `action.yml` inputs

| Input | Default | Purpose |
|---|---|---|
| `config` | `envdrift.config.yaml` | Config path |
| `fail-on` | `error` | Same as CLI `--fail-on` |
| `comment` | `true` | Create or update a single PR comment, found by the marker `<!-- envdrift-report -->` |
| `sarif-file` | empty | If set, write SARIF to this path for `github/codeql-action/upload-sarif` |

## `src/index.ts`

```ts
async function main(): Promise<void>;
// 1. read inputs
// 2. runScan({ config, formats: ['markdown', 'json', ...(sarifFile ? ['sarif'] : [])], failOn, ... })   // from packages/cli
// 3. append markdown to $GITHUB_STEP_SUMMARY (always)
// 4. write SARIF if sarif-file set
// 5. if comment && pull_request event: upsert comment via GitHub REST API using GITHUB_TOKEN
// 6. exit code: 1 → setFailed("N findings at or above <fail-on>"); 2 → setFailed(tool error message)
```

### Comment upsert algorithm
1. List the PR's issue comments, paginated.
2. Find the first comment whose body contains `<!-- envdrift-report -->`.
3. If one exists, update it. Otherwise create a new comment.
4. When there are no findings, the body is still posted and states "No issues". This is how J2 step 3 updates the comment to green.

### Behaviour on non-PR events
For `push` and `workflow_dispatch` events, the Action skips the comment step, logs that it did so, and still writes the summary and SARIF.

### Permissions
- `contents: read` is always required.
- `pull-requests: write` is required only when `comment: true`.
- `security-events: write` is needed only by the separate `upload-sarif` step.
- The full example workflow, including AWS OIDC for SSM, is in [functional/github-action.md](../functional/github-action.md).

### Dependencies
Proposal (not named in the PRD): use `@actions/core` for inputs, summary, and `setFailed`, and `@actions/github` for the Octokit client and event context. The alternative is to use raw `process.env.INPUT_*` and `fetch`, which needs no dependencies. That choice is decided at M4.2 and recorded in [dependencies.md](dependencies.md).

### Error handling
- Any failure in the comment step (for example, a fork PR with a read-only token) produces a **warning** and the job continues. The scan's exit code still decides pass or fail.
- Values never appear in the comment, because it is the same markdown reporter output that the redaction test covers (M4.4).
