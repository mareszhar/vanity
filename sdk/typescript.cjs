/**
 * vanity TypeScript language-service plugin.
 *
 * TypeScript deliberately treats a mapped property as synthesized, so native
 * rename cannot connect a `defineTokens` object key to the handle properties
 * inferred from it. Vanity has more information: every handle carries a literal
 * `$path` type (or legacy `path` during migration), and every use can be traced
 * to one graph-producing call. This
 * plugin adds only those missing rename locations; every other language-
 * service operation remains TypeScript's own.
 */

'use strict'

const { existsSync, readFileSync } = require('node:fs')
const { dirname, join } = require('node:path')

const AMBIENT_SOURCE_NOTICE = 990001
const STYLE_DESTINATION_MISUSE = 990002
const styleEmitters = new Set(['class', 'recipe', 'anatomy', 'atoms', 'rules', 'raw', 'keyframes', 'fontFace', 'port', 'tdec'])

module.exports = function init(modules) {
  const ts = modules.typescript

  return {
    create(info) {
      const languageService = info.languageService
      const proxy = Object.create(null)

      for (const key of Object.keys(languageService)) {
        const method = languageService[key]
        proxy[key] = typeof method === 'function' ? method.bind(languageService) : method
      }

      proxy.getRenameInfo = (fileName, position, options) => {
        const native = languageService.getRenameInfo(fileName, position, options)

        if (native.canRename)
          return native

        const identity = identityAt(ts, languageService.getProgram(), fileName, position)

        if (!identity)
          return native

        return {
          canRename: true,
          displayName: identity.path.split('.').at(-1),
          fullDisplayName: identity.path,
          kind: ts.ScriptElementKind.memberVariableElement,
          kindModifiers: '',
          triggerSpan: identity.span,
        }
      }

      proxy.findRenameLocations = (fileName, position, findInStrings, findInComments, preferences) => {
        const native = languageService.findRenameLocations(fileName, position, findInStrings, findInComments, preferences) ?? []
        const program = languageService.getProgram()
        const identity = identityAt(ts, program, fileName, position)

        if (!identity || !program)
          return native

        const added = locationsFor(ts, program, identity)
        const unique = new Map()

        for (const location of [...native, ...added])
          unique.set(`${location.fileName}:${location.textSpan.start}:${location.textSpan.length}`, location)

        return [...unique.values()]
      }

      proxy.getCompletionsAtPosition = (fileName, position, preferences) => {
        const native = languageService.getCompletionsAtPosition(fileName, position, preferences)
        if (!native || !isStyleModule(fileName))
          return native

        const barrels = authoringBarrels(info.config, languageService.getProgram())
        if (barrels.size === 0)
          return native

        // TypeScript already owns the import action and its edit. Vanity only
        // gives an explicitly configured authoring barrel first refusal in a
        // style module; every completion outside that narrow context remains
        // byte-for-byte native.
        return {
          ...native,
          entries: native.entries.map(entry => barrels.has(entry.source)
            ? { ...entry, sortText: `0${entry.sortText}` }
            : entry),
        }
      }

      proxy.getSemanticDiagnostics = (fileName) => {
        const native = languageService.getSemanticDiagnostics(fileName)
        const program = languageService.getProgram()
        const source = program?.getSourceFile(fileName)
        if (!program || !source)
          return native

        return [...native, ...vanityDiagnostics(ts, program, source)]
      }

      proxy.getCodeFixesAtPosition = (fileName, start, end, errorCodes, formatOptions, preferences) => {
        const native = languageService.getCodeFixesAtPosition(
          fileName,
          start,
          end,
          errorCodes,
          formatOptions,
          preferences,
        )
        if (!errorCodes.includes(AMBIENT_SOURCE_NOTICE))
          return native

        const program = languageService.getProgram()
        const source = program?.getSourceFile(fileName)
        const ambient = program && source ? ambientUseAt(ts, program, source, start) : undefined
        if (!ambient)
          return native

        const fixes = [
          codeFix(fileName, `import type {} from '${packageOf(ambient.source)}/vanity-style-auto-imports'\n`, 'Add the type-only unlock import'),
          codeFix(fileName, `import { ${ambient.name} } from '${ambient.source}'\n`, `Import ${ambient.name} from the authoring barrel`),
        ]
        return [...native, ...fixes]
      }

      return proxy
    },
  }
}

