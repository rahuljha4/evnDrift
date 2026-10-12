# Release

> Implements [PRD D8](../prd.md#6-locked-decisions), M7.1 in [§19](../prd.md#19-delivery-plan), and [ADR 0008](../architecture/adr/0008-distribution-npm-and-action.md) / [ADR 0011](../architecture/adr/0011-scoped-npm-package-name.md).

## 1. What is released

| Artifact | Name | Channel |
|---|---|---|
| npm package (CLI) | `@rahulkumar/envdrift` (placeholder scope, D11); bin `envdrift` | npm registry, public |
| Packed tarball (fallback) | `rahulkumar-envdrift-<version>.tgz` | GitHub release asset |
| GitHub Action | `<gh-user>/envdrift@v0` (from `packages/action/action.yml`) | GitHub tags |

`@envdrift/core` is **not** published. It is bundled into the CLI and the Action by tsup.

> Open item: `action.yml` must be resolvable at the path that `uses:` points to. `uses: <gh-user>/envdrift@v0` requires `action.yml` at the **repo root**. `uses: <gh-user>/envdrift/packages/action@v0` uses the subdirectory. Decide at M4.2, then update [github-action.md](../functional/github-action.md) and the PRD §14 example.

## 2. Versioning

- SemVer 0.x during the hackathon: `0.1.0` is the first public release at M7.1.
  - Breaking changes to the CLI flags, config schema or JSON output (`ScanResult.version`) bump the **minor** version.
  - Fixes bump the **patch** version.
- `ScanResult.version` (currently `1`) is independent. It changes only when the JSON shape breaks.
- The CLI package version, the Action version and the git tag are always the same `vX.Y.Z`.
- Proposal: keep a `CHANGELOG.md` at the repo root in Keep a Changelog format, started at M7.1.

## 3. Publishing to npm

```bash
npm run build && npm test                       # full suite incl. redaction test
cd packages/cli
npm pack --dry-run                              # inspect file list: dist/, README, LICENSE only
npm publish --access public --provenance
```

- `--access public` is required because scoped packages default to restricted.
- `--provenance` links the package to the GitHub workflow run. It requires publishing from GitHub Actions with `id-token: write`. A local publish cannot use `--provenance`, so the release is done through `release.yml` ([ci-cd.md](ci-cd.md)).
- The `files` field in `packages/cli/package.json` limits the package to `dist/`, `README.md` and `LICENSE`. No fixtures, tests or source maps that embed source (Proposal: no source maps in the published package).
- Before the first publish, create the npm account and verify that the scope `@rahulkumar` (or the real username) is available. Then replace the placeholder everywhere with a single find-and-replace.

### Fallback: tarball

If publishing is blocked (name, account or 2FA problems), PRD §4 allows a packed tarball:

```bash
cd packages/cli && npm pack            # → rahulkumar-envdrift-0.1.0.tgz
npx ./rahulkumar-envdrift-0.1.0.tgz --version
```

Attach the tarball to the GitHub release and document `npx <url-to-tgz> scan` in the README.

## 4. Releasing the Action

1. `npm run build` produces `packages/action/dist/index.js`, a single ESM bundle with every dependency inlined.
2. `dist/` is **committed only on the release commit or tag**, not on `main`. This keeps diffs clean. Proposal: `release.yml` builds, commits `dist/` on a detached release commit, and tags that commit.
3. Tags:
   - `v0.x.y` is immutable and never moved.
   - `v0` is the moving major tag. It is force-updated to the newest `v0.x.y` after the smoke test passes.
4. Security-sensitive users should pin by commit SHA. This is documented in the README.

## 5. Release checklist (M7.1, repeated at M8)

- [ ] `main` CI is green on all matrix entries.
- [ ] `npm audit --audit-level=high` is clean.
- [ ] The redaction end-to-end test passes for all four formats ([security.md §4](security.md#4-redaction-end-to-end-test-design-sec-07)).
- [ ] Dogfood scan exits 0, so there is no committed `.env` (ED007).
- [ ] Final manual secret scan of the full Git history. Proposal: `gitleaks detect --log-opts="--all"` or an equivalent. Any hit other than an `ENVDRIFT_PLANTED` fixture value blocks the release.
- [ ] Versions bumped consistently in `packages/cli/package.json` and `packages/action/package.json`. CHANGELOG updated.
- [ ] `npm pack --dry-run` file list reviewed.
- [ ] Tag `vX.Y.Z` pushed. `release.yml` succeeded. Provenance is shown on the npm page.
- [ ] Clean-machine smoke test (below).
- [ ] `v0` moved and the demo repo PR re-run green.

## 6. Clean-machine smoke test

On a machine or container with only Node ≥ 20 installed and no repo checkout:

```bash
docker run --rm -it node:20 bash -lc '
  npx -y @rahulkumar/envdrift --version &&
  mkdir /tmp/demo && cd /tmp/demo &&
  echo "console.log(process.env.FOO)" > index.js &&
  npx -y @rahulkumar/envdrift init &&
  npx -y @rahulkumar/envdrift scan; echo "exit=$?"'
```

Expected: the version is printed, `init` reports what it detected, and `scan` reports findings with exit code 1 (ED001 if `.env.example` exists; otherwise behaviour follows the config).

## 7. Rollback

| Problem | Action |
|---|---|
| Broken npm release | `npm deprecate @rahulkumar/envdrift@X.Y.Z "broken: use X.Y.Z+1"`, then publish a patch. Avoid `npm unpublish`: it is only allowed within 72 h and it breaks lockfiles. |
| Broken Action release | Move `v0` back to the previous good `v0.x.y` (`git tag -f v0 <sha> && git push -f origin v0`). Never move or delete immutable tags. |
| Leaked secret in a release | Revoke the secret first. Then deprecate the version, and purge it from history if it is in the repo. Document the incident in [ai-log.md](../ai-log.md) if AI-related. |
