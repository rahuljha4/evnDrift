# Correctness checklist

Sources: PRD §9, §11, §12, §13, §16; `docs/functional/rules/EDxxx.md`; `docs/functional/severity-resolution.md`, `suppression.md`; `docs/architecture/data-model.md`. Wrong rule semantics is a **BLOCKER**. Read the rule's own spec file, do not rely on the summary here.

## Rule semantics (PRD §11)
- [ ] ED001: `.env.example` is configured and a referenced name has no declaration in it. Locations: every reference.
- [ ] ED002: for environment E, name absent from all of E's sources **and at least one reference has no fallback**. Locations: the references without fallback.
- [ ] ED009: name absent from E **and every reference has a fallback**. ED002 and ED009 are mutually exclusive per name and environment; a fallback present must NOT produce ED002, a fallback absent must NOT produce ED009 (check the condition is not inverted or `some`/`every` swapped).
- [ ] ED003: unused declaration; downgraded to `info` with a note when any ED005 exists, unless `--strict` (D3).
- [ ] ED004: ≥ 2 environments and a name declared in some but not all, independent of code usage; `environments` lists where it is missing.
- [ ] ED005: one finding per dynamic access, default `info`.
- [ ] ED006: frontend prefix **and** one of SECRET/PRIVATE/TOKEN/PASSWORD/PASSWD/CREDENTIAL/KEY, except names ending `PUBLIC_KEY`, `PUBLISHABLE_KEY`, `SITE_KEY`.
- [ ] ED007: git-tracked `.env` / `.env.*` (not `.env.example|sample|template`) with ≥ 1 declaration where `hasValue`.
- [ ] ED008: `.env.example` declaration with `looksSecret`.
- [ ] Names in `ignore` (and the built-in ignore list unless `ignoreDefaults: false`) never produce findings.
- [ ] Severity resolution order: rule default → config `rules.<ID>` (`off` removes) → D3 downgrade → `--only` filter.

## Suppression (PRD §11, `suppression.md`)
- [ ] Same line or the line above; `envdrift-ignore-file` only in the first 10 lines; `#` form in dotenv/keys above the key.
- [ ] Location-based: covered locations are removed; a finding is dropped (and counted in `stats.suppressed`) only when all its locations are removed.

## Determinism and positions (hard rule 5, I2, I3)
- [ ] A function that hands findings to a caller outside core (`runRules`, `finalize`, a reporter input) without the explicit sort breaks hard rule 5 (**HIGH**, **BLOCKER** if it feeds output). Do not downgrade it because a later stage "may" sort: confirm that stage exists in the repo and cite it, otherwise it is a finding. Report it as its own finding, never inside a MEDIUM or NIT item about ordering or style.
- [ ] Findings sorted by severity (error, warning, info), ruleId, name (missing first), file, line, with plain `<` comparison, never `localeCompare`. Locations sorted file, line, column; environments lexicographic; warnings de-duplicated and sorted.
- [ ] Nothing depends on `Map`/`Set` insertion order from fs walk order, on `Object.keys` of unsorted input, or on timestamps (only `stats.durationMs` may vary).
- [ ] `line` and `column` are 1-based (Babel columns converted).
- [ ] Paths in output are posix `/` and relative to the scan root, including on Windows (`path.sep` split, no absolute paths).
- [ ] Fingerprint is `sha1(ruleId|name|sorted environments|first location file)`, stable across line shifts.

## Errors and exit codes (hard rule 6)
- [ ] A per-file failure becomes a warning, the file is skipped and the scan continues. Exit 2 only for tool, config or source errors, each with a one-line cause and one-line next step (`docs/system/error-handling.md`).
- [ ] Exit 0: nothing at or above `--fail-on`; 1: findings at or above `--fail-on`; 2: tool/config/source error. `--fail-on never` exits 0.
- [ ] Every finding has ≥ 1 location (I7).
