import type { VanityManifest, VanityManifestStyle, VanityManifestStyleDeclaration } from './manifest'
import { VanityError } from '../diagnostics'
import { buildAgentContext, formatAgentContext } from './agent'

/** Query the existing manifest graph; no source evaluation or independent origin inference. */
export function queryManifest(manifest: VanityManifest, command: 'roles' | 'examples' | 'explain' | 'context', subject?: string): unknown {
  const tokens = manifest.system.tokens
  if (command === 'roles')
    return getRoleMatches(manifest, subject)
  if (command === 'examples') {
    const path = subject?.replace(/^tokens?\./, '')
    if (!path || !tokens[path])
      throwQueryError(`no token matches '${subject ?? ''}'`, 'pass a token path from the manifest')
    return Object.values(manifest.modules).flatMap(module => Object.values(module.styles).flatMap(style => style.declarations
      .filter(declaration => declaration.tokens.includes(path))
      .map(declaration => ({ module: module.source, style: style.class, ...(style.name ? { name: style.name } : {}), exports: style.exports, declaration }))))
  }
  if (command === 'explain') {
    if (!subject?.includes('#'))
      throwQueryError('source explanations need a module and export', 'use <module>#<export>[.<part>]')
    const [source, selection] = subject.split('#')
    const [name, part] = selection!.split('.')
    const module = manifest.modules[source!]
    let styles = Object.values(module?.styles ?? {}).filter(style => style.exports.includes(name!))
    if (part) {
      const anatomy = Object.values(module?.recipes ?? {}).find(recipe => recipe.kind === 'anatomy' && styles.some(style => getOwnedClasses(recipe.classes).includes(style.class)))
      if (!anatomy || !anatomy.parts?.includes(part))
        throwQueryError(`no anatomy part matches '${subject}'`, 'pass a declared anatomy export and part')
      const classes = getPartClasses(anatomy.classes, part)
      styles = styles.filter(style => classes.includes(style.class))
    }
    if (!styles.length)
      throwQueryError(`no style export matches '${subject}'`, 'use <module>#<export>[.<part>] from the manifest')
    return { module: source, export: name, ...(part ? { part } : {}), styles, declarations: styles.flatMap(style => style.declarations) }
  }
  if (!subject)
    return buildAgentContext(manifest)
  const module = manifest.modules[subject]
  const paths = module
    ? new Set(Object.values(module.styles).flatMap(style => style.tokens))
    : new Set(Object.keys(tokens).filter(path => path === subject || path.startsWith(`${subject}.`)))
  if (!module && !paths.size)
    throwQueryError(`no token group or module matches '${subject}'`, 'pass a token group or module source from the manifest')
  // Dependency closure keeps a focused answer intelligible without inventing roles.
  const addDependencies = (path: string): void => {
    for (const dependency of tokens[path]?.dependencies.flatMap(edge => edge.path ?? []) ?? []) {
      if (!paths.has(dependency)) {
        paths.add(dependency)
        addDependencies(dependency)
      }
    }
  }
  for (const path of paths)
    addDependencies(path)
  const context = buildAgentContext(manifest)
  return { ...context, tokens: context.tokens.filter(token => paths.has(token.path)), modules: context.modules.filter(entry => module ? entry.source === subject : Object.values(manifest.modules[entry.source]?.styles ?? {}).some(style => style.tokens.some(path => paths.has(path)))) }
}

