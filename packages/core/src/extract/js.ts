// JS/TS source -> References and DynamicAccesses. PRD §10.1, FR-SRC-01..04, ADR 0001.
// The supported patterns are defined ONLY in docs/patterns-catalogue.md (CLAUDE.md rule 4).
// Parsing: @babel/parser. Walking: hand-written (no @babel/traverse, no @babel/types).
// A reference holds a variable NAME, never a value (ADR 0006).

import { parse } from '@babel/parser';
import type { ParserPlugin } from '@babel/parser';
import { sanitizeDirective } from '../directive.ts';
import type { CommentLine, DynamicAccess, Reference } from '../types.ts';

export interface ExtractResult {
  references: Reference[];
  dynamic: DynamicAccess[];
  /** Only `envdrift-ignore` comments, sanitised (see directive.ts). */
  comments: CommentLine[];
  warnings: string[];
  /** false -> the file is counted as skipped. */
  parsed: boolean;
}

/** FR-SRC-02: a file whose text has neither `env` nor an accessor name is not parsed. */
export function shouldParse(text: string, accessors: string[]): boolean {
  if (text.includes('env')) return true;
  return accessors.some((a) => a !== '' && text.includes(a));
}

// ---- minimal structural AST access -------------------------------------------------

interface Node {
  type: string;
  [key: string]: unknown;
}

const isNode = (v: unknown): v is Node =>
  typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';

const get = (n: Node, key: string): Node | null => {
  const v = n[key];
  return isNode(v) ? v : null;
};

const list = (n: Node, key: string): Node[] => {
  const v = n[key];
  return Array.isArray(v) ? (v as unknown[]).filter(isNode) : [];
};

const SKIP_KEYS = new Set([
  'type',
  'start',
  'end',
  'loc',
  'range',
  'extra',
  'leadingComments',
  'trailingComments',
  'innerComments',
  'comments',
  'errors',
  'tokens',
]);

function children(n: Node): Node[] {
  const out: Node[] = [];
  for (const key of Object.keys(n)) {
    if (SKIP_KEYS.has(key)) continue;
    const v = n[key];
    if (Array.isArray(v)) {
      for (const item of v) if (isNode(item)) out.push(item);
    } else if (isNode(v)) {
      out.push(v);
    }
  }
  return out;
}

interface Pos {
  line: number;
  column: number;
}

/** Babel columns are 0-based; the data model is 1-based (invariant I2). */
function pos(n: Node): Pos {
  const loc = n['loc'] as { start?: { line?: number; column?: number } } | null | undefined;
  return { line: loc?.start?.line ?? 1, column: (loc?.start?.column ?? 0) + 1 };
}

const TS_WRAPPERS = new Set([
  'TSNonNullExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'ParenthesizedExpression',
  'TypeCastExpression',
]);

function unwrap(node: Node): Node {
  let n = node;
  while (TS_WRAPPERS.has(n.type)) {
    const inner = get(n, 'expression');
    if (inner === null) break;
    n = inner;
  }
  return n;
}

const isIdent = (n: Node | null, name: string): boolean =>
  n !== null && n.type === 'Identifier' && n['name'] === name;

const isMember = (n: Node): boolean =>
  n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression';

// ---- shadow tracking for the identifier `process` (catalogue N03) ------------------

const FUNCTIONS = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ObjectMethod',
  'ClassMethod',
  'ClassPrivateMethod',
]);

/** `import process from 'node:process'` is the real `process`, so it does not shadow. */
const PROCESS_MODULES = new Set(['process', 'node:process']);

const NAME = 'process';

function binds(p: Node | null): boolean {
  if (p === null) return false;
  switch (p.type) {
    case 'Identifier':
      return p['name'] === NAME;
    case 'ObjectPattern':
      return list(p, 'properties').some((prop) =>
        prop.type === 'ObjectProperty' ? binds(get(prop, 'value')) : binds(prop),
      );
    case 'ArrayPattern':
      return list(p, 'elements').some(binds);
    case 'AssignmentPattern':
      return binds(get(p, 'left'));
    case 'RestElement':
      return binds(get(p, 'argument'));
    case 'TSParameterProperty':
      return binds(get(p, 'parameter'));
    default:
      return false;
  }
}

