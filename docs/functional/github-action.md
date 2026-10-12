# GitHub Action

| Item | Value |
|---|---|
| Source | [PRD §14](../prd.md#14-github-action) |
| Milestone | M4.2 |
| Implementation | `packages/action/` (`action.yml` + `src/index.ts`, bundled with tsup) |
| Distribution | [ADR 0008](../architecture/adr/0008-distribution-npm-and-action.md) |

```yaml
- uses: <gh-user>/envdrift@v0
```

## FR-ACT-01 — Inputs

| Input | Default | Purpose |
|---|---|---|
| `config` | `envdrift.config.yaml` | Config path, relative to the workspace |
| `fail-on` | `error` | Same as the CLI `--fail-on` (`error` \| `warning` \| `never`) |
| `comment` | `true` | Create or update a single PR comment, found via the marker |
| `sarif-file` | empty | If set, write SARIF to this path, for `github/codeql-action/upload-sarif` |

**Validation**
- An invalid `fail-on` value fails the step with an exit-2-equivalent error.

> **Open question:** the Action needs a token to comment. The PRD does not list one. *Proposal:* add an input `github-token`, defaulting to `${{ github.token }}`. This is the conventional pattern and is needed for comment upsert.

## Behaviour

The Action runs the same scan pipeline as the CLI, in-process from the bundled code. It does not use `npx`.

1. **FR-ACT-02 — Job summary.** The markdown report is **always** appended to `$GITHUB_STEP_SUMMARY`, whether the result is pass or fail.
2. **FR-ACT-03 — PR comment.** When `comment: true` and the event is `pull_request` or `pull_request_target`:
   - The Action lists the PR's issue comments.
   - It finds the first comment, by any author the token can edit, whose body contains `<!-- envdrift-report -->`.
   - It **updates** that comment, or **creates** one if none exists.
   - Exactly one EnvDrift comment exists per PR.
   - A clean run updates the comment to "No issues". It does not delete it.
3. **FR-ACT-04 — SARIF.** When `sarif-file` is set, the SARIF report is written to that path. Parent directories are created if needed.
4. **FR-ACT-06 — Result.** The step fails when the scan's exit code is 1 or 2. The failure message is the summary line, or the error's cause and next-step lines.

### Failure modes

| Condition | Behaviour |
|---|---|
| Not a PR event (`push`, `schedule`) | Skip the comment with an info log. Write the summary and SARIF as usual. |
| `pull-requests: write` missing, or a fork PR with a read-only token | Comment fails. Log a **warning**, not a failure. The check result is still decided by findings. |
| Config invalid or a source error | The step fails with the exit-2 message. The summary gets a short error block. No comment is posted. |
| SSM credentials missing | Same as above. The README shows the OIDC setup. |
| No checkout step | Config not found, so exit 2, with the next step "add actions/checkout". |

## FR-ACT-05 — Permissions

| Permission | Needed when |
|---|---|
| `contents: read` | Always (checkout) |
| `pull-requests: write` | Only when `comment: true` |
| `security-events: write` | Only for the separate `upload-sarif` step |
| `id-token: write` | Only for AWS OIDC (SSM source) |

The Action never requests more than the workflow grants. It makes no network calls besides the GitHub API (comments) and AWS SSM (if configured).

## Example workflows

These go in the README in M7.2. Action versions are pinned at M4.2. Prefer full commit SHAs.

### 1. Basic PR check
```yaml
name: envdrift
on:
  pull_request:
permissions:
  contents: read
  pull-requests: write
jobs:
  envdrift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: <gh-user>/envdrift@v0
        with:
          config: envdrift.config.yaml
          fail-on: error
```

### 2. With SARIF upload (code scanning)
```yaml
name: envdrift
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
  pull-requests: write
  security-events: write
jobs:
  envdrift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: <gh-user>/envdrift@v0
        with:
          sarif-file: envdrift.sarif
      - uses: github/codeql-action/upload-sarif@v4
        if: always()
        with:
          sarif_file: envdrift.sarif
          category: envdrift
```

### 3. With AWS SSM via OIDC
```yaml
name: envdrift
on:
  pull_request:
permissions:
  contents: read
  pull-requests: write
  id-token: write
jobs:
  envdrift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: aws-actions/configure-aws-credentials@v5
        with:
          role-to-assume: arn:aws:iam::123456789012:role/envdrift-readonly
          aws-region: ap-south-1
      - uses: <gh-user>/envdrift@v0
```

The minimal IAM policy for the role (documented in the README) is:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "ssm:GetParametersByPath",
    "Resource": "arn:aws:ssm:ap-south-1:123456789012:parameter/myapp/prod*"
  }]
}
```
Decryption is never requested (`WithDecryption: false`), so no `kms:Decrypt` permission is needed.

## Acceptance criteria (M4.2)
- On a public demo repository PR, a failing run posts one comment.
- A follow-up passing commit updates **the same** comment to "No issues".
- The job summary is present on both runs.
- With `sarif-file` set, the file validates against SARIF 2.1.0, and `upload-sarif` accepts it.
- `action.yml` declares all four inputs with their defaults, and `runs.using: node24`.

> **Open question:** the PRD (D10) says Node ≥ 20. GitHub-hosted runners are deprecating `node20` for JavaScript actions. *Proposal:* use `runs.using: node24`. The CLI's own `engines` field stays `>=20`.
