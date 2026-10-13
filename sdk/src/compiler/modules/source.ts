/** Compiler-owned source inspection and authoring transforms. */

import type { ArrayExpression, CallExpression, Expression, ObjectExpression, ObjectProperty } from 'oxc-parser'
import type { VanityDeclarationSource } from '../../diagnostics'
import { posix } from 'node:path'
import { parseSync, Visitor } from 'oxc-parser'
import { renderStyleAutoImportDeclarations as renderStyleAutoImportDeclarationsFromSources } from '../auto-imports/autoImportDeclarations'
import { normalizePath } from '../core/path'

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

// ─── Export-name detection ───────────────────────────────────────────────────

/**
 * Every statically enumerable value export, read from Oxc's module record.
 * Destructuring, aliases, re-exports, comments, and TypeScript-only exports
 * follow parser semantics instead of source-text guesses.
 */
export function readStyleExportNames(source: string, fileName = 'system.css.ts'): string[] {
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
export function renderStyleAutoImportDeclarations(
  sources: readonly import('../auto-imports/autoImportDeclarations').VanityAutoImportDeclarationSource[],
  options: { relativeTo?: string } = {},
): string {
  return renderStyleAutoImportDeclarationsFromSources(sources, options)
}

export interface VanityImportedBinding {
  readonly local: string
  readonly imported: string
  readonly source: string
}

/** Read value import bindings so a source barrel can preserve exported authoring names. */
export function readValueImportBindings(
  source: string,
  fileName: string,
): VanityImportedBinding[] {
  const parsed = parseSync(fileName, source)

  if (parsed.errors.some(error => error.severity === 'Error'))
    return []

  const bindings: VanityImportedBinding[] = []
  new Visitor({
    ImportDeclaration(node) {
      if (node.importKind === 'type')
        return

      for (const specifier of node.specifiers) {
        if (specifier.type !== 'ImportSpecifier' || specifier.importKind === 'type')
          continue
        const imported = specifier.imported.type === 'Identifier'
          ? specifier.imported.name
          : String(specifier.imported.value)
        bindings.push({
          local: specifier.local.name,
          imported,
          source: node.source.value,
        })
      }
    },
  }).visit(parsed.program)

  return bindings
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
  return applyInsertions(source, collectDebugNameInsertions(parsed.program, aliases))
}

function collectDebugNameInsertions(
  program: Parameters<Visitor['visit']>[0],
  aliases: Map<string, string>,
): Array<{ at: number, text: string }> {
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
  }).visit(program)

  return edits
}

/**
 * Identify a module that participates in Vanity authoring without executing
 * it. The compiler uses this to select authored system projections and to
 * decide which package edges deserve provenance instrumentation; the source
 * transforms below remain syntax-aware and preserve the author's runtime
 * semantics.
 */