function hoistsVar(n: Node, isRoot: boolean): boolean {
  if (!isRoot && (FUNCTIONS.has(n.type) || n.type === 'StaticBlock')) return false;
  if (n.type === 'VariableDeclaration' && n['kind'] === 'var' && n['declare'] !== true) {
    if (list(n, 'declarations').some((d) => binds(get(d, 'id')))) return true;
  }
  return children(n).some((c) => hoistsVar(c, false));
}

function declaresLexically(statements: Node[]): boolean {
  for (const st of statements) {
    const d = st.type.startsWith('Export') ? (get(st, 'declaration') ?? st) : st;
    switch (d.type) {
      case 'VariableDeclaration':
        if (d['kind'] !== 'var' && d['declare'] !== true) {
          if (list(d, 'declarations').some((x) => binds(get(x, 'id')))) return true;
        }
        break;
      case 'ClassDeclaration':
      case 'FunctionDeclaration':
      case 'TSEnumDeclaration':
      case 'TSModuleDeclaration':
        if (binds(get(d, 'id'))) return true;
        break;
      case 'ImportDeclaration': {
        const source = get(d, 'source');
        if (source !== null && PROCESS_MODULES.has(source['value'] as string)) break;
        if (list(d, 'specifiers').some((sp) => binds(get(sp, 'local')))) return true;
        break;
      }
      default:
    }
  }
  return false;
}

function scopeShadows(n: Node): boolean {
  switch (n.type) {
    case 'Program':
      return declaresLexically(list(n, 'body')) || hoistsVar(n, true);
    case 'StaticBlock':
      return declaresLexically(list(n, 'body')) || hoistsVar(n, true);
    case 'BlockStatement':
    case 'TSModuleBlock':
      return declaresLexically(list(n, 'body'));
    case 'SwitchStatement':
      // `case` clauses share one lexical scope.
      return list(n, 'cases').some((c) => declaresLexically(list(c, 'consequent')));
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
    case 'ObjectMethod':
    case 'ClassMethod':
    case 'ClassPrivateMethod': {
      if (list(n, 'params').some(binds)) return true;
      if (n.type === 'FunctionExpression' && binds(get(n, 'id'))) return true;
      const body = get(n, 'body');
      return body !== null && hoistsVar(body, true);
    }
    case 'CatchClause':
      return binds(get(n, 'param'));
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement': {
      const head = get(n, n.type === 'ForStatement' ? 'init' : 'left');
      return (
        head !== null &&
        head.type === 'VariableDeclaration' &&
        head['kind'] !== 'var' &&
        list(head, 'declarations').some((d) => binds(get(d, 'id')))
      );
    }
    case 'ClassExpression':
      return binds(get(n, 'id'));
    default:
      return false;
  }
}

// ---- env object recognition ---------------------------------------------------------

type Via = Reference['via'];

/** `process`, `globalThis.process`, `global.process` (P11). `process` must be unshadowed (N03). */
function isProcess(node: Node, shadowed: boolean): boolean {
  const n = unwrap(node);
  if (isIdent(n, 'process')) return !shadowed;
  if (isMember(n) && n['computed'] !== true && isIdent(get(n, 'property'), 'process')) {
    const obj = get(n, 'object');
    if (obj === null) return false;
    const o = unwrap(obj);
    return isIdent(o, 'globalThis') || isIdent(o, 'global');
  }
  return false;
}

/** If `node` is the env object (`process.env` or `import.meta.env`), say which. */
function envObject(node: Node, shadowed: boolean): Via | null {
  const n = unwrap(node);
  if (!isMember(n) || n['computed'] === true || !isIdent(get(n, 'property'), 'env')) return null;
  const objRaw = get(n, 'object');
  if (objRaw === null) return null;
  const obj = unwrap(objRaw);
  if (isProcess(obj, shadowed)) return 'process.env';
  if (obj.type === 'MetaProperty') {
    const meta = get(obj, 'meta');
    const prop = get(obj, 'property');
    if (isIdent(meta, 'import') && isIdent(prop, 'meta')) return 'import.meta.env';
  }
  return null;
}

const DYNAMIC = Symbol('dynamic');