function vanityDiagnostics(ts, program, source) {
  const diagnostics = []
  const packageInfo = sourceShippingPackage(source.fileName)

  if (packageInfo && !packageInfo.vanity?.suppressAmbientSourceDeclarationNotice && isStyleModule(source.fileName)
    && !hasTypeOnlyUnlock(ts, source)) {
    const ambient = firstAmbientUse(ts, program, source)
    if (ambient) {
      diagnostics.push(diagnostic(
        ts,
        source,
        ambient.node,
        AMBIENT_SOURCE_NOTICE,
        `VANITY_AMBIENT_SOURCE_DECLARATION: ${packageInfo.name} ships this style source; consumers compiling it need these declarations unless each consumer configures Vanity.`,
      ))
    }
  }

  visit(source)
  return diagnostics

  function visit(node) {
    if (ts.isPropertyAccessExpression(node)
      && node.expression.getText(source) === 'ds'
      && styleEmitters.has(node.name.text)
      && !isStyleModule(source.fileName)) {
      diagnostics.push(diagnostic(
        ts,
        source,
        node.name,
        STYLE_DESTINATION_MISUSE,
        `VANITY_STYLE_MODULE_MISUSE: ds.${node.name.text} belongs in a *.css.ts style module; application modules can use ds.runtime() and serialized style exports.`,
        ts.DiagnosticCategory.Error,
      ))
    }
    ts.forEachChild(node, visit)
  }
}

function isStyleModule(fileName) {
  return /\.css\.[cm]?[jt]sx?$/.test(fileName)
}

function authoringBarrels(config, program) {
  const sources = new Set()
  const configured = config?.authoringBarrels
  for (const source of typeof configured === 'string' ? [configured] : Array.isArray(configured) ? configured : [])
    sources.add(source)

  // Mode 2 already names its authoring source in Vanity's generated
  // declaration. Reading it means users do not duplicate that knowledge in
  // tsconfig merely to receive ranked import completions.
  for (const sourceFile of program?.getSourceFiles() || []) {
    if (!sourceFile.isDeclarationFile || !/generated by vanity/.test(sourceFile.text))
      continue
    for (const match of sourceFile.text.matchAll(/typeof\s+import\(["']([^"']+)["']\)\./g))
      sources.add(match[1])
  }
  return sources
}

function diagnostic(ts, source, node, code, messageText, category = ts.DiagnosticCategory.Suggestion) {
  return {
    file: source,
    start: node.getStart(source),
    length: node.getWidth(source),
    category,
    code,
    messageText,
  }
}

function firstAmbientUse(ts, program, source) {
  let found
  visit(source)
  return found

  function visit(node) {
    if (found)
      return
    if (ts.isIdentifier(node)) {
      const candidate = ambientUseForName(ts, program.getTypeChecker(), node)
      if (candidate)
        found = { node, ...candidate }
    }
    ts.forEachChild(node, visit)
  }
}

function ambientUseAt(ts, program, source, position) {
  const node = nodeAt(ts, source, position)
  let current = node
  while (current) {
    if (ts.isIdentifier(current)) {
      const candidate = ambientUseForName(ts, program.getTypeChecker(), current)
      if (candidate)
        return { node: current, ...candidate }
    }
    current = current.parent
  }
  return undefined
}

function ambientUseForName(ts, checker, node) {
  if (isImportOrDeclarationName(ts, node))
    return undefined
  const symbol = checker.getSymbolAtLocation(node)
  if (!symbol)
    return undefined
  for (const declaration of symbol.declarations || []) {
    const source = ambientSource(ts, declaration)
    if (source)
      return { name: node.text, source }
  }
  return undefined
}

function ambientSource(ts, declaration) {
  const file = declaration.getSourceFile()
  if (!file.isDeclarationFile || !/generated by vanity/.test(file.text))
    return undefined
  const declarationText = file.text.slice(declaration.getFullStart(), declaration.getEnd())
  const match = declarationText.match(/typeof\s+import\(["']([^"']+)["']\)\.[\w$]+/)
  return match?.[1]
}

function isImportOrDeclarationName(ts, node) {
  return ts.isImportSpecifier(node.parent)
    || ts.isImportClause(node.parent)
    || ts.isVariableDeclaration(node.parent)
    || (ts.isPropertyAccessExpression(node.parent) && node.parent.name !== node)
}

function hasTypeOnlyUnlock(ts, source) {
  return source.statements.some(statement => ts.isImportDeclaration(statement)
    && statement.importClause?.isTypeOnly
    && statement.importClause.name === undefined
    && statement.importClause.namedBindings === undefined)
}

