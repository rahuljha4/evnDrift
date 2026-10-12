# TypeScript checklist

Sources: `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), `eslint.config.js`, CLAUDE.md hard rule 6. Typecheck and lint failures are **BLOCKER** (they show in pre-flight); the rest are usually MEDIUM unless they hide a defect.

- [ ] No `any` (explicit or via `as any`) without a comment on the same or previous line saying why. Prefer `unknown` plus narrowing for parser output and JSON.
- [ ] No non-null assertion `!` and no unchecked `as T` on untrusted input (file text, YAML/JSON, AST nodes from Babel, config before zod). Index access under `noUncheckedIndexedAccess` is handled, not silenced with `!`.
- [ ] No `@ts-ignore` / `@ts-expect-error` without an explanation; no eslint-disable without one.
- [ ] Errors are handled where they happen: per-file work is wrapped so one failure becomes a warning (hard rule 6); `catch` blocks do not swallow silently, and do not forward third-party messages (they can quote values).
- [ ] Functions are small and pure where possible; no module-level mutable state in core; no hidden dependence on call order.
- [ ] Exhaustive `switch` over unions (a `default` that fails the type check for new members) rather than a silent fallthrough.
- [ ] Types express the invariants: literal unions for `via`/`kind`/severity, `readonly` for constants, no optional property where the data model says required (`Finding.fingerprint`, `Location.line`).
- [ ] Type-only imports use `import type` (lint rule); ESM `.ts` extensions in relative imports match the surrounding code; no default-export surprises.
- [ ] Comments follow the surrounding density; no dead code, commented-out code or TODO without a task ID.
- [ ] Regexes on untrusted text are linear (no nested quantifiers); loops over untrusted input are bounded.
