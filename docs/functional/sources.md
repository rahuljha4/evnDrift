# Sources: code extraction and config parsing

Source: [PRD §10](../prd.md#10-extraction-and-source-parsing).

## Core rule

Parsers live in `packages/core/src/parse/`. They receive text and return `Declaration[]`. **No value leaves a parser.** Value-dependent facts are computed inside the parser and only the booleans `hasValue` and `looksSecret` leave it ([ADR 0006](../architecture/adr/0006-values-never-leave-parsers.md)).

CLI adapters (`packages/cli/src/sources/`) read files or SSM and call the parsers.

## sourceId format

| Source | `sourceId` |
|---|---|
| Example file | `example` |
| Environment source | `<env>:<type>:<path>`, e.g. `staging:dotenv:deploy/staging.env.keys`, `production:aws-ssm:/myapp/prod/` |
| Compose `env_file` | `<env>:compose:<compose path>#env_file:<resolved path>` |

> **Open question:** the `sourceId` format for compose `env_file` entries. *Proposal:* use the format shown above, so findings can point at the compose file that pulled the env_file in.

---

## FR-SRC-01 — JS/TS extraction

**Scope**
- File types: `.js .jsx .mjs .cjs .ts .tsx .mts .cts`. `.d.ts` files are skipped.
- Parser: `@babel/parser` with a hand-written walker ([ADR 0001](../architecture/adr/0001-babel-parser-hand-written-walker.md)).
- Output: `Reference[]` (`via`: `process.env` \| `import.meta.env` \| `accessor`) and `DynamicAccess[]` (`kind`: `computed-key` \| `rest-destructuring` \| `alias`).

**Patterns**
- Supported patterns are defined **only** in [`patterns-catalogue.md`](../patterns-catalogue.md):
  - P = reference.
  - F = fallback.
  - D = dynamic.
  - N = negative.
  - A = accessor.
- Adding a pattern needs a catalogue row, a test with the same ID and the implementation, all in one commit.
- Aliases (`const env = process.env`) are reported as ED005 `alias`. They are not followed ([ADR 0004](../architecture/adr/0004-report-aliases-not-follow.md)).
- `hasFallback` is true for `??`, `||`, destructuring defaults, and the catalogue F rows ([ADR 0005](../architecture/adr/0005-fallback-missing-is-ed009.md)).

**Acceptance criteria**
- Every catalogue ID has a passing test named after it.
- Line and column are 1-based.
- Output order is deterministic: by file, then line, then column.

## FR-SRC-02 — Pre-filter
A file whose text contains neither `env` nor any configured accessor name is not parsed. It still counts in `filesScanned`.

> **Open question:** should pre-filtered files count as scanned? *Proposal:* yes. They were scanned, just cheaply, and ED003's "no references found in N scanned files" should include them.

## FR-SRC-03 — Accessors (D7, Should; cut 4th)

**Matching**
- A call matches when its callee is a configured identifier (`getEnv`) or member path (`config.get`).

**Arguments**

| First argument | Result |
|---|---|
| String literal, or a template with no expressions | `Reference` with `via: 'accessor'` |
| Anything else | ED005 `computed-key` |

**Fallbacks**
A fallback is detected in either case:
- A second argument is present.
- The call is the left operand of `??` or `||`.

**Acceptance criteria**
- Each accessor catalogue row (A01–A04) has a test.

## FR-SRC-04 — Parse failures
- A Babel syntax error becomes a warning: `"<file>: parse error at L:C — skipped"` (owner decision M0.2: line and column only, because parser messages can echo source identifiers). A recoverable error gives `"… — recovered"` and the file is still walked.
- The file is counted in `filesSkipped`, and the scan continues.
- The warning never includes source text or the parser message.

---

## FR-SRC-05 — dotenv (`dotenv` source and `.env.example`)

| Aspect | Behaviour |
|---|---|
| Syntax | `KEY=value`, `export KEY=value`, single, double and backtick quoting, multi-line double-quoted values, `#` comments, blank lines |
| `hasValue` | `true` if the value after unquoting is non-empty |
| `looksSecret` | `looksLikeSecret(value)`, computed inside the parser |
| Duplicate keys | One declaration (first occurrence) plus a warning on the source: `"<file>: duplicate key <NAME> (lines a, b)"` |
| Invalid lines | Warning `"<file>:<line>: invalid line"` with the line number only (no content); the line is skipped |
| Unterminated quote | Warning `"<file>:<line>: unterminated quote"`. The value is taken as the rest of that line, so later keys are still read. A double-quoted value spans at most 100 lines. |
| `export` prefix | `export KEY=v` is accepted. A key literally named `export` is not a prefix. |
| Suppression comments | Only `# envdrift-ignore [EDnnn …]` lines are returned (sanitised to those tokens). Other comments are dropped because they may hold values. |
| Line numbers | 1-based line of the key |

**Edge cases**

| Input | Result |
|---|---|
| `KEY=` | `hasValue: false` |
| `KEY` (no `=`) | Declaration with `hasValue: false` |
| `KEY="a # b"` | The value includes `# b`. Not a comment. |
| `KEY=a # comment` | The value is `a` |
| UTF-8 BOM | Stripped |
| CRLF line endings | Supported |

**Property test:** for arbitrary input, the parser never throws, and no output object carries any substring of a value.

## FR-SRC-06 — Dockerfile (`dockerfile` source)

| Aspect | Behaviour |
|---|---|
| Instructions | `ENV A=1 B="x y"`, legacy `ENV A 1`, `ARG A`, `ARG A=1` |
| Case | Instructions are case-insensitive (`env`, `Env`) |
| Continuations | `\` joins lines. The line number is the instruction's first line. |
| Comments | Lines starting with `#` are ignored |
| Multi-stage | All stages contribute |
| `hasValue` | `ENV`: true when the value is non-empty. `ARG A`: false. `ARG A=1`: true. |
| `looksSecret` | Computed on the value, like dotenv |

**Property test:** the parser never throws on arbitrary input.

> **Open question:** should `ARG` declarations count as declaring the variable at runtime? A build `ARG` is not visible at container runtime unless it is re-exported with `ENV`. *Proposal:* count them, as the PRD lists them, and document this limitation in the README.

## FR-SRC-07 — docker-compose (`compose` source)

| Aspect | Behaviour |
|---|---|
| `services.*.environment` (list) | `- A=1` gives `hasValue: true`. `- A` gives `hasValue: false`. |
| `services.*.environment` (map) | `A: 1` gives `hasValue: true`. `A:` (null) gives `hasValue: false`. |
| `services.*.env_file` | A string, a list of strings, or a list of `{ path }` objects. Each path is resolved relative to the compose file by the CLI adapter and parsed as dotenv. |
| `service` filter | When configured, only that service contributes. An unknown service gives exit 2. |
| Interpolation | `${VAR}` inside values is ignored, because values are not kept |
| Line numbers | The line of the key in the compose YAML. For env_file entries, the line in the env file. |

**Edge cases**
- A missing `env_file` path gives a source warning, unless the entry is `{ path, required: false }`, in which case it is silent.
- A compose file with no `services` key gives a warning and zero declarations.

> **Open question:** should a missing required `env_file` be a warning or an exit-2 error? *Proposal:* a warning. Compose itself would fail, but EnvDrift should still report the other findings.

## FR-SRC-08 — Keys file (`keys` source)

| Aspect | Behaviour |
|---|---|
| Format | One name per line. `#` comments. Blank lines are ignored. Surrounding whitespace is trimmed. |
| `hasValue` | Always `false` |
| `looksSecret` | Always `false` |
| Invalid names | A line that is not `^[A-Za-z_][A-Za-z0-9_]*$` gives a warning with the line number only |
| Duplicates | Warning, as for dotenv |

**Property test:** the parser never throws on arbitrary input, and its output contains only names.

## FR-SRC-09 — AWS SSM (`aws-ssm` source; Should, cut 1st)

**Request**
- Uses `GetParametersByPath` with `Path`, `Recursive: true` and `WithDecryption: false`.
- Follows all pages.
- `@aws-sdk/client-ssm` is lazy-imported only when this source type is configured.

**Declarations**
- Name: the last path segment (`/myapp/prod/DB_URL` gives `DB_URL`). With `nameFrom: fullPath`, the full path is used.
- Flags: `hasValue: true` and `looksSecret: false`. Values are never inspected.
- The declaration `file` is the configured SSM path, and `line` is `1`.

**Errors**

| Condition | Behaviour |
|---|---|
| Credentials missing | Exit 2 (`E-SSM`): one-line cause plus a next step (configure credentials or OIDC) |
| `AccessDeniedException` | Exit 2. Prints the minimal IAM policy (`ssm:GetParametersByPath` on the path ARN). |
| Throttling | Retried 3× with exponential backoff. Exit 2 if it still fails. |
| Empty path (0 parameters) | A source warning, not an error |

The mocked tests use `aws-sdk-client-mock` and cover pagination, access denied, no credentials, throttling and an empty path.

## FR-SRC-10 — Secret detection (`secrets.ts`)

`looksLikeSecret(value): boolean` is called **only** by parsers. It returns true if either condition holds:

1. **Known prefix:** the value starts with one of `sk_live_`, `sk_test_`, `rk_live_`, `ghp_`, `gho_`, `github_pat_`, `AKIA`, `ASIA`, `xoxb-`, `xoxp-`, `AIza`, `-----BEGIN`.
2. **High entropy:** length ≥ 20 **and** Shannon entropy ≥ 3.5 bits/char **and** the value is not an obvious placeholder. Placeholders are:
   - `changeme`
   - `your-*-here`
   - `xxx…`
   - `<…>`
   - values containing `example`
   - `localhost` URLs

**Acceptance criteria**
- There is a positive test for each prefix.
- There are entropy boundary tests at 19 and 20 characters, and at 3.49 and 3.5 bits.
- There is a test for each placeholder class.
- The function is linear-time. No backtracking regex is used ([security.md](../system/security.md)).

## FR-SRC-11 — File walk safety

Source: [PRD §15.4](../prd.md#15-security-and-privacy-non-negotiable). Implemented in `cli/io/walk.ts`.

- Applies `.gitignore` semantics, then `include` and `exclude`.
- Never follows a symlink whose real path is outside `root`.
- Skips files larger than `limits.maxFileBytes`.
- Skips binary files, detected by a NUL byte in the first 8 KB.
- Each skip increments `filesSkipped` and adds a warning containing the path and the reason.

## FR-SRC-12 — Git-tracked env files (ED007 input)

**Selection**
- `cli/io/git.ts` runs `git ls-files` under `root`.
- It keeps files matching `.env` or `.env.*`, excluding `.env.example`, `.env.sample` and `.env.template`.
- Each kept file is parsed as dotenv into `trackedEnvFiles`.

**Outside a Git repository**
- `trackedEnvFiles` is empty, and a warning is emitted.
- ED007 cannot fire.
