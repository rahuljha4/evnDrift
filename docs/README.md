# EnvDrift documentation

| Folder / file | What it answers | PRD source |
|---|---|---|
| [prd.md](prd.md) | **What** to build: requirements, locked decisions, milestones (v2.1) | — |
| [functional/](functional/overview.md) | What the product does, from the user's side: journeys, CLI, config, sources, rules, suppression, outputs, Action | §3, §4, §7, §10–§14 |
| [architecture/](architecture/overview.md) | How it is built: packages, data flow, data model, modules, dependencies, decisions | §6, §8, §9 |
| [architecture/adr/](architecture/adr/README.md) | Why: one ADR per locked decision (D1–D11) | §6 |
| [system/](system/security.md) | Cross-cutting qualities: security and threat model, NFRs, testing/QA, CI/CD, release, error handling | §15, §16, §18, §19 |
| [rules.md](rules.md) | `envdrift explain` text per rule | §11 |
| [patterns-catalogue.md](patterns-catalogue.md) | Every JS/TS pattern the extractor supports ↔ test ID | §10.1 |
| [output-schema.json](output-schema.json) | JSON Schema of `scan --format json` | §9, §13 |
| [ai-log.md](ai-log.md) | AI mistakes → context changes | §17 |
| [ai-development.md](ai-development.md) | Submission evidence: how AI was used | §17, §22 |
| [conventions/commits.md](conventions/commits.md) | Commit message format, quality rules, staged-change rules, review gate (enforced by the hooks and the `envdrift-commit` skill) | §17 |
| [reviews/](reviews/) | Code review reports written by the `envdrift-code-review` skill | §17 |
| [benchmark.md](benchmark.md) | Real-repo precision, performance, mutation score | §4, §16, §18 |

## Functional
[overview](functional/overview.md) · [journeys](functional/journeys.md) · [cli](functional/cli.md) · [configuration](functional/configuration.md) · [sources](functional/sources.md) · [suppression](functional/suppression.md) · [severity-resolution](functional/severity-resolution.md) · [output-formats](functional/output-formats.md) · [github-action](functional/github-action.md) · rules: [ED001](functional/rules/ED001.md) [ED002](functional/rules/ED002.md) [ED003](functional/rules/ED003.md) [ED004](functional/rules/ED004.md) [ED005](functional/rules/ED005.md) [ED006](functional/rules/ED006.md) [ED007](functional/rules/ED007.md) [ED008](functional/rules/ED008.md) [ED009](functional/rules/ED009.md)

## Architecture
[overview](architecture/overview.md) · [data-flow](architecture/data-flow.md) · [data-model](architecture/data-model.md) · [modules-core](architecture/modules-core.md) · [modules-cli](architecture/modules-cli.md) · [modules-action](architecture/modules-action.md) · [dependencies](architecture/dependencies.md) · [ADRs](architecture/adr/README.md)

## System
[security](system/security.md) · [nfr](system/nfr.md) · [testing-qa](system/testing-qa.md) · [ci-cd](system/ci-cd.md) · [release](system/release.md) · [error-handling](system/error-handling.md)

## PRD-only sections
[Demo script (§20)](prd.md#20-demo-script--5-min) · [Risks (§21)](prd.md#21-risks) · [Change log (§23)](prd.md#23-change-log) · [Roadmap (§24)](prd.md#24-roadmap-post-hackathon-not-in-scope)
