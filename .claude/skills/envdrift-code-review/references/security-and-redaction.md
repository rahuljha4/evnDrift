# Security and redaction checklist

Sources: PRD §6 D6, §15; `docs/system/security.md` (SEC-01..13); ADR 0006. A confirmed leak path is a **BLOCKER**.

## Values never leave parsers (D6, SEC-01)
- [ ] No exported type, interface or returned object has a property named `value`, or carries a raw config value under another name (`raw`, `content`, `text`, `line`, `original`, `snippet`). The pre-flight `VALUE_PROP` check only catches the literal name.
- [ ] A value is a local variable inside `parse/*` only. It is never assigned to a returned object, pushed into an array, stored in a Map, or put in a closure that outlives the call.
- [ ] `looksLikeSecret` (and any value-dependent check) is called **only** inside parsers; `secrets.ts` is not re-exported from the core barrel.
- [ ] Parsers return only `envdrift-ignore` comment lines, sanitised to the directive and rule IDs. Other comment text can hold a commented-out secret.
- [ ] `fix --example` edits lines as opaque strings and never prints them; its dry-run diff shows key names only.

## Output channels (SEC-08, T-01..T-05)
- [ ] Warnings, errors, findings, `message`, `fix`, `note`, snapshots, test names and logs contain names, paths, line numbers, rule IDs and counts only.
- [ ] No warning, error or log interpolates a variable that holds file content (`line`, `raw`, `text`, `content`, `value`, `match`, `snippet`). Pre-flight `WARN_LEAK` catches the common spellings; read every `warnings.push` and `new Error` in the diff for the rest. Each leak path is its own BLOCKER finding.
- [ ] Third-party errors (Babel, YAML, zod, AWS SDK) are re-wrapped as `file:line` or `path expected-type`; their `.message` is not forwarded because it can quote source text.
- [ ] No stack traces by default (`DEBUG=envdrift` only). No debug logging of parsed content.
- [ ] SARIF has no `snippet` or `contextRegion`; markdown and SARIF reporters receive `Finding`s only.
- [ ] Test fixtures use obviously fake values (planted markers such as `ENVDRIFT_PLANTED`), never real keys.

## File and process safety (SEC-02, SEC-04, T-06..T-10)
- [ ] Read-only: only `commands/init.ts` and `commands/fix.ts` import write APIs.
- [ ] Walker: realpath containment (no following a symlink out of the root), size limit, binary skip (NUL in first 8 KB), no unbounded recursion.
- [ ] YAML parsing: no custom tags, bounded alias count, `__proto__` / `constructor` keys not merged into objects (null-prototype maps, strict zod objects).
- [ ] No regex with nested quantifiers on untrusted input (ReDoS); length capped before entropy calculation.
- [ ] Per-file try/catch so a hostile or huge file produces a warning, not a crash or hang.

## Network and AWS (SEC-03, SEC-05, SEC-06)
- [ ] No network or telemetry unless an `aws-ssm` source is configured; `@aws-sdk/client-ssm` is lazy-imported (`await import`) only in `sources/aws-ssm.ts`.
- [ ] `GetParametersByPath` with `WithDecryption: false`; values are never inspected (`hasValue: true`, `looksSecret: false`).
- [ ] Action permissions are minimal (`contents: read`; `pull-requests: write` only for comments).
- [ ] No new dependency without exact pin, justification and a `dependencies.md` row.
