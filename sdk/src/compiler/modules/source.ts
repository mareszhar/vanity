/** Compiler-owned source inspection and authoring transforms. */

import type { CallExpression, Expression, ObjectExpression, ObjectProperty } from 'oxc-parser'
import { posix } from 'node:path'
import { parseSync, Visitor } from 'oxc-parser'
import { styleAutoImportDeclarations as renderStyleAutoImportDeclarations } from '../auto-imports/autoImportDeclarations'
import { normalizePath } from '../core/path'

// ─── Export-name detection ───────────────────────────────────────────────────

/**
 * Every statically enumerable value export, read from Oxc's module record.
 * Destructuring, aliases, re-exports, comments, and TypeScript-only exports
 * follow parser semantics instead of source-text guesses.
 */
export function styleExportNames(source: string, fileName = 'system.css.ts'): string[] {
  const parsed = parseSync(fileName, source)

  if (parsed.errors.some(error => error.severity === 'Error'))
    return []

  const names = new Set<string>()

  for (const declaration of parsed.module.staticExports) {
    for (const entry of declaration.entries) {
      const name = entry.exportName.name

      if (!entry.isType && name !== null && name !== 'default' && entry.exportName.kind === 'Name')
        names.add(name)
    }
  }

  return [...names]
}

/**
 * Exact ambient globals routed into the style-module role.
 *
 * The declaration references the authored module instead of reconstructing
 * its types, so generic signatures, literal token paths, and overloads stay
 * identical. Plain Vite writes this text to `.vanity/types/vanity-style-auto-imports.d.ts`;
 * Nuxt registers the same text at `.nuxt/vanity-style-auto-imports.d.ts`. Plain
 * Vite also writes a tiny generated `@types/vanity-style-auto-imports` reference
 * bridge so ordinary TypeScript automatic type discovery sees the stable file.
 */
export function styleAutoImportDeclarations(
  sources: readonly import('../auto-imports/autoImportDeclarations').AutoImportDeclarationSource[],
  options: { relativeTo?: string } = {},
): string {
  return renderStyleAutoImportDeclarations(sources, options)
}

// ─── The debug-name transform ────────────────────────────────────────────────

/**
 * Inject declaration names into authoring calls, so emitted identifiers
 * follow the code — rename-symbol renames everything, devtools rules trace
 * back to their export ([spec-ports.md §1], [spec-recipes.md §3]).
 * Oxc identifies declarations and call arguments; edits are insertion-only,
 * so formatting and comments remain byte-for-byte intact around them.
 *
 * Handles module-scope `const` declarations, exported or not (published
 * ports are typically module-local):
 * - `const X = port(value)` → `port(value, { label: 'X' })`;
 *   an existing options object gains the `label` key, an explicit label wins
 * - `const X = class(rule)` / `recipe(…)` / `anatomy(…)` / `keyframes(…)` /
 *   `fontFace(…)` → the call gains `'X'` as its debug id; an explicit id wins
 * - `IDENT.port(...)` and friends — the system-bound forms
 */
export function applyDebugNames(source: string, fileName = 'module.css.ts'): string {
  return applyDebugNamesWithAliases(source, fileName)
}

export function applyDebugNamesWithAliases(
  source: string,
  fileName: string,
  ambientAliases?: ReadonlyMap<string, string>,
): string {
  const parsed = parseSync(fileName, source, { range: true })

  if (parsed.errors.some(error => error.severity === 'Error'))
    return source

  const aliases = getAuthoringAliases(parsed.program, undefined, ambientAliases)
  const edits: Array<{ at: number, text: string }> = []

  new Visitor({
    VariableDeclarator(node) {
      if (node.id.type !== 'Identifier' || node.init?.type !== 'CallExpression')
        return

      const callee = getAuthoringCallee(node.init.callee, aliases)

      if (callee === undefined)
        return

      const name = node.id.name
      const args = node.init.arguments

      if (callee === 'port') {
        if (args.length === 1) {
          edits.push({ at: node.init.end - 1, text: `, { label: '${name}' }` })
        }
        else if (args.length >= 2 && args[1].type === 'ObjectExpression' && !hasObjectKey(args[1], 'label')) {
          edits.push({ at: args[1].start + 1, text: ` label: '${name}',` })
        }

        return
      }

      if (args.length === 1)
        edits.push({ at: node.init.end - 1, text: `, '${name}'` })
    },
  }).visit(parsed.program)

  return applyInsertions(source, edits)
}

const authoringNames = new Set([
  'port',
  'class',
  'recipe',
  'anatomy',
  'keyframes',
  'fontFace',
  'atoms',
])
const sourceAuthoringNames = new Set([
  ...authoringNames,
  'rules',
  'raw',
  'fragment',
  'tdec',
  'createSystem',
  'consolidate',
  'defineTokens',
  'addTokens',
  'add',
])
const tokenBuilderMethodNames = new Set(['add'])