function sourceShippingPackage(fileName) {
  let directory = dirname(fileName)
  for (;;) {
    const path = join(directory, 'package.json')
    if (existsSync(path)) {
      try {
        const json = JSON.parse(readFileSync(path, 'utf8'))
        if ((json.exports || json.files) && typeof json.name === 'string')
          return json
      }
      catch {}
      return undefined
    }
    const parent = dirname(directory)
    if (parent === directory)
      return undefined
    directory = parent
  }
}

function packageOf(source) {
  if (source.startsWith('@'))
    return source.split('/').slice(0, 2).join('/')
  return source.split('/')[0]
}

function codeFix(fileName, text, description) {
  return {
    fixName: 'vanity-ambient-source-declaration',
    description,
    changes: [{ fileName, textChanges: [{ span: { start: 0, length: 0 }, newText: text }] }],
  }
}

function identityAt(ts, program, fileName, position) {
  if (!program)
    return undefined

  const source = program.getSourceFile(fileName)

  if (!source)
    return undefined

  const checker = program.getTypeChecker()
  const node = nodeAt(ts, source, position)
  const name = renameName(ts, node)

  if (!name)
    return undefined

  const typed = typedTokenPath(ts, checker, name)

  if (typed) {
    const graph = graphForUse(ts, checker, name, typed)
    return graph ? { graph, path: typed, span: spanOf(name) } : undefined
  }

  const definition = definitionIdentity(ts, checker, name)
  return definition ? { ...definition, span: spanOf(name) } : undefined
}

function locationsFor(ts, program, identity) {
  const checker = program.getTypeChecker()
  const locations = []
  const leaf = identity.path.split('.').at(-1)

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile)
      continue

    visit(source)

    function visit(node) {
      const name = candidateName(ts, node)

      // A matching semantic path must end in the same property spelling. This
      // cheap syntax filter avoids asking TypeScript to instantiate the type of
      // every property in large, composed graphs during one rename.
      if (name && propertyName(ts, name) === leaf) {
        const typedPath = typedTokenPath(ts, checker, name)

        if (typedPath === identity.path && graphForUse(ts, checker, name, typedPath) === identity.graph)
          locations.push({ fileName: source.fileName, textSpan: spanOf(name) })

        const definition = definitionIdentity(ts, checker, name)

        if (definition && definition.path === identity.path && definition.graph === identity.graph)
          locations.push({ fileName: source.fileName, textSpan: spanOf(name) })
      }

      ts.forEachChild(node, visit)
    }
  }

  return locations
}

function candidateName(ts, node) {
  if (ts.isPropertyAccessExpression(node))
    return node.name
  if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression))
    return node.argumentExpression
  if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node))
    return node.name
  if (ts.isCallExpression(node) && callSyntaxName(ts, node) === 'add'
    && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
    return node.arguments[0]
  }
  return undefined
}

function renameName(ts, node) {
  let current = node

  while (current) {
    if ((ts.isIdentifier(current) || ts.isStringLiteralLike(current)) && candidateParent(ts, current))
      return current
    current = current.parent
  }

  return undefined
}

function candidateParent(ts, node) {
  const parent = node.parent
  return (ts.isPropertyAccessExpression(parent) && parent.name === node)
    || (ts.isElementAccessExpression(parent) && parent.argumentExpression === node)
    || ((ts.isPropertyAssignment(parent) || ts.isShorthandPropertyAssignment(parent)) && parent.name === node)
    || (ts.isCallExpression(parent) && callSyntaxName(ts, parent) === 'add' && parent.arguments[0] === node)
}

function typedTokenPath(ts, checker, name) {
  const parent = name.parent
  const value = ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent) ? parent : undefined

  if (!value)
    return undefined

  const type = checker.getTypeAtLocation(value)
  const property = type.getProperty('$path') || type.getProperty('path')

  if (!property)
    return undefined

  const pathType = checker.getTypeOfSymbolAtLocation(property, value)
  const values = stringLiterals(ts, pathType)
  return values.size === 1 ? [...values][0] : undefined
}

function stringLiterals(ts, type) {
  const values = new Set()

  if (type.isStringLiteral && type.isStringLiteral()) {
    values.add(type.value)
  }
  else if (type.isUnion && type.isUnion()) {
    for (const member of type.types) {
      for (const value of stringLiterals(ts, member))
        values.add(value)
    }
  }

  return values
}

