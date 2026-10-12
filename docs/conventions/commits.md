# Commit conventions

This is the single source of truth for commits in this repository. The Git hooks (`.githooks/`), the check modules (`scripts/commit-checks/`) and the `envdrift-commit` skill enforce **only** what is written here. If a rule is not in this document, nothing enforces it.

Applies from the commit that introduces this document onward. Earlier history (`M0.1: …`, `chore: …`) is not rewritten.

## 1.1 Message format

```
<type>(<scope>): <summary>

<body>

<trailers>
```

- **type**: `feat` | `fix` | `test` | `refactor` | `docs` | `chore` | `ci` | `build`.
- **scope**: a milestone task ID from [PRD §19](../prd.md#19-delivery-plan) (for example `M2.3`). Commits of type `docs`, `chore`, `ci` and `build` that are not tied to a task may use `repo`.
- **summary**: imperative mood, lower-case first word, no trailing period. The whole subject is at most 72 characters.
- A blank line separates the subject from the body. Wrap the body at 72 characters (a line without spaces, such as a URL, is exempt).
- Merge commits (a `MERGE_HEAD` exists) are exempt from every message rule.
- Comment lines starting with `#` are stripped before the checks, as Git does.

### Trailers (when they apply)

| Trailer | When | Enforced by hook |
|---|---|---|
| `Refs: docs/prd.md §<section>` | feat and fix: the PRD section or decision the commit implements | yes |
| `Dependency: <name> — <reason>` | one per dependency added to any `package.json` (any dependency section) | yes |
| `No-test-reason: <reason>` | source under `packages/*/src` changes without a test change in the same package | yes |
| `AI-log: #<n>` | the commit adds row(s) to `docs/ai-log.md`; every new row number must appear | yes |
| `Co-Authored-By: …` | not added in this repository (the owner's decision); add one only when the owner asks for it | no, in either direction |

## 1.2 Writing good commit messages

Format alone is not enough. Every message must explain the change to someone reading the history later, including the hackathon judges.

### Subject line

- Say what the commit does to the **product**, not what you did at the keyboard.
  - Good: `feat(M1.5): flag missing variables with fallbacks as ED009`
  - Bad: `feat(M1.5): update rules`, `fix(M2.1): fix bug`, `chore(repo): changes`
- Be specific enough to understand without opening the diff: name the rule, command, parser or behaviour.
- Imperative mood ("add", "handle", "reject"), not past tense ("added") or -ing ("adding").
- No emojis, no "WIP", no issue-tracker noise.

### Body

Required for every `feat` and `fix`, and for any commit touching more than one file under `packages/*/src`.

- **Paragraph 1: why.** The problem or PRD requirement this addresses, citing the section or decision (for example "PRD §11 ED009, decision D5").
- **Paragraph 2: what.** The approach in plain words, including anything non-obvious: edge cases handled, trade-offs, what was deliberately left out.
- **For fix commits:** what the wrong behaviour was, how it was found, and how the fix prevents it from coming back.
- **A tests line** saying what the tests cover, for example `Tests: positive, negative, and suppression cases; fallback via ??, ||, and destructuring default`. Required for `feat` and `fix`.
- No bullet lists of file names. The diff already shows them.

### Full example

```
feat(M1.5): report missing variables with fallbacks as ED009

PRD §11 and decision D5 split missing variables into two cases.
A read without a fallback crashes or misbehaves, so it stays an
ED002 error. A read with a fallback silently runs on a dev default
in production, which is a different risk and warrants a warning.

ED009 fires for an environment only when every reference to the
variable has a fallback; a single reference without one keeps it
as ED002. Destructuring defaults count as fallbacks.

Tests: positive, negative, and suppression cases; mixed references
where one lacks a fallback.

Refs: docs/prd.md §11
```

## 1.3 Staged-change rules

- **One task per commit.** All staged files relate to the scope in the subject.
- Never stage `.env` or `.env.*`, except `.env.example`, `.env.sample`, `.env.template`, or files under a `fixtures/` directory.
- No staged file over 1 MB. No build output, coverage or `node_modules` (`dist/`, `build/`, `coverage/`, `node_modules/`, `.stryker-tmp/`, `.vitest/`, `reports/`).
- If any file in `packages/*/src` changes, a test file in the same package (`packages/*/test/`) must change too, unless a `No-test-reason` trailer is present.
- If a file in `packages/core/src/rules` changes, `docs/rules.md` must also change, or the body must say why not (mention `docs/rules.md`).
- If anything in `packages/core/src/extract` changes, `docs/patterns-catalogue.md` must also change, or the body must say why not (mention `docs/patterns-catalogue.md`).
- If any `package.json` gains a dependency, a matching `Dependency:` trailer is required.
- `npm test` and `npm run typecheck` pass. They run against the **working tree**, not an isolated copy of the staged files.
- No obvious secrets in the added lines of the staged diff: the prefixes `sk_live_`, `sk_test_`, `ghp_`, `github_pat_`, `AKIA`, `ASIA`, `xoxb-`, `xoxp-`, `AIza`, `-----BEGIN`, and any token of 20+ characters with Shannon entropy ≥ 3.5 bits per character. A token is a run of letters, digits and `+ _ = -`; it must contain both a letter and a digit. Git object IDs and sha256 digests (exactly 40 or 64 hex characters) are not treated as secrets. Not scanned: `package-lock.json`, files under `fixtures/`, and the scanner's own files (`scripts/commit-checks/` and this document), which have to name the prefixes and test them with fake keys.
- Once the EnvDrift CLI exists (`packages/cli/dist/bin.js`), `envdrift scan --fail-on error` passes on the repo. Until then this check is **skipped**, and the output says so.

## 1.4 Review gate

- Commits of type `feat`, `fix` or `refactor` need a review report in `docs/reviews/` that records a `Staged-diff-sha256:` equal to the hash of the current staged diff, with no BLOCKER and no HIGH findings.
- The hash is `sha256` of `git diff --cached --no-color --no-ext-diff -- . ':(exclude)docs/reviews'`. The report files are excluded, otherwise staging the report would change the very hash it records. If nothing is staged the value is `none`.
- The `envdrift-code-review` skill writes this line in every report.

## Where each rule is checked

| Rule | `pre-commit` | `commit-msg` | Skill |
|---|---|---|---|
| 1.1 subject format, scope, length, trailers | | ✔ | ✔ (before committing) |
| 1.2 vague summary, < 3 words, tense, body, tests line, file-name-only body | | ✔ | ✔ + writes it |
| 1.3 `.env` files, size, build output, secrets | ✔ | | ✔ |
| 1.3 `npm test`, typecheck, dogfood | ✔ | | ✔ |
| 1.3 tests for source, `docs/rules.md`, patterns catalogue, `Dependency:` | | ✔ (needs the message) | ✔ |
| 1.3 one task per commit | | | ✔ (not mechanically checkable) |
| 1.4 review gate | | ✔ (needs the commit type) | ✔ (runs the review if missing) |

`FAST=1` skips `npm test` and typecheck in `pre-commit` for commits whose staged files are all under `docs/` or are Markdown. It never skips them when anything else is staged.

## What is not enforced, and why

- "Says what the commit does to the product" and "specific enough": a hook cannot judge meaning. The vague-word list, the three-word minimum and the tense check are heuristics on the summary only. Irregular past tense ("wrote") is not caught. First words ending in `ed` or `ing` that are real imperative verbs are allowed: embed, seed, feed, bring, string, proceed, succeed, exceed, speed, need, breed, bleed, shred, sing, ring, spring, swing, sting, cling, wring, thing.
- A `Co-Authored-By` trailer: this repository does not use one unless the owner asks for it, and no hook checks for or against it.
- That the "why" is true, that the tests line matches what the staged tests cover, and that every behavioural claim was verified. The skill checks this against the diff and by running things; a hook cannot.
- Bypassing the hooks (`git commit --no-verify`) is possible for you. The `envdrift-commit` skill never does it.