/**
 * Resolve the configured barrel's exported local names back to authoring
 * members. This is deliberately syntactic: the barrel is already read as
 * source to discover its exports, and executing it here would change the
 * compiler's configuration-time behavior.
 */
export function getStyleAutoImportAliases(
  source: string,
  fileName: string,
  names: readonly string[],
): Map<string, string> {
  const parsed = parseSync(fileName, source)

  if (parsed.errors.some(error => error.severity === 'Error'))
    return new Map()

  const aliases = getAuthoringAliases(parsed.program, sourceAuthoringNames)
  const selected = new Set(names)
  const exportedAliases = new Map<string, string>()

  for (const declaration of parsed.module.staticExports) {
    for (const entry of declaration.entries) {
      const exported = entry.exportName.name

      if (
        entry.isType
        || entry.exportName.kind !== 'Name'
        || exported === null
        || !selected.has(exported)
        || entry.localName.kind !== 'Name'
        || entry.localName.name === null
      ) {
        continue
      }

      const member = aliases.get(entry.localName.name)
      if (member !== undefined)
        exportedAliases.set(exported, member)
    }
  }

  return exportedAliases
}

function getAuthoringAliases(
  program: Parameters<Visitor['visit']>[0],
  names = authoringNames,
  ambientAliases?: ReadonlyMap<string, string>,
): Map<string, string> {
  const aliases = new Map([...names].map(name => [name, name]))

  if (ambientAliases !== undefined) {
    for (const [local, imported] of ambientAliases) {
      if (names.has(imported))
        aliases.set(local, imported)
    }
  }

  new Visitor({
    ImportSpecifier(node) {
      const imported = node.imported.type === 'Identifier' ? node.imported.name : String(node.imported.value)

      if (names.has(imported))
        aliases.set(node.local.name, imported)
    },
    VariableDeclarator(node) {
      if (node.id.type === 'Identifier' && node.init?.type === 'MemberExpression') {
        const property = node.init.property
        const member = property.type === 'Identifier'
          ? property.name
          : property.type === 'Literal' && typeof property.value === 'string' ? property.value : undefined

        if (member !== undefined && names.has(member))
          aliases.set(node.id.name, member)

        return
      }

      if (node.id.type !== 'ObjectPattern')
        return

      for (const property of node.id.properties) {
        if (property.type !== 'Property' || property.key.type !== 'Identifier')
          continue

        const imported = property.key.name
        const local = property.value.type === 'Identifier' ? property.value.name : undefined

        if (local !== undefined && names.has(imported))
          aliases.set(local, imported)
      }
    },
  }).visit(program)

  return aliases
}

function getAuthoringCallee(callee: Expression, aliases: Map<string, string>, names = authoringNames): string | undefined {
  if (callee.type === 'Identifier')
    return aliases.get(callee.name)

  if (callee.type === 'MemberExpression') {
    const property = callee.property
    const name = property.type === 'Identifier'
      ? property.name
      : property.type === 'Literal' && typeof property.value === 'string' ? property.value : undefined
    return name !== undefined && names.has(name) ? name : undefined
  }

  return undefined
}

/**
 * Wrap compiler-owned authoring calls with source metadata. The wrapper is a
 * comma expression, so runtime semantics and return types are unchanged; a
 * VanityError raised synchronously can recover the exact authored property.
 * Token-builder chains register all seed/stage paths as one source context.
 */
export function applySourceLocations(
  source: string,
  fileName: string,
  root: string,
  ambientAliases?: ReadonlyMap<string, string>,
): string {
  const parsed = parseSync(fileName, source, { range: true })

  if (parsed.errors.some(error => error.severity === 'Error'))
    return source

  const aliases = getAuthoringAliases(parsed.program, sourceAuthoringNames, ambientAliases)
  const calls: Array<{ node: CallExpression, name: string }> = []

  new Visitor({
    CallExpression(node) {
      const name = getAuthoringCallee(node.callee, aliases, sourceAuthoringNames)
      if (name !== undefined && (!tokenBuilderMethodNames.has(name) || isTokenBuilderChain(node, aliases)))
        calls.push({ node, name })
    },
  }).visit(parsed.program)

  const outermost = calls.filter(({ node }) => !calls.some(({ node: other }) =>
    other !== node && other.start === node.start && other.end > node.end))
  const relativeFile = normalizePath(posix.relative(normalizePath(root), normalizePath(fileName)))
  const file = relativeFile.startsWith('..') ? normalizePath(fileName) : relativeFile
  const pointAt = createSourcePoint(source)
  const edits: Array<{ at: number, text: string }> = []

  for (const { node, name } of outermost) {
    const locations: Record<string, Array<{ line: number, column: number }>> = {}
    collectCallLocations(node, name, aliases, locations, pointAt)
    const meta = { file, call: pointAt(node.start), locations }
    const key = `${file}:${node.start}`
    const json = JSON.stringify(meta)

    edits.push({
      at: node.start,
      text: `globalThis[Symbol.for('vanity.withSource')](${json},${JSON.stringify(key)},()=>`,
    })
    edits.push({ at: node.end, text: ')' })
  }

  return applyInsertions(source, edits)
}