export function formatManifestQuery(command: string, result: unknown): string {
  if (command === 'context')
    return formatAgentContext(result as ReturnType<typeof buildAgentContext>)
  if (command === 'roles') {
    const { roles, warnings } = result as ReturnType<typeof getRoleMatches>
    const format = (role: (typeof roles)[number]) => `${role.path}  matched: ${role.matches.map(match => `${match.field} ${JSON.stringify(match.text)}`).join('; ')}`
    return [roles.map(format).join('\n') || 'No roles matched.', ...warnings.map(role => `Warning: ${format(role)}; matched only guidance to avoid this role.`)].join('\n')
  }
  if (command === 'examples')
    return (result as Array<{ module: string, style: string, declaration: VanityManifestStyleDeclaration }>).map(example => `${example.module}#${example.style} ${example.declaration.property}: ${example.declaration.value}${example.declaration.source ? ` (${example.declaration.source.line}:${example.declaration.source.column})` : ''}`).join('\n') || 'No emitted declarations use this token.'
  if (command === 'explain') {
    const source = result as { module: string, export: string, part?: string, styles: VanityManifestStyle[], declarations: VanityManifestStyleDeclaration[] }
    return [`${source.module}#${source.export}${source.part ? `.${source.part}` : ''}`, ...source.declarations.map(declaration => `${declaration.arm.selector} ${declaration.property}: ${declaration.value}; ${declaration.components.map(component => `${component.origin}${component.tokens.length ? ` (${component.tokens.join(', ')})` : ''}; ${component.evidence.level}`).join(' | ')}${declaration.condition.length ? `; condition ${declaration.condition.join('.')}` : ''}`)].join('\n')
  }
  return JSON.stringify(result, null, 2)
}

function getOwnedClasses(value: unknown): string[] {
  if (typeof value === 'string')
    return value.split(/\s+/).filter(Boolean)
  return value && typeof value === 'object' ? Object.values(value).flatMap(getOwnedClasses) : []
}

function getPartClasses(classes: unknown, part: string): string[] {
  const tables = classes as { base: Record<string, string>, variants: Record<string, Record<string, Record<string, string>>>, toggles: Record<string, Record<string, string>>, compound: Array<{ classes: Record<string, string> }> }
  return [tables.base[part], ...Object.values(tables.variants).flatMap(arms => Object.values(arms).map(arm => arm[part])), ...Object.values(tables.toggles).map(arm => arm[part]), ...tables.compound.map(arm => arm.classes[part])].filter((value): value is string => typeof value === 'string').flatMap(value => value.split(/\s+/).filter(Boolean))
}

function throwQueryError(message: string, fix: string): never {
  throw new VanityError({ code: 'VANITY_CLI_INVALID_USAGE', message, path: ['subject'], fix })
}

/** Words are lexical evidence, never a semantic suitability judgment. */
function getRoleMatches(manifest: VanityManifest, subject?: string) {
  const words = [...new Set(getWords(subject ?? ''))]
  const candidates = Object.entries(manifest.system.tokens).map(([path, token]) => {
    const fields = [
      ...(token.usage?.for ?? []).map(text => ({ field: 'usage.for', text })),
      ...(token.description ? [{ field: 'description', text: token.description }] : []),
      { field: 'path', text: path },
    ]
    const matchesWords = (text: string) => words.filter(word => getWords(text).some(term => isWordMatch(word, term)))
    const matches = fields.filter(({ text }) => !words.length || matchesWords(text).length > 0)
    const matchedWords = new Set(matches.flatMap(({ text }) => matchesWords(text)))
    const avoid = token.usage?.avoid
    const warning = matches.length === 0 && avoid !== undefined && matchesWords(avoid).length > 0
    return {
      role: { path, type: token.type, ...(token.description ? { description: token.description } : {}), ...(token.usage ? { usage: token.usage } : {}), matches: warning ? [{ field: 'usage.avoid', text: avoid! }] : matches },
      score: warning ? matchesWords(avoid!).length : matchedWords.size,
      warning,
    }
  }).filter(candidate => candidate.role.matches.length > 0).sort((left, right) => right.score - left.score || right.role.matches.filter(match => match.field === 'usage.for').length - left.role.matches.filter(match => match.field === 'usage.for').length || left.role.path.localeCompare(right.role.path))
  return { roles: candidates.filter(candidate => !candidate.warning).map(candidate => candidate.role), warnings: candidates.filter(candidate => candidate.warning).map(candidate => candidate.role) }
}

function getWords(text: string): string[] {
  return text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

function isWordMatch(left: string, right: string): boolean {
  const getPluralWord = (word: string) => /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : /(?:[sxz]|ch|sh)$/.test(word) ? `${word}es` : `${word}s`
  return left === right || getPluralWord(left) === right || getPluralWord(right) === left
}