function definitionIdentity(ts, checker, name) {
  const property = name.parent

  if (ts.isStringLiteralLike(name) && ts.isCallExpression(property)
    && callName(ts, checker, property) === 'add' && property.arguments[0] === name) {
    const graph = graphExpression(ts, checker, property)
    return graph ? { graph: graphId(graph), path: name.text } : undefined
  }

  if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property))
    return undefined

  // An object-valued property is a group, not a token leaf.
  if (ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(unwrap(ts, property.initializer)))
    return undefined

  const names = []
  let current = property
  let top

  while (current) {
    const text = propertyName(ts, current.name)

    if (!text)
      return undefined

    names.unshift(text)
    const object = current.parent

    if (!ts.isObjectLiteralExpression(object))
      return undefined

    top = object
    const parent = unwrapParent(ts, object)

    if ((ts.isPropertyAssignment(parent) || ts.isShorthandPropertyAssignment(parent)) && parent.initializer === unwrap(ts, object)) {
      current = parent
      continue
    }

    break
  }

  const graph = graphForDefinition(ts, checker, top)
  return graph ? { graph, path: names.join('.') } : undefined
}

function graphForDefinition(ts, checker, object) {
  const parent = unwrapParent(ts, object)

  if (ts.isCallExpression(parent) && parent.arguments.some(argument => unwrap(ts, argument) === object)) {
    const root = graphExpression(ts, checker, parent)
    return root && callName(ts, checker, root) === 'defineTokens' ? graphId(root) : undefined
  }

  if (ts.isArrowFunction(parent) && unwrap(ts, parent.body) === object) {
    const call = unwrapParent(ts, parent)
    const root = ts.isCallExpression(call) ? graphExpression(ts, checker, call) : undefined
    return root ? graphId(root) : undefined
  }

  if (ts.isReturnStatement(parent)) {
    const fn = containingFunction(ts, parent)
    const call = fn && unwrapParent(ts, fn)
    const root = call && ts.isCallExpression(call) ? graphExpression(ts, checker, call) : undefined
    return root ? graphId(root) : undefined
  }

  return undefined
}

function graphForUse(ts, checker, name, path) {
  const access = name.parent
  let root = access

  while (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root))
    root = root.expression

  const origin = tokenOrigin(ts, checker, root, path)

  if (origin)
    return origin

  const graph = graphExpression(ts, checker, root)
  return graph ? graphId(graph) : undefined
}

/**
 * Find the definition that contributed one token path to a composed builder.
 * `.compose(module)` checks the module first, then the accumulated base;
 * `.derive(stage)` owns only paths returned by that stage. This mirrors the
 * public topological semantics and keeps rename identity on the source module
 * instead of collapsing every module into the aggregate graph.
 */
