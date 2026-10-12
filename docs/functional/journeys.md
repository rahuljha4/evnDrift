# User journeys

Source: [PRD §7](../prd.md#7-user-journeys).

| Journey | Priority | Demo |
|---|---|---|
| J1 | Must | Demo core |
| J2 | Must | Demo core |
| J3 | Must | — |
| J4 | Should | Only if M5 lands |

All terminal mockups use invented variable names and never show values. Exact table layout is specified in [output-formats.md](output-formats.md). These mockups are illustrative.

---

## FR-J-01 — J1: First run

**Persona:** developer. **Milestone:** M2.4, plus the M2 gate ("J1 works end to end on `demo-app` and one real repo").

### Preconditions
- A Node ≥ 20 JS/TS project. No `envdrift.config.yaml` exists yet.
- There may be any combination of `.env.example`, a `Dockerfile`, compose files, and frontend framework dependencies in `package.json`.

### Steps
1. **Run `npx @rahulkumar/envdrift init`.**
   - Detects `.env.example`, `Dockerfile`, and `docker-compose*.yml` / `compose*.yml` files.
   - Detects frontend prefixes from `package.json` dependencies:

     | Dependency | Prefix |
     |---|---|
     | `next` | `NEXT_PUBLIC_` |
     | `vite` | `VITE_` |
     | `react-scripts` | `REACT_APP_` |
     | `expo` | `EXPO_PUBLIC_` |

   - Writes `envdrift.config.yaml` and prints what it detected.
2. **Run `npx @rahulkumar/envdrift scan`.**
   - Prints a table grouped by severity, then by rule.
   - Prints a summary footer.
   - Exits with 0, 1 or 2 (see [cli.md](cli.md#exit-codes)).

### Expected output (illustrative)
```text
$ npx @rahulkumar/envdrift init
Detected:
  example       .env.example
  dockerfile    Dockerfile
  compose       docker-compose.yml
  prefixes      NEXT_PUBLIC_   (from dependency "next")
Wrote envdrift.config.yaml
Next: run `envdrift scan`

$ npx @rahulkumar/envdrift scan
ERROR
  ED002  PAYMENTS_WEBHOOK_SECRET  src/api/webhook.ts:14  [production]
         Add PAYMENTS_WEBHOOK_SECRET to production (Dockerfile)
  ED006  NEXT_PUBLIC_ADMIN_TOKEN  src/app/page.tsx:8 (+1 more)
         Rename without NEXT_PUBLIC_ and read it server-side
WARNING
  ED003  LEGACY_REDIS_URL  .env.example:12
         Remove LEGACY_REDIS_URL or reference it in code

2 errors, 1 warning, 0 info · 118 files scanned · 0.41 s · 0 suppressed
```
Exit code: `1`.

### Acceptance criteria
- `init` writes a config file that passes schema validation and contains only the sources it detected.
- `init` refuses to overwrite an existing config unless `--force` is given ([FR-CLI-09](cli.md#init)).
- `scan` on fixture `demo-app` matches `fixtures/demo-app/expected.json` exactly.
- No value from any `.env*` file appears in stdout or stderr.

### Failure variants
| Situation | Behaviour |
|---|---|
| No `.env.example`, no Dockerfile, no compose file | `init` writes a config with `example: null` and no environments, and says so. `scan` then only reports code-derived rules (ED005, ED006). |
| Config already exists | `init` exits 2 and suggests `--force`. |
| Invalid config edited by hand | `scan` exits 2 with the YAML path and expected type ([configuration.md](configuration.md#validation-errors)). |

> **Open question:** should `init` emit a placeholder `environments:` section when it detects only `.env.example`? *Proposal:* yes, as a commented-out example block, so `scan` has no ED002 noise until the user configures it.

---

## FR-J-02 — J2: Catch it in the PR

**Persona:** reviewer or release owner. **Milestone:** M4.2.

### Preconditions
- The repository has a workflow that uses `<gh-user>/envdrift@v0` ([github-action.md](github-action.md)).
- The workflow grants `pull-requests: write` when `comment: true`.

### Steps
1. A PR adds `process.env.SENDGRID_API_KEY` without declaring it.
2. The Action runs:
   - It fails the check (exit 1 because of ED001/ED002 at `error`).
   - It writes the markdown report to `$GITHUB_STEP_SUMMARY`.
   - It posts **one** PR comment containing `<!-- envdrift-report -->`.
3. The developer adds the key to `.env.example` and the environment sources, then pushes.
4. The Action re-runs and passes. The **same** comment is edited to "No issues".

### Expected PR comment (illustrative)
```markdown
<!-- envdrift-report -->
### EnvDrift: 2 errors, 0 warnings, 0 info

| Rule | Variable | Location | Environments | Fix |
|---|---|---|---|---|
| ED001 | SENDGRID_API_KEY | src/mail.ts:5 | — | Add SENDGRID_API_KEY to .env.example |
| ED002 | SENDGRID_API_KEY | src/mail.ts:5 | production, staging | Add SENDGRID_API_KEY to production, staging |
```
After the fix, the comment body becomes:
```markdown
<!-- envdrift-report -->
### EnvDrift: No issues
```

### Acceptance criteria
- Exactly one comment exists per PR after any number of re-runs.
- The job summary is written on every run, whether it passes or fails.
- The check status is failure when the CLI exits 1, and success when it exits 0.

### Failure variants
| Situation | Behaviour |
|---|---|
| Token lacks `pull-requests: write` | The comment step warns. The job summary is still written. The check result is unchanged. |
| Run is not on a PR event | The comment is skipped. The summary is written. |
| Config error | The Action fails with exit 2 and the error's next-step line. |

---

## FR-J-03 — J3: Clean up

**Persona:** developer or tech lead. **Milestone:** M3 (ED003 lands in M1.5; the J3 demo is verified in M3).

### Steps
1. Run `envdrift scan --only ED003`.
2. Each unused declaration is listed for each source. The message ends with "no references found in N scanned files".

### Expected output (illustrative)
```text
$ envdrift scan --only ED003
WARNING
  ED003  LEGACY_REDIS_URL  .env.example:12
         no references found in 118 scanned files
  ED003  LEGACY_REDIS_URL  deploy/staging.env.keys:4  [staging]
         no references found in 118 scanned files

0 errors, 2 warnings, 0 info · 118 files scanned · 0.38 s · 0 suppressed
```

### Acceptance criteria
- Only ED003 findings are shown, and the exit code is computed from those findings only ([severity-resolution.md](severity-resolution.md)).
- If the scan has any dynamic access and `--strict` is absent, these findings are `info`. Each carries the D3 note ([rules/ED003.md](rules/ED003.md)).

---

## FR-J-04 — J4: Onboarding

**Persona:** new joiner or maintainer. **Milestone:** M5.2 (cut second if behind).

### Steps
1. Run `envdrift fix --example --dry-run`. This shows a unified diff of `.env.example`.
2. Run `envdrift fix --example`. This writes the file:
   - Existing comments and order are kept.
   - Missing referenced keys are appended with an empty value under a `# Added by envdrift` header.
3. Optionally, run `envdrift fix --example --prune`. This also removes keys that have no reference.

### Expected diff (illustrative)
```diff
 # Database
 DATABASE_URL=
 LEGACY_REDIS_URL=
+
+# Added by envdrift
+PAYMENTS_WEBHOOK_SECRET=
+SENDGRID_API_KEY=
```

### Acceptance criteria
- `fix` writes **only** the configured `.env.example` ([PRD §15.2](../prd.md#15-security-and-privacy-non-negotiable)).
- Keys are never removed without `--prune`.
- `--dry-run` writes nothing and exits 0.
- Appended keys are sorted alphabetically, so output is deterministic.
- Existing values in `.env.example` are preserved byte-for-byte and never echoed in the diff context lines.

> **Open question:** a diff context line of `.env.example` could show an existing value, which would breach the "no value in output" rule. *Proposal:* the dry-run diff renders every line that carries a value as `KEY=…` (value elided). This covers context lines and lines removed by `--prune`. Added lines are always `KEY=` with an empty value.

> **Open question:** if the `# Added by envdrift` header already exists from a previous run, should new keys be appended under it, or under a new header? *Proposal:* append under the existing header.