export function containsVanityAuthoring(
  source: string,
  fileName: string,
  ambientAliases?: ReadonlyMap<string, string>,
): boolean {
  const parsed = parseSync(fileName, source)

  if (parsed.errors.some(error => error.severity === 'Error'))
    return false

  const aliases = getAuthoringAliases(parsed.program, sourceAuthoringNames, ambientAliases)
  let found = false

  new Visitor({
    CallExpression(node) {
      if (getAuthoringCallee(node.callee, aliases, sourceAuthoringNames) !== undefined)
        found = true
    },
  }).visit(parsed.program)

  return found
}

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
  debugNames = false,
): string {
  const parsed = parseSync(fileName, source, { range: true })

  if (parsed.errors.some(error => error.severity === 'Error'))
    return source

  const aliases = getAuthoringAliases(parsed.program, sourceAuthoringNames, ambientAliases)
  const calls: Array<{ node: CallExpression, name: string, helper: boolean }> = []
  let functionDepth = 0
  const exportedLocals = new Map<string, string[]>()
  for (const declaration of parsed.module.staticExports) {
    for (const entry of declaration.entries) {
      if (!entry.isType && entry.exportName.name !== null && entry.localName.name !== null) {
        const names = exportedLocals.get(entry.localName.name) ?? []
        names.push(entry.exportName.name)
        exportedLocals.set(entry.localName.name, names)
      }
    }
  }
  const exportsByCall = new Map<Expression, string[]>()

  new Visitor({
    FunctionDeclaration() { functionDepth++ },
    'FunctionDeclaration:exit': function () { functionDepth-- },
    FunctionExpression() { functionDepth++ },
    'FunctionExpression:exit': function () { functionDepth-- },
    ArrowFunctionExpression() { functionDepth++ },
    'ArrowFunctionExpression:exit': function () { functionDepth-- },
    ExportDefaultDeclaration(node) {
      if (node.declaration.type === 'CallExpression')
        exportsByCall.set(node.declaration, ['default'])
    },
    VariableDeclarator(node) {
      if (node.id.type === 'Identifier' && node.init)
        exportsByCall.set(unwrapSource(node.init), [...exportedLocals.get(node.id.name) ?? []].sort())
    },
    CallExpression(node) {
      const name = getAuthoringCallee(node.callee, aliases, sourceAuthoringNames)
      if (name !== undefined && (!tokenBuilderMethodNames.has(name) || isTokenBuilderChain(node, aliases)))
        calls.push({ node, name, helper: functionDepth > 0 })
    },
  }).visit(parsed.program)

  const outermost = calls.filter(({ node }) => !calls.some(({ node: other }) =>
    other !== node && other.start === node.start && other.end > node.end))
  const relativeFile = normalizePath(posix.relative(normalizePath(root), normalizePath(fileName)))
  const file = relativeFile.startsWith('..') ? normalizePath(fileName) : relativeFile
  const pointAt = createSourcePoint(source)
  // Both transforms use original offsets. Debug-name insertions must never
  // shift source locations or the value spans recorded for later calls.
  const edits = debugNames
    ? collectDebugNameInsertions(parsed.program, getAuthoringAliases(parsed.program, undefined, ambientAliases))
    : []

  for (const { node, name, helper } of outermost) {
    const locations: Record<string, Array<{ line: number, column: number }>> = {}
    const values: Record<string, VanityDeclarationSource> = {}
    collectCallLocations(node, name, aliases, locations, pointAt, { source, file, helper, values })
    const meta = { file, call: pointAt(node.start), locations, values, exports: exportsByCall.get(node) }
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
  context: ValueSourceContext,
): void {
  if (call.callee.type === 'MemberExpression' && call.callee.object.type === 'CallExpression') {
    const base = call.callee.object
    const baseName = getAuthoringCallee(base.callee, aliases, sourceAuthoringNames)
    if (baseName !== undefined)
      collectCallLocations(base, baseName, aliases, locations, pointAt, context)
  }

  const expression = getSourceObjectForCall(call, name)
  if (expression !== undefined)
    collectObjectLocations(expression, [], locations, pointAt, context)
}

function getSourceObjectForCall(call: CallExpression, name: string): ObjectExpression | ArrayExpression | undefined {
  const argument = call.arguments[0]

  if (argument === undefined || argument.type === 'SpreadElement')
    return undefined

  const expression = unwrapSource(argument)

  if (expression.type === 'ObjectExpression' || expression.type === 'ArrayExpression')
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
  object: ObjectExpression | ArrayExpression,
  prefix: string[],
  locations: Record<string, Array<{ line: number, column: number }>>,
  pointAt: (offset: number) => { line: number, column: number },
  context: ValueSourceContext,
): void {
  if (object.type === 'ArrayExpression') {
    object.elements.forEach((element, index) => {
      if (element === null || element.type === 'SpreadElement')
        return
      const value = unwrapSource(element)
      if (value.type === 'ObjectExpression' || value.type === 'ArrayExpression')
        collectObjectLocations(value, [...prefix, String(index)], locations, pointAt, context)
    })
    return
  }

  for (const property of object.properties) {
    if (property.type !== 'Property')
      continue

    // A computed condition object becomes this key under JavaScript's
    // property coercion. Retain its authored site for the registration repair.
    const key = property.computed && property.key.type !== 'Literal'
      ? '[object Object]'
      : getSourcePropertyName(property)
    if (key === undefined)
      continue

    const path = [...prefix, key]
    const joined = path.join('.')
    const points = locations[joined] ?? []
    points.push(pointAt(property.computed ? property.start : property.key.start))
    locations[joined] = points

    const value = unwrapSource(property.value)
    const editable = !context.helper && isStaticSourceValue(value)
    context.values[JSON.stringify(path)] = {
      source: {
        file: context.file,
        start: value.start,
        end: value.end,
        text: context.source.slice(value.start, value.end),
        ...pointAt(value.start),
      },
      editable,
      ...(!editable
        ? { reason: context.helper
            ? 'style created in a helper function'
            : 'value is not a supported static reference or literal' }
        : {}),
    }
    if (value.type === 'ObjectExpression' || value.type === 'ArrayExpression')
      collectObjectLocations(value, path, locations, pointAt, context)
  }
}

interface ValueSourceContext {
  source: string
  file: string
  helper: boolean
  values: Record<string, VanityDeclarationSource>
}

/** Only syntax with an independently authored value is offered for reference swaps. */
function isStaticSourceValue(expression: Expression, memberRoot = false): boolean {
  const value = unwrapSource(expression)
  if (value.type === 'Literal')
    return true
  if (value.type === 'UnaryExpression')
    return ['+', '-'].includes(value.operator) && value.argument.type === 'Literal'
  if (value.type === 'Identifier')
    return memberRoot && ['ds', 't'].includes(value.name)
  if (value.type === 'MemberExpression')
    return (!value.computed || value.property.type === 'Literal') && isStaticSourceValue(value.object, true)
  if (value.type === 'TemplateLiteral')
    return value.expressions.every(expression => isStaticSourceValue(expression))
  if (value.type === 'CallExpression') {
    const callee = value.callee
    return callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier'
      && ['calc', 'min', 'max', 'clamp', 'add', 'subtract', 'multiply', 'divide', 'negate'].includes(callee.property.name)
      && isStaticSourceValue(callee.object, true)
      && value.arguments.every(argument => argument.type !== 'SpreadElement' && isStaticSourceValue(argument))
  }
  return false
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

/** Read stylesheet imports from a compiled source wrapper using JavaScript syntax. */
export function readStyleModuleCssImports(source: string, fileName: string): string[] {
  const parsed = parseSync(fileName, source)
  const imports: string[] = []
  new Visitor({
    ImportDeclaration(node) {
      if (/\.vanilla\.css(?:\?.*)?$/.test(node.source.value))
        imports.push(node.source.value)
    },
  }).visit(parsed.program)
  return imports
}