function isTokenBuilderChain(call: CallExpression, aliases: Map<string, string>): boolean {
  const name = getAuthoringCallee(call.callee, aliases, sourceAuthoringNames)

  if (name === 'defineTokens')
    return true

  return name !== undefined
    && tokenBuilderMethodNames.has(name)
    && call.callee.type === 'MemberExpression'
    && call.callee.object.type === 'CallExpression'
    && isTokenBuilderChain(call.callee.object, aliases)
}

function collectCallLocations(
  call: CallExpression,
  name: string,
  aliases: Map<string, string>,
  locations: Record<string, Array<{ line: number, column: number }>>,
  pointAt: (offset: number) => { line: number, column: number },
): void {
  if (call.callee.type === 'MemberExpression' && call.callee.object.type === 'CallExpression') {
    const base = call.callee.object
    const baseName = getAuthoringCallee(base.callee, aliases, sourceAuthoringNames)
    if (baseName !== undefined)
      collectCallLocations(base, baseName, aliases, locations, pointAt)
  }

  const expression = getSourceObjectForCall(call, name)
  if (expression !== undefined)
    collectObjectLocations(expression, [], locations, pointAt)
}

function getSourceObjectForCall(call: CallExpression, name: string): ObjectExpression | undefined {
  const argument = call.arguments[0]

  if (argument === undefined || argument.type === 'SpreadElement')
    return undefined

  const expression = unwrapSource(argument)

  if (expression.type === 'ObjectExpression')
    return expression

  if (name === 'add' && (expression.type === 'ArrowFunctionExpression' || expression.type === 'FunctionExpression')) {
    if (expression.body !== null && expression.body.type !== 'BlockStatement') {
      const body = unwrapSource(expression.body)
      return body.type === 'ObjectExpression' ? body : undefined
    }

    if (expression.body === null)
      return undefined

    for (const statement of expression.body.body) {
      if (statement.type === 'ReturnStatement' && statement.argument !== null) {
        const returned = unwrapSource(statement.argument)
        if (returned.type === 'ObjectExpression')
          return returned
      }
    }
  }

  return undefined
}

function collectObjectLocations(
  object: ObjectExpression,
  prefix: string[],
  locations: Record<string, Array<{ line: number, column: number }>>,
  pointAt: (offset: number) => { line: number, column: number },
): void {
  for (const property of object.properties) {
    if (property.type !== 'Property')
      continue

    const key = getSourcePropertyName(property)
    if (key === undefined)
      continue

    const path = [...prefix, key]
    const joined = path.join('.')
    const points = locations[joined] ?? []
    points.push(pointAt(property.key.start))
    locations[joined] = points

    const value = unwrapSource(property.value)
    if (value.type === 'ObjectExpression')
      collectObjectLocations(value, path, locations, pointAt)
  }
}

function getSourcePropertyName(property: ObjectProperty): string | undefined {
  const { key } = property

  if (key.type === 'Identifier')
    return key.name

  if (key.type === 'Literal' && (typeof key.value === 'string' || typeof key.value === 'number'))
    return String(key.value)

  return undefined
}

function unwrapSource(expression: Expression): Expression {
  let value = expression
  const wrappers = new Set(['ParenthesizedExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSInstantiationExpression'])

  while (wrappers.has(value.type) && 'expression' in value)
    value = value.expression as Expression

  return value
}

function createSourcePoint(source: string): (offset: number) => { line: number, column: number } {
  const starts = [0]

  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 10)
      starts.push(index + 1)
  }

  return (offset) => {
    let low = 0
    let high = starts.length - 1

    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (starts[middle] <= offset)
        low = middle
      else high = middle - 1
    }

    return { line: low + 1, column: offset - starts[low] + 1 }
  }
}

function hasObjectKey(object: ObjectExpression, key: string): boolean {
  return object.properties.some((property) => {
    if (property.type !== 'Property')
      return false

    return property.key.type === 'Identifier'
      ? property.key.name === key
      : property.key.type === 'Literal' && property.key.value === key
  })
}

function applyInsertions(source: string, edits: Array<{ at: number, text: string }>): string {
  let output = source

  for (const edit of edits.sort((a, b) => b.at - a.at))
    output = `${output.slice(0, edit.at)}${edit.text}${output.slice(edit.at)}`

  return output
}

// ─── Introspection: manifests and audits derive during the build ─────────────
