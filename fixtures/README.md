# Golden fixtures

Each fixture is a small repository: `fixtures/<name>/` plus `fixtures/<name>/expected.json`. The test layout and contract are defined in [docs/system/testing-qa.md](../docs/system/testing-qa.md) and [PRD §18](../docs/prd.md#18-qa-strategy).

**Contract**
- `expected.json` is the exact `ScanResult` ([schema](../docs/output-schema.json)) from `envdrift scan --format json --cwd fixtures/<name>`. `stats.durationMs` is normalised before comparison.
- Each fixture has its own `envdrift.config.yaml`.
- Every value in every fixture is **fake**. Planted "secrets" use obviously fake strings that still trip the detector (e.g. `sk_live_FAKEFAKEFAKE…`). They are listed in `planted-secrets/PLANTED.txt` so the redaction test can grep outputs for them.
- Fixtures may contain committed `.env` files on purpose. The root `.gitignore` only ignores `/.env*` at the repo root.
- `fixtures/` is excluded from lint, prettier, and EnvDrift's own dogfood scan.

| Fixture | Purpose | Main rules exercised | Milestone |
|---|---|---|---|
| `clean` | No findings; exit 0 | — | M2.3 |
| `demo-app` | The demo story (PRD §20): missing var, unused var, `NEXT_PUBLIC_` secret | ED001, ED002, ED003, ED006 | M2.3 |
| `monorepo` | Multiple packages, one root `.env.example` | ED001, ED003 | M6.2 |
| `vite-app` | `import.meta.env`, `VITE_` prefix | ED001, ED006 | M6.2 |
| `compose-multi-env` | staging + production from compose (`env_file`, service filter) + Dockerfile | ED002, ED004, ED009 | M3.2 |
| `committed-env` | Git-tracked `.env` with values | ED007 | M3.3 |
| `dynamic-heavy` | Computed keys / aliases → D3 downgrade of ED003 | ED005, ED003 (info) | M6.2 |
| `suppressions` | Every suppression form, incl. unmatched in `--strict` | all | M6.2 |
| `planted-secrets` | End-to-end redaction across all formats | ED006, ED007, ED008 | M3.4 / M4.4 |