function tokenOrigin(ts, checker, expression, path, seen = new Set()) {
  expression = unwrap(ts, expression)

  if (!expression || seen.has(expression))
    return undefined
  seen.add(expression)

  if (ts.isCallExpression(expression)) {
    const name = callName(ts, checker, expression)

    if (name === 'createSystem') {
      const tokens = objectOption(ts, expression, 'tokens')
      return tokens ? tokenOrigin(ts, checker, tokens, path, seen) : undefined
    }

    if (name === 'defineTokens') {
      const seed = expression.arguments[0]
      return seed && expressionDefinesPath(ts, checker, seed, path)
        ? graphId(expression)
        : undefined
    }

    const base = callBase(ts, expression)

    if (name === 'compose') {
      const module = expression.arguments[0]
      const moduleOrigin = module && tokenOrigin(ts, checker, module, path, new Set(seen))
      return moduleOrigin ?? (base ? tokenOrigin(ts, checker, base, path, seen) : undefined)
    }

    if (name === 'derive') {
      const stage = expression.arguments[0]

      if (stage && functionDefinesPath(ts, checker, stage, path)) {
        const graph = graphExpression(ts, checker, expression)
        return graph ? graphId(graph) : undefined
      }

      return base ? tokenOrigin(ts, checker, base, path, seen) : undefined
    }

    if (name === 'add') {
      const first = expression.arguments[0]
      if (first && ts.isStringLiteralLike(first) && first.text === path) {
        const graph = graphExpression(ts, checker, expression)
        return graph ? graphId(graph) : undefined
      }
      if (first && functionDefinesPath(ts, checker, first, path)) {
        const graph = graphExpression(ts, checker, expression)
        return graph ? graphId(graph) : undefined
      }
      if (first && expressionDefinesPath(ts, checker, first, path)) {
        const graph = graphExpression(ts, checker, expression)
        return graph ? graphId(graph) : undefined
      }
      if (first && ts.isArrayLiteralExpression(unwrap(ts, first))) {
        for (const element of unwrap(ts, first).elements) {
          const origin = tokenOrigin(ts, checker, element, path, new Set(seen))
          if (origin)
            return origin
        }
      }
      else if (first) {
        const origin = tokenOrigin(ts, checker, first, path, new Set(seen))
        if (origin)
          return origin
      }
      return base ? tokenOrigin(ts, checker, base, path, seen) : undefined
    }

    if (name === 'build')
      return base ? tokenOrigin(ts, checker, base, path, seen) : undefined

    if (name === 'consolidate')
      return base ? tokenOrigin(ts, checker, base, path, seen) : undefined

    if (name === 'addTokens') {
      const module = expression.arguments[0]
      const moduleOrigin = module && tokenOrigin(ts, checker, module, path, new Set(seen))
      return moduleOrigin ?? (base ? tokenOrigin(ts, checker, base, path, seen) : undefined)
    }
  }

  if (ts.isIdentifier(expression)) {
    const symbol = resolvedSymbol(ts, checker, expression)

    for (const declaration of symbol?.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        const origin = tokenOrigin(ts, checker, declaration.initializer, path, seen)
        if (origin)
          return origin
      }

      if (ts.isBindingElement(declaration) || ts.isParameter(declaration)) {
        const fn = containingFunction(ts, declaration)
        const call = fn && unwrapParent(ts, fn)

        if (call && ts.isCallExpression(call) && ['derive', 'add'].includes(callName(ts, checker, call))) {
          const base = callBase(ts, call)
          const origin = base && tokenOrigin(ts, checker, base, path, seen)
          if (origin)
            return origin
        }

        const variable = containingVariable(ts, declaration)
        const initializer = variable?.initializer

        if (initializer && ts.isCallExpression(unwrap(ts, initializer)) && callName(ts, checker, unwrap(ts, initializer)) === 'createSystem') {
          const tokens = objectOption(ts, unwrap(ts, initializer), 'tokens')
          const origin = tokens && tokenOrigin(ts, checker, tokens, path, seen)
          if (origin)
            return origin
        }
      }
    }
  }

  return undefined
}

function callBase(ts, call) {
  return ts.isPropertyAccessExpression(call.expression)
    ? call.expression.expression
    : undefined
}

function functionDefinesPath(ts, checker, expression, path) {
  expression = unwrap(ts, expression)

  if (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression))
    return false

  if (!ts.isBlock(expression.body))
    return expressionDefinesPath(ts, checker, expression.body, path)

  for (const statement of expression.body.statements) {
    if (ts.isReturnStatement(statement) && statement.expression && expressionDefinesPath(ts, checker, statement.expression, path))
      return true
  }

  return false
}

function expressionDefinesPath(ts, checker, expression, path, seen = new Set()) {
  expression = unwrap(ts, expression)

  if (!expression || seen.has(expression))
    return false
  seen.add(expression)

  if (ts.isIdentifier(expression)) {
    const symbol = resolvedSymbol(ts, checker, expression)

    for (const declaration of symbol?.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer
        && expressionDefinesPath(ts, checker, declaration.initializer, path, seen)) {
        return true
      }
    }

    return false
  }

  if (!ts.isObjectLiteralExpression(expression))
    return false

  const segments = path.split('.')
  let object = expression

  for (const [index, segment] of segments.entries()) {
    const property = object.properties.find(property =>
      (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
      && propertyName(ts, property.name) === segment)

    if (!property)
      return false

    if (index === segments.length - 1)
      return true

    const value = ts.isPropertyAssignment(property) ? property.initializer : property.name
    const nested = resolveObjectExpression(ts, checker, value, seen)

    if (!nested)
      return false

    object = nested
  }

  return false
}

function resolveObjectExpression(ts, checker, expression, seen) {
  expression = unwrap(ts, expression)

  if (ts.isObjectLiteralExpression(expression))
    return expression

  if (ts.isIdentifier(expression) && !seen.has(expression)) {
    seen.add(expression)
    const symbol = resolvedSymbol(ts, checker, expression)

    for (const declaration of symbol?.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        const object = resolveObjectExpression(ts, checker, declaration.initializer, seen)
        if (object)
          return object
      }
    }
  }

  return undefined
}

