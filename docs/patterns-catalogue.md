# Extraction patterns catalogue

> **Status: DRAFT (M0.0, 9 Oct). Owner review required before M0.2 locks it.** Rows marked ⚠ are judgement calls: please confirm or change them.

This is the **only** definition of what `packages/core/src/extract/js.ts` recognises ([PRD §10.1](prd.md#101-jsts-extraction)). Adding a pattern takes one commit containing three things: a catalogue row, a test named with the row ID, and the implementation. Use `/add-pattern` for this.

## Conventions

- **Output**: `R(name, via, fallback)` = one `Reference`. `D(kind)` = one `DynamicAccess`. `∅` = no output.
- **Position**: `line`/`column` are 1-based and point at the start of the env object expression (`process` or `import`). For destructuring, they point at the destructured property key.
- **Test naming**: `it('P01: process.env.X', …)` in `packages/core/test/extract/js.test.ts`. The ID prefix is mandatory so that `grep P01` finds the row, the test and any ai-log entry.
- **Env objects** recognised: `process.env`, `globalThis.process.env`, `global.process.env`, `import.meta.env`. `process` must not be locally bound (see N03).
- **File types**: `.js .jsx .mjs .cjs .ts .tsx .mts .cts`; `.d.ts` is skipped. One parser config enables `jsx` + `typescript` (for `.ts`, JSX is off so that `<T>x` casts parse).

## P — references

| ID | Pattern | Example | Output | Status |
|---|---|---|---|---|
| P01 | Dot member | `process.env.API_URL` | `R(API_URL, process.env, false)` | draft |
| P02 | String-literal computed member | `process.env['API_URL']`, `process.env["API_URL"]` | `R(API_URL, process.env, false)` | draft |
| P03 | No-expression template member | ``process.env[`API_URL`]`` | `R(API_URL, process.env, false)` | draft |
| P04 | Object destructuring | `const { API_URL, DB_URL } = process.env` | `R(API_URL…)`, `R(DB_URL…)` | draft |
| P05 | Renamed destructuring | `const { API_URL: url } = process.env` | `R(API_URL, process.env, false)` | draft |
| P06 | `import.meta.env` dot member | `import.meta.env.VITE_API_URL` | `R(VITE_API_URL, import.meta.env, false)` | draft |
| P07 | `import.meta.env` literal computed member | `import.meta.env['VITE_API_URL']` | `R(VITE_API_URL, import.meta.env, false)` | draft |
| P08 | Destructuring from `import.meta.env` | `const { VITE_A } = import.meta.env` | `R(VITE_A, import.meta.env, false)` | draft |
| P09 | Optional chaining | `process.env?.API_URL`, `process?.env?.API_URL`, `globalThis.process?.env.X` | `R(API_URL, process.env, false)` | draft |
| P10 | TS / paren wrappers around the env object or the read | `process.env!.X`, `(process.env as Env).X`, `(process.env).X`, `process.env.X!`, `process.env.X as string`, `process.env.X satisfies string` | `R(X, process.env, false)` | draft |
| P11 | Global-qualified process | `globalThis.process.env.X`, `global.process.env.X` | `R(X, process.env, false)` | draft |
| P12 | `in` existence check ⚠ | `if ('X' in process.env)` | `R(X, process.env, true)`. The code handles absence, so it counts as a fallback. | draft ⚠ |
| P13 | Own-property existence check ⚠ | `Object.hasOwn(process.env, 'X')`, `process.env.hasOwnProperty('X')`, `Object.prototype.hasOwnProperty.call(process.env, 'X')` | `R(X, process.env, true)` | draft ⚠ |

## F — fallbacks (`hasFallback: true`)

A fallback means "the app does not crash if the variable is missing". It drives the ED002/ED009 split ([D5](prd.md#6-locked-decisions)).

| ID | Pattern | Example | Output | Status |
|---|---|---|---|---|
| F01 | Nullish coalescing | `process.env.PORT ?? '3000'` | `R(PORT, process.env, true)` | draft |
| F02 | Logical OR | `process.env.PORT \|\| 3000` | `R(PORT, process.env, true)` | draft |
| F03 | Destructuring default | `const { PORT = '3000' } = process.env`, `const { PORT: p = '3000' } = process.env` | `R(PORT, process.env, true)` | draft |
| F04 | Logical assignment ⚠ | `process.env.PORT ??= '3000'`, `process.env.PORT \|\|= '3000'` | `R(PORT, process.env, true)`. Read-then-default, so it is a reference, not a write (contrast N02). | draft ⚠ |
| F05 | Fallback through wrappers | `(process.env.PORT as string) ?? '3000'`, `(process.env.PORT!) \|\| x`, `process.env?.PORT ?? x` | `R(PORT, process.env, true)` | draft |

Not fallbacks: ternaries (`process.env.X ? a : b`), `if (!process.env.X) throw`, `&&`. The left side of `??`/`||` must **be** the read (after unwrapping parens or TS wrappers), not contain it. For example, `foo(process.env.X) ?? y` gives `R(X, …, false)`.

## D — dynamic access (`DynamicAccess`, reported as ED005, never followed — D4)

| ID | Pattern | Example | Output | Status |
|---|---|---|---|---|
| D01 | Computed non-literal key | `process.env[name]`, `import.meta.env[key]`, `process.env[KEYS.API]` | `D(computed-key)` | draft |
| D02 | Template with expressions | ``process.env[`${prefix}_URL`]`` | `D(computed-key)` | draft |
| D03 | Rest destructuring | `const { A, ...rest } = process.env` | `R(A…)` **and** `D(rest-destructuring)` | draft |
| D04 | Alias | `const env = process.env`, `let e; e = process.env`, `const { env } = process`, `const env = import.meta.env` | `D(alias)`. Later reads through `env.X` are **not** followed. | draft |
| D05 | Whole-object escape ⚠ | `fn(process.env)`, `{ ...process.env }`, `Object.keys(process.env)`, `Object.entries(import.meta.env)`, `for (const k in process.env)` | `D(alias)`. The object leaves static view. | draft ⚠ |

## N — negatives (`∅`, must produce nothing)

| ID | Pattern | Example | Output | Status |
|---|---|---|---|---|
| N01 | Comments and strings | `// process.env.OLD`, `'process.env.X'`, `` `see process.env.X` `` (template text, not expression) | `∅` | draft |
| N02 | Writes and deletes ⚠ | `process.env.X = 'v'`, `delete process.env.X`, `Object.assign(process.env, {...})` → the last one is D05 | `∅`. The app sets the variable, so it is not required from config. | draft ⚠ |
| N03 | Shadowed `process` / non-env objects | `function f(process) { process.env.X }`, `const process = mock; process.env.X`, `foo.meta.env.X`, `myObj.env.X` | `∅` | draft |

## A — accessors (planned, M1.6, [D7](prd.md#6-locked-decisions))

Configured with `accessors: [getEnv, env.get, config.get]`. The callee matches as an identifier or as a member path.

| ID | Pattern | Example | Output | Status |
|---|---|---|---|---|
| A01 | Literal first argument | `getEnv('API_URL')`, ``config.get(`API_URL`)`` | `R(API_URL, accessor, false)` | planned M1.6 |
| A02 | Default via second argument | `getEnv('PORT', '3000')` | `R(PORT, accessor, true)` | planned M1.6 |
| A03 | Default via `??` / `\|\|` | `getEnv('PORT') ?? '3000'` | `R(PORT, accessor, true)` | planned M1.6 |
| A04 | Non-literal first argument | `getEnv(name)`, ``getEnv(`${p}_URL`)`` | `D(computed-key)` | planned M1.6 |

## Pre-filter and failure behaviour

- A file whose text contains neither `env` nor any configured accessor name is skipped without parsing. It still counts as **scanned** for ED003's "N scanned files".
- A parse failure produces a warning (`<file>: parse error at L:C — skipped`). The file is counted as skipped and the scan continues. The message never includes source text.
