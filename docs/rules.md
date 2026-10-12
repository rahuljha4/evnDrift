# EnvDrift rules — `explain` text

This file is the text printed by `envdrift explain <ruleId>`. Semantics are defined in [PRD §11](prd.md#11-rules) and must agree with it. The full functional specs, with examples and required tests, live in [`functional/rules/`](functional/rules/).

**Format contract (parsed by `explain`):** each rule is one `## EDxxx — slug` section. Everything up to the next `## ` heading is printed verbatim. Do not add other `## ` headings to this file.

---

## ED001 — missing-in-example

**Default severity:** error

**What it means:** your code reads this variable, but `.env.example` does not declare it.

**Why it matters:** `.env.example` is how new developers and deploy scripts learn which variables exist. If it is missing a variable, people will not set it.

**How to fix:** add `NAME=` (an empty value) to `.env.example`, or run `envdrift fix --example`.

**Suppress:** put `// envdrift-ignore ED001` on the reference line or the line above, or add the name to `ignore` in `envdrift.config.yaml`.

Details: functional/rules/ED001.md

## ED002 — missing-in-env

**Default severity:** error

**What it means:** your code reads this variable without a fallback, and none of the sources for environment E declare it.

**Why it matters:** after deploy to E the variable is `undefined`, so the app will crash or misbehave even though the build and tests passed.

**How to fix:** declare the variable in one of E's sources (see `environments.E.sources` in your config), or add a fallback in code if a default is genuinely safe.

**Suppress:** put `// envdrift-ignore ED002` on the reference line or the line above, or add the name to `ignore`.

Details: functional/rules/ED002.md

## ED003 — unused-declaration

**Default severity:** warning (downgraded to info if the scan found any dynamic access, unless `--strict`)

**What it means:** this variable is declared in `.env.example` or in an environment, but no scanned file references it. The finding states how many files were scanned.

**Why it matters:** stale variables pile up. Nobody dares remove them, and they hide which config actually matters.

**How to fix:** remove the declaration if it is truly unused. If it is read in a way EnvDrift cannot see (another language, a shell script, a dynamic key), add it to `ignore` or suppress it.

**Suppress:** put `# envdrift-ignore ED003` on the line above the key in the dotenv or keys file, or add the name to `ignore`.

**Note:** if any ED005 dynamic access exists, "unused" cannot be proven. These findings then become info with a note explaining why. Use `--strict` to keep them at their configured severity.

Details: functional/rules/ED003.md

## ED004 — env-mismatch

**Default severity:** warning

**What it means:** two or more environments are configured, and this variable is declared in some of them but not all. This check is independent of code usage.

**Why it matters:** environments that silently drift apart cause "works in staging, breaks in production".

**How to fix:** declare the variable in the environments listed in the finding, or remove it from the ones that have it.

**Suppress:** put `# envdrift-ignore ED004` on the line above the key, or add the name to `ignore`.

Details: functional/rules/ED004.md

## ED005 — dynamic-access

**Default severity:** info

**What it means:** the code reads the environment in a way that cannot be resolved statically. Examples are a computed key (`process.env[name]`), rest destructuring (`const { A, ...rest } = process.env`), or an alias (`const env = process.env`).

**Why it matters:** EnvDrift cannot tell which variables these reads use. This is why ED003 findings are downgraded while any dynamic access exists.

**How to fix:** read variables by literal name where possible. For wrapper functions, configure `accessors` in `envdrift.config.yaml`.

**Suppress:** put `// envdrift-ignore ED005` on the line or the line above, or `// envdrift-ignore-file ED005` in the first 10 lines of the file.

Details: functional/rules/ED005.md

## ED006 — public-secret

**Default severity:** error

**What it means:** this variable name starts with a frontend prefix (for example `NEXT_PUBLIC_` or `VITE_`) and looks like a secret. It contains `SECRET`, `PRIVATE`, `TOKEN`, `PASSWORD`, `PASSWD`, `CREDENTIAL` or `KEY`, and does not end in `PUBLIC_KEY`, `PUBLISHABLE_KEY` or `SITE_KEY`.

**Why it matters:** frontend-prefixed variables are inlined into the browser bundle, so every visitor can read the value.

**How to fix:** remove the frontend prefix and read the variable only on the server. Rotate the secret if it has already shipped.

**Suppress:** put `// envdrift-ignore ED006` (or `# envdrift-ignore ED006` in dotenv files) when the value is genuinely public.

Details: functional/rules/ED006.md

## ED007 — committed-env-file

**Default severity:** error

**What it means:** a Git-tracked file named `.env` or `.env.*` contains at least one key with a value. `.env.example`, `.env.sample` and `.env.template` are exempt.

**Why it matters:** values in Git history are effectively public to anyone with repository access, forever.

**How to fix:** `git rm --cached <file>`, add it to `.gitignore`, and rotate every secret it contained. History rewriting alone is not enough.

**Suppress:** not recommended. Use `rules: { ED007: off }` only for repositories where the file is intentionally committed with non-secret values.

Details: functional/rules/ED007.md

## ED008 — example-has-value

**Default severity:** warning

**What it means:** a key in `.env.example` has a value that looks like a real secret, based on a known key prefix or high entropy. The value itself is never shown.

**Why it matters:** example files are committed and shared. A real credential there is leaked.

**How to fix:** replace the value with an empty value or an obvious placeholder (`changeme`, `<your-key-here>`), and rotate the secret.

**Suppress:** put `# envdrift-ignore ED008` on the line above the key.

Details: functional/rules/ED008.md

## ED009 — default-masks-missing

**Default severity:** warning

**What it means:** environment E does not declare this variable, but every reference in code has a fallback (`??`, `||`, a destructuring default, or an accessor default argument).

**Why it matters:** the app will not crash in E. It will silently run with the development default, which is often wrong in staging or production.

**How to fix:** declare the variable in E with the intended value. If the default really is correct for E, suppress or ignore it.

**Suppress:** put `// envdrift-ignore ED009` on the reference line or the line above, or add the name to `ignore`.

Details: functional/rules/ED009.md