function graphExpression(ts, checker, expression, seen = new Set()) {
  expression = unwrap(ts, expression)

  if (!expression || seen.has(expression))
    return undefined
  seen.add(expression)

  if (ts.isCallExpression(expression)) {
    const name = callName(ts, checker, expression)

    if (name === 'defineTokens')
      return expression

    if (name === 'createSystem') {
      const tokens = objectOption(ts, expression, 'tokens')
      return (tokens && graphExpression(ts, checker, tokens, seen)) || expression
    }

    if (ts.isPropertyAccessExpression(expression.expression))
      return graphExpression(ts, checker, expression.expression.expression, seen)

    return expression
  }

  if (ts.isIdentifier(expression)) {
    const symbol = resolvedSymbol(ts, checker, expression)

    for (const declaration of symbol?.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        const root = graphExpression(ts, checker, declaration.initializer, seen)
        if (root)
          return root
      }

      if (ts.isBindingElement(declaration)) {
        const fn = containingFunction(ts, declaration)
        const call = fn && unwrapParent(ts, fn)

        if (call && ts.isCallExpression(call) && ['derive', 'add'].includes(callName(ts, checker, call))) {
          const root = graphExpression(ts, checker, call, seen)
          if (root)
            return root
        }

        const variable = containingVariable(ts, declaration)
        const initializer = variable?.initializer

        if (initializer && ts.isCallExpression(unwrap(ts, initializer)) && callName(ts, checker, unwrap(ts, initializer)) === 'createSystem') {
          const tokens = objectOption(ts, unwrap(ts, initializer), 'tokens')
          return (tokens && graphExpression(ts, checker, tokens, seen)) || unwrap(ts, initializer)
        }
      }
    }
  }

  return undefined
}

function resolvedSymbol(ts, checker, node) {
  let symbol = checker.getSymbolAtLocation(node)

  if (symbol && (symbol.flags & ts.SymbolFlags.Alias))
    symbol = checker.getAliasedSymbol(symbol)

  return symbol
}

function callName(ts, checker, call) {
  const expression = call.expression
  const name = ts.isPropertyAccessExpression(expression) ? expression.name : expression
  const symbol = resolvedSymbol(ts, checker, name)
  return symbol?.getName?.() || (ts.isIdentifier(name) ? name.text : undefined)
}

function callSyntaxName(ts, call) {
  const expression = call.expression
  return ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.name)
    ? expression.name.text
    : ts.isIdentifier(expression) ? expression.text : undefined
}

function objectOption(ts, call, key) {
  const options = unwrap(ts, call.arguments[0])

  if (!options || !ts.isObjectLiteralExpression(options))
    return undefined

  for (const property of options.properties) {
    if (ts.isPropertyAssignment(property) && propertyName(ts, property.name) === key)
      return property.initializer
  }

  return undefined
}

function graphId(node) {
  const source = node.getSourceFile()
  return `${source.fileName}:${node.getStart(source)}`
}

function propertyName(ts, name) {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) ? name.text : undefined
}

function nodeAt(ts, source, position) {
  let found = source

  function visit(node) {
    if (position < node.getFullStart() || position > node.getEnd())
      return

    found = node
    ts.forEachChild(node, visit)
  }

  visit(source)
  return found
}

function spanOf(node) {
  const source = node.getSourceFile()
  const start = node.getStart(source)
  const width = node.getWidth(source)
  return node.text !== undefined && (source.text[start] === '\'' || source.text[start] === '"' || source.text[start] === '`')
    ? { start: start + 1, length: Math.max(0, width - 2) }
    : { start, length: width }
}

function unwrap(ts, node) {
  let value = node

  while (value && (ts.isParenthesizedExpression(value) || ts.isAsExpression(value) || ts.isSatisfiesExpression?.(value) || ts.isNonNullExpression(value)))
    value = value.expression

  return value
}

function unwrapParent(ts, node) {
  let parent = node.parent

  while (parent && (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isSatisfiesExpression?.(parent)))
    parent = parent.parent

  return parent
}

function containingFunction(ts, node) {
  let current = node.parent

  while (current && !ts.isSourceFile(current)) {
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current) || ts.isFunctionDeclaration(current))
      return current
    current = current.parent
  }

  return undefined
}

function containingVariable(ts, node) {
  let current = node.parent

  while (current && !ts.isSourceFile(current)) {
    if (ts.isVariableDeclaration(current))
      return current
    current = current.parent
  }

  return undefined
}