/** Static name of a literal key, DYNAMIC for a non-literal computed key, null to ignore. */
function literalKey(key: Node | null): string | typeof DYNAMIC {
  if (key === null) return DYNAMIC;
  if (key.type === 'StringLiteral') return key['value'] as string;
  if (key.type === 'TemplateLiteral' && list(key, 'expressions').length === 0) {
    const first = list(key, 'quasis')[0];
    const cooked = (first?.['value'] as { cooked?: string | null } | undefined)?.cooked;
    if (typeof cooked === 'string') return cooked;
  }
  return DYNAMIC;
}

// ---- extraction ---------------------------------------------------------------------

function pluginsFor(file: string): ParserPlugin[] {
  const dot = file.lastIndexOf('.');
  const ext = dot === -1 ? '' : file.slice(dot).toLowerCase();
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') return ['typescript'];
  if (ext === '.tsx') return ['typescript', 'jsx'];
  return ['jsx'];
}

function failure(file: string, loc: { line?: number; column?: number } | undefined, tail: string) {
  const at = loc?.line !== undefined ? `${loc.line}:${(loc.column ?? 0) + 1}` : '1:1';
  return `${file}: parse error at ${at} — ${tail}`;
}

export function extract(text: string, file: string, opts: { accessors: string[] }): ExtractResult {
  // Accessors (D7) arrive in M1.6; only the pre-filter uses them for now.
  void opts;

  const result: ExtractResult = {
    references: [],
    dynamic: [],
    comments: [],
    warnings: [],
    parsed: false,
  };

  let ast: Node;
  let recovered: { line?: number; column?: number } | undefined;
  let comments: Node[];
  try {
    const parsed = parse(text, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      plugins: pluginsFor(file),
    });
    ast = parsed as unknown as Node;
    comments = list(ast, 'comments');
    const errors = (parsed as unknown as { errors?: { loc?: Pos }[] }).errors ?? [];
    if (errors.length > 0) recovered = errors[0]?.loc ?? {};
  } catch (e) {
    if (e instanceof RangeError) {
      result.warnings.push(`${file}: too deeply nested — skipped`);
    } else {
      const loc = (e as { loc?: { line?: number; column?: number } }).loc;
      result.warnings.push(failure(file, loc, 'skipped'));
    }
    return result;
  }

  const references: Reference[] = [];
  const dynamic: DynamicAccess[] = [];

  const addRef = (name: string, at: Pos, via: Via, hasFallback: boolean) =>
    references.push({ name, file, line: at.line, column: at.column, via, hasFallback });
  const addDyn = (kind: DynamicAccess['kind'], at: Pos) =>
    dynamic.push({ file, line: at.line, column: at.column, kind });

  /** Emit a reference for `<env>.X` / `<env>[...]` if `node` is one. Returns true if consumed. */
  function tryRead(node: Node, shadowed: boolean, hasFallback: boolean): boolean {
    const m = unwrap(node);
    if (!isMember(m)) return false;
    const objRaw = get(m, 'object');
    if (objRaw === null) return false;
    const via = envObject(objRaw, shadowed);
    if (via === null) return false;
    const at = pos(unwrap(objRaw));
    const prop = get(m, 'property');
    if (m['computed'] === true) {
      const key = literalKey(prop);
      if (key === DYNAMIC) addDyn('computed-key', at);
      else addRef(key, at, via, hasFallback);
      if (prop !== null && key === DYNAMIC) walk(prop, shadowed);
    } else if (prop !== null && prop.type === 'Identifier') {
      addRef(prop['name'] as string, at, via, hasFallback);
    }
    return true;
  }

  function destructure(pattern: Node, via: Via, shadowed: boolean): void {
    for (const prop of list(pattern, 'properties')) {
      if (prop.type === 'RestElement') {
        addDyn('rest-destructuring', pos(prop));
        continue;
      }
      if (prop.type !== 'ObjectProperty') continue;
      const key = get(prop, 'key');
      if (key === null) continue;
      let name: string | typeof DYNAMIC | null;
      if (prop['computed'] === true) {
        name = literalKey(key);
        if (name === DYNAMIC) walk(key, shadowed);
      } else if (key.type === 'Identifier') name = key['name'] as string;
      else if (key.type === 'StringLiteral') name = key['value'] as string;
      else name = null;

      const value = get(prop, 'value');
      const hasFallback = value !== null && value.type === 'AssignmentPattern';
      if (value !== null && hasFallback) {
        const dflt = get(value, 'right');
        if (dflt !== null) walk(dflt, shadowed);
      }
      if (name === DYNAMIC) addDyn('computed-key', pos(key));
      else if (name !== null) addRef(name, pos(key), via, hasFallback);
    }
  }

  function walkChildren(n: Node, shadowed: boolean): void {
    for (const c of children(n)) walk(c, shadowed);
  }

  function walk(n: Node, outer: boolean): void {
    const shadowed = outer || scopeShadows(n);

    switch (n.type) {
      case 'MemberExpression':
      case 'OptionalMemberExpression':
        if (tryRead(n, shadowed, false)) return;
        if (envObject(n, shadowed) !== null) return; // bare env object: N05, nothing to report
        break;

      case 'LogicalExpression': {
        const op = n['operator'];
        const left = get(n, 'left');
        if ((op === '??' || op === '||') && left !== null && tryRead(left, shadowed, true)) {
          const right = get(n, 'right');
          if (right !== null) walk(right, shadowed);
          return;
        }
        break;
      }

      case 'CallExpression':
      case 'OptionalCallExpression': {
        // N04: process.env.hasOwnProperty('X') is an existence check, not a read.
        const calleeRaw = get(n, 'callee');
        const callee = calleeRaw === null ? null : unwrap(calleeRaw);
        if (
          callee !== null &&
          isMember(callee) &&
          callee['computed'] !== true &&
          isIdent(get(callee, 'property'), 'hasOwnProperty')
        ) {
          const obj = get(callee, 'object');
          if (obj !== null && envObject(obj, shadowed) !== null) {
            for (const a of list(n, 'arguments')) walk(a, shadowed);
            return;
          }
        }
        break;
      }

      case 'VariableDeclarator': {
        const id = get(n, 'id');
        const init = get(n, 'init');
        if (id !== null && init !== null) {
          const via = envObject(init, shadowed);
          if (via !== null) {
            if (id.type === 'ObjectPattern') destructure(id, via, shadowed);
            else addDyn('alias', pos(unwrap(init))); // D04
            return;
          }
          if (id.type === 'ObjectPattern' && isProcess(init, shadowed)) {
            // const { env } = process  (D04)
            for (const prop of list(id, 'properties')) {
              const key = prop.type === 'ObjectProperty' ? get(prop, 'key') : null;
              if (
                key !== null &&
                prop['computed'] !== true &&
                (isIdent(key, 'env') || (key.type === 'StringLiteral' && key['value'] === 'env'))
              ) {
                addDyn('alias', pos(key));
              }
            }
            return;
          }
        }
        break;
      }

      case 'AssignmentExpression': {
        const left = get(n, 'left');
        const right = get(n, 'right');
        if (left !== null && right !== null) {
          const via = envObject(right, shadowed);
          if (via !== null) {
            if (left.type === 'ObjectPattern') destructure(left, via, shadowed);
            else {
              walk(left, shadowed); // a write target such as process.env.X is a P12 reference
              addDyn('alias', pos(unwrap(right))); // e = process.env  (D04)
            }
            return;
          }
        }
        break;
      }

      default:
    }

    walkChildren(n, shadowed);
  }

  try {
    walk(ast, false);
  } catch (e) {
    if (e instanceof RangeError) {
      result.warnings.push(`${file}: too deeply nested — skipped`);
      return result;
    }
    throw e;
  }

  // Deterministic output (CLAUDE.md rule 5): never rely on visit order.
  const byPos = <T extends { line: number; column: number }>(a: T, b: T) =>
    a.line - b.line || a.column - b.column;
  references.sort((a, b) => byPos(a, b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  dynamic.sort((a, b) => byPos(a, b) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));

  for (const c of comments) {
    const value = typeof c['value'] === 'string' ? c['value'] : '';
    const body = c.type === 'CommentBlock' ? value.replace(/^[\s*]+/, '') : value;
    const text = sanitizeDirective(body, true);
    if (text !== null) result.comments.push({ line: pos(c).line, text });
  }

  if (recovered !== undefined) result.warnings.push(failure(file, recovered, 'recovered'));
  result.references = references;
  result.dynamic = dynamic;
  result.parsed = true;
  return result;
}
