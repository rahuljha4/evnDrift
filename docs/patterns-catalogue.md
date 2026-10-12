# Extraction patterns catalogue

> **Status: LOCKED (M0.2, 12 Oct).** Owner review done: the ⚠ judgement calls were decided (see [Retired and changed IDs](#retired-and-changed-ids)). Changing a row needs a PRD change-log entry.

This is the **only** definition of what `packages/core/src/extract/js.ts` recognises ([PRD §10.1](prd.md#101-jsts-extraction)). Adding a pattern takes one commit containing three things: a catalogue row, a test named with the row ID, and the implementation. Use `/add-pattern` for this.

## Conventions

- **Output**: `R(name, via, fallback)` = one `Reference`. `D(kind)` = one `DynamicAccess`. `∅` = no output.
- **Position**: `line`/`column` are 1-based and point at the start of the env object expression (`process` or `import`). For destructuring, they point at the destructured property key (or at the `...` of a rest element). For `const { env } = process` they point at the `env` key.
- **Test naming**: `it('P01: process.env.X', …)` in `packages/core/test/extract/js.test.ts`. The ID prefix is mandatory so that `grep P01` finds the row, the test and any ai-log entry.
- **Env objects** recognised: `process.env`, `globalThis.process.env`, `global.process.env`, `import.meta.env`. `process` must not be locally bound (see N03).
- **File types**: `.js .jsx .mjs .cjs .ts .tsx .mts .cts`; `.d.ts` is skipped. One parser config enables `jsx` + `typescript` (for `.ts`, JSX is off so that `<T>x` casts parse).

## P — references

| ID | Pattern | Example | Output | Status |
|---|---|---|---|---|
| P01 | Dot member | `process.env.API_URL` | `R(API_URL, process.env, false)` | done |
| P02 | String-literal computed member | `process.env['API_URL']`, `process.env["API_URL"]` | `R(API_URL, process.env, false)` | done |
| P03 | No-expression template member | ``process.env[`API_URL`]`` | `R(API_URL, process.env, false)` | done |
| P04 | Object destructuring | `const { API_URL, DB_URL } = process.env` | `R(API_URL…)`, `R(DB_URL…)` | done |
| P05 | Renamed destructuring | `const { API_URL: url } = process.env` | `R(API_URL, process.env, false)` | done |
| P06 | `import.meta.env` dot member | `import.meta.env.VITE_API_URL` | `R(VITE_API_URL, import.meta.env, false)` | done |
| P07 | `import.meta.env` literal computed member | `import.meta.env['VITE_API_URL']` | `R(VITE_API_URL, import.meta.env, false)` | done |
| P08 | Destructuring from `import.meta.env` | `const { VITE_A } = import.meta.env` | `R(VITE_A, import.meta.env, false)` | done |
| P09 | Optional chaining | `process.env?.API_URL`, `process?.env?.API_URL`, `globalThis.process?.env.X` | `R(API_URL, process.env, false)` | done |
| P10 | TS / paren wrappers around the env object or the read | `process.env!.X`, `(process.env as Env).X`, `(process.env).X`, `process.env.X!`, `process.env.X as string`, `process.env.X satisfies string` | `R(X, process.env, false)` | done |
| P11 | Global-qualified process | `globalThis.process.env.X`, `global.process.env.X` | `R(X, process.env, false)` | done |
| P12 | Write, delete or compound-assignment target | `process.env.X = 'v'`, `delete process.env.X`, `process.env.X += 'a'`, `process.env.X ??= 'd'`, `process.env.X \|\|= 'd'` | `R(X, process.env, false)`. Owner decision (M0.2): a write still names the variable, so it is reported. `??=` / `\|\|=` get **no** fallback. | done |

## F — fallbacks (`hasFallback: true`)

A fallback means "the app does not crash if the variable is missing". It drives the ED002/ED009 split ([D5](prd.md#6-locked-decisions)).

| ID | Pattern | Example | Output | Status |
|---|---|---|---|---|
| F01 | Nullish coalescing | `process.env.PORT ?? '3000'` | `R(PORT, process.env, true)` | done |
| F02 | Logical OR | `process.env.PORT \|\| 3000` | `R(PORT, process.env, true)` | done |
| F03 | Destructuring default | `const { PORT = '3000' } = process.env`, `const { PORT: p = '3000' } = process.env` | `R(PORT, process.env, true)` | done |
| F05 | Fallback through wrappers | `(process.env.PORT as string) ?? '3000'`, `(process.env.PORT!) \|\| x`, `process.env?.PORT ?? x` | `R(PORT, process.env, true)` | done |

Not fallbacks: ternaries (`process.env.X ? a : b`), `if (!process.env.X) throw`, `&&`. The left side of `??`/`||` must **be** the read (after unwrapping parens or TS wrappers), not contain it. For example, `foo(process.env.X) ?? y` gives `R(X, …, false)`.

## D — dynamic access (`DynamicAccess`, reported as ED005, never followed — D4)

| ID | Pattern | Example | Output | Status |
|---|---|---|---|---|
| D01 | Computed non-literal key, as a read, a write target, or a destructuring key | `process.env[name]`, `import.meta.env[key]`, `process.env[KEYS.API]`, `process.env[k] = v`, `const { [k]: v } = process.env`. Reads nested inside the key (`process.env[process.env.K]`) are reported too. | `D(computed-key)` | done |
| D02 | Template with expressions | ``process.env[`${prefix}_URL`]`` | `D(computed-key)` | done |
| D03 | Rest destructuring | `const { A, ...rest } = process.env` | `R(A…)` **and** `D(rest-destructuring)` | done |
| D04 | Alias | `const env = process.env`, `let e; e = process.env`, `const { env } = process`, `const env = import.meta.env`, `x.y = process.env` | `D(alias)`. Later reads through `env.X` are **not** followed. | done |

## N — negatives (`∅`, must produce nothing)

| ID | Pattern | Example | Output | Status |
|---|---|---|---|---|
| N01 | Comments and strings | `// process.env.OLD`, `'process.env.X'`, `` `see process.env.X` `` (template text, not expression) | `∅` | done |
| N03 | Shadowed `process` / non-env objects | `function f(process) { process.env.X }`, `const process = mock; process.env.X`, `foo.meta.env.X`, `myObj.env.X`. Not shadowing (still a read): `import process from 'node:process'` (or `'process'`) and `declare const process`. | `∅` (read for the two non-shadowing cases) | done |
| N04 | Existence checks | `'X' in process.env`, `Object.hasOwn(process.env, 'X')`, `process.env.hasOwnProperty('X')`, `Object.prototype.hasOwnProperty.call(process.env, 'X')` | `∅`. Owner decision (M0.2): not treated as a read. | done |
| N05 | Whole-object escape | `fn(process.env)`, `{ ...process.env }`, `Object.keys(process.env)`, `Object.entries(import.meta.env)`, `Object.assign(process.env, {...})`, `for (const k in process.env)` | `∅`. Owner decision (M0.2): no `D(alias)` is raised for escapes. Only declarations (D04) are aliases. | done |

## A — accessors (planned, M1.6, [D7](prd.md#6-locked-decisions))

Configured with `accessors: [getEnv, env.get, config.get]`. The callee matches as an identifier or as a member path.

| ID | Pattern | Example | Output | Status |
|---|---|---|---|---|
| A01 | Literal first argument | `getEnv('API_URL')`, ``config.get(`API_URL`)`` | `R(API_URL, accessor, false)` | planned M1.6 |
| A02 | Default via second argument | `getEnv('PORT', '3000')` | `R(PORT, accessor, true)` | planned M1.6 |
| A03 | Default via `??` / `\|\|` | `getEnv('PORT') ?? '3000'` | `R(PORT, accessor, true)` | planned M1.6 |
| A04 | Non-literal first argument | `getEnv(name)`, ``getEnv(`${p}_URL`)`` | `D(computed-key)` | planned M1.6 |

## Retired and changed IDs

Decided in M0.2. IDs are never reused, so `grep` over history stays meaningful.

| Old ID | Draft behaviour | Now |
|---|---|---|
| P13 | `hasOwn` checks → `R(X, true)` | Retired. Behaviour is **N04** (`∅`). |
| P12 (draft) | `'X' in process.env` → `R(X, true)` | Replaced. P12 is now the write/delete row; the `in` check is **N04** (`∅`). |
| F04 | `??=` / `\|\|=` → `R(X, true)` | Retired. Covered by **P12** (`R(X, false)`). |
| D05 | whole-object escape → `D(alias)` | Retired. Behaviour is **N05** (`∅`). |
| N02 | writes and deletes → `∅` | Retired. Behaviour is **P12** (`R(X, false)`). |

## Pre-filter and failure behaviour

- A file whose text contains neither `env` nor any configured accessor name is skipped without parsing. It still counts as **scanned** for ED003's "N scanned files".
- A parse failure produces a warning (`<file>: parse error at L:C — skipped`). The file is counted as skipped and the scan continues. The message never includes source text or the parser's own message.
- A recoverable syntax error (Babel `errorRecovery`) produces `<file>: parse error at L:C — recovered`. The file is still walked and counts as parsed.
- A file nested so deeply that the walker overflows the stack produces `<file>: too deeply nested — skipped`.
- Shadowing (N03) is tracked for the identifier `process` only: parameters, named function expression ids, `var` (function-hoisted), `let`/`const`/`class`/`function`/`import` (block-scoped), `catch` parameters, `switch` case clauses, class `static` blocks (their own `var` scope) and TS `enum`/`namespace`. `declare const process` is ambient and does not shadow.
