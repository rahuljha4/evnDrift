# EnvDrift

> Your build passed, your tests passed, and production crashed because `STRIPE_WEBHOOK_SECRET` wasn't set. EnvDrift catches that in the pull request.

EnvDrift is a CLI and GitHub Action that checks **before deployment** that:
- every environment variable your JavaScript/TypeScript code reads is declared in `.env.example` and in each configured environment,
- no secret is exposed to the browser (`NEXT_PUBLIC_`, `VITE_`, …),
- no real `.env` file is committed to Git.

It reads variable **names only**. It never prints, stores or transmits a value.

> **Status:** under construction for Build With AI Hackathon 2026 (8–30 Oct). Milestone M0 (scaffold + docs) is in progress. Commands below are the target interface. See [docs/prd.md §19](docs/prd.md#19-delivery-plan).

## Quick start (target)

```bash
npx @rahulkumar/envdrift init     # detect .env.example, Dockerfile, compose, frontend prefixes
npx @rahulkumar/envdrift scan     # table report + exit code (0 ok, 1 findings, 2 tool/config error)
npx @rahulkumar/envdrift explain ED002
```

## Rules

| ID | Name | Default |
|---|---|---|
| ED001 | missing-in-example | error |
| ED002 | missing-in-env | error |
| ED003 | unused-declaration | warning |
| ED004 | env-mismatch | warning |
| ED005 | dynamic-access | info |
| ED006 | public-secret | error |
| ED007 | committed-env-file | error |
| ED008 | example-has-value | warning |
| ED009 | default-masks-missing | warning |

Details: [docs/rules.md](docs/rules.md) · specs: [docs/functional/rules/](docs/functional/rules/)

## GitHub Action (target)

```yaml
- uses: <gh-user>/envdrift@v0
  with:
    config: envdrift.config.yaml
    fail-on: error
```
See [docs/functional/github-action.md](docs/functional/github-action.md) for permissions, SARIF upload and AWS OIDC.

## Documentation

Start at [docs/README.md](docs/README.md). Contributors (human or AI) read [CLAUDE.md](CLAUDE.md) first.

## Development

```bash
npm install
npm test && npm run typecheck && npm run lint
```
Requires Node ≥ 20.

## License

[MIT](LICENSE)
