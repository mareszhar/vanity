/**
 * `pnpm run audit` — the introspection audits ([spec-introspection.md §3])
 * over a real plugin build. Defaults to the package's fixture app; point it at
 * any Vite-rooted style app: `pnpm run audit -- sdk/src/test-support/vite-app`.
 *
 * Findings print grouped and deep-linked; the exit code is 1 only when the
 * system's own config promoted a lane to a hard gate.
 */

import { cp, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { extname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { audit, formatAuditFindings } from '../sdk/src/introspect/audit'

const here = fileURLToPath(new URL('.', import.meta.url))
const packageDir = join(here, '..', 'sdk')
const packageSourceRoot = join(packageDir, 'src')
const packageToolingFiles = [
  join(packageDir, 'typescript.cjs'),
  join(packageDir, 'bin', 'vanity.mjs'),
]

const historyScanDirectories = ['sdk/src', 'docs', 'scripts', 'sandbox', 'spikes']
const historyScanFiles = ['README.md']
const historyScanExtensions = new Set(['.cjs', '.js', '.json', '.md', '.mjs', '.ts', '.tsx'])

/**
 * These are current, user-relevant terms rather than migration notes:
 * language.md states the naming law itself; the runtime and spec docs name
 * the HMR status; the patterns doc names the fallback expression; the
 * architecture and vision docs describe current boundary policy. The source
 * line fragment is intentional: if one of these sentences changes shape,
 * the audit asks for a fresh review instead of silently widening the waiver.
 */
const historyVocabularyAllowlist = [
  { file: 'docs/language.md', line: 'Current, not historical.' },
  { file: 'docs/language.md', line: 'ships no deprecated aliases' },
  { file: 'docs/reference/spec-runtime.md', line: 'mark superseded controllers stale' },
  { file: 'docs/reference/spec-runtime.md', line: 'stale/superseded status' },
  { file: 'docs/maintainers/patterns.md', line: 'fallback restores the previously effective expression' },
  { file: 'docs/maintainers/architecture.md', line: 'formats, and superseded versions' },
  { file: 'docs/vision.md', line: 'release-time compatibility layer' },
  { file: 'sdk/src/runtime/controller.ts', line: 'this runtime binding was superseded' },
] as const

const historyVocabularyPattern = /\b(?:legacy|formerly|previously|obsolete|superseded|characterization|realignment|phase\s?\d+|backwards?[- ]compat|compatibility (?:bridge|layer|shim)|old (?:api|surface|name|way)|used to be|deprecated alias|historical)\b/gi

/** Tooling resolves from the package, exactly as the plugin ships it. */
const requireFromPackage = createRequire(join(packageDir, 'package.json'))

async function main(): Promise<void> {
  await auditProductionNames()
  await auditHistoryVocabulary()

  const target = process.argv[2]
  const source = target === undefined ? join(packageDir, 'src', 'test-support', 'vite-app') : resolve(target)

  // Build in a copy, so the manifest artifact never lands in a source tree.
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-audit-')))
  await cp(source, root, { recursive: true })
  await writeFile(join(root, 'package.json'), '{ "name": "vanity-audit-surface", "type": "module" }')

  const { build } = await import(pathToFileURL(requireFromPackage.resolve('vite')).href) as typeof import('vite')
  const { default: vanityPlugin } = await import('../sdk/src/vite')

  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root,
    plugins: [vanityPlugin({ compiler: { identifiers: 'debug' } })],
    resolve: {
      alias: {
        '@mszr/vanity/runtime': join(packageDir, 'src', 'runtime.ts'),
        '@mszr/vanity': join(packageDir, 'src', 'index.ts'),
      },
    },
    build: {
      write: false,
      // The audit reads declarations as authored — minification would rewrite them.
      cssMinify: false,
      lib: { entry: join(root, 'entry.ts'), formats: ['es'], fileName: 'entry' },
    },
  })

  const { output } = (Array.isArray(result) ? result[0] : result) as import('vite').Rollup.RollupOutput
  const css = output
    .filter(item => item.type === 'asset' && item.fileName.endsWith('.css'))
    .map(item => String((item as { source: unknown }).source))
    .join('\n')

  const manifest = JSON.parse(await readFile(join(root, '.vanity', 'manifest.json'), 'utf-8'))
  await rm(root, { recursive: true, force: true })

  const findings = audit(manifest, css)

  console.log(`[vanity] audit over ${target ?? 'the fixture app'}\n`)
  console.log(formatAuditFindings(findings))

  if (findings.some(finding => finding.level === 'error'))
    process.exit(1)
}

const NAMING_VERB_PREFIXES = [
  'create',
  'define',
  'add',
  'augment',
  'overwrite',
  'expect',
  'get',
  'read',
  'is',
  'has',
  'can',
  'should',
  'assert',
  'require',
  'validate',
  'normalize',
  'prepare',
  'apply',
  'update',
  'parse',
  'format',
  'encode',
  'decode',
  'serialize',
  'deserialize',
  'compose',
  'merge',
  'derive',
  'resolve',
  'consolidate',
  'project',
  'restore',
  'copy',
  'clone',
  'freeze',
  'hash',
  'fingerprint',
  'visit',
  'walk',
  'compare',
  'sort',
  'order',
  'bind',
  'mount',
  'install',
  'register',
  'emit',
  'collect',
  'materialize',
  'build',
  'render',
  'prefix',
  'omit',
  'pick',
  'use',
  'inspect',
  'print',
  'run',
  'write',
  'load',
  'select',
  'plan',
  'transform',
  'invoke',
  'remove',
  'replace',
  'protect',
  'match',
  'nest',
  'declare',
  'report',
  'check',
  'describe',
  'explain',
  'diff',
  'setup',
  'ensure',
  'remember',
  'schedule',
  'configure',
  'handle',
  'start',
  'finish',
  'cover',
  'choose',
  'reconcile',
  'decorate',
  'switch',
  'clear',
  'set',
  'mark',
  'track',
  'send',
  'inject',
  'initialize',
  'append',
  'strip',
  'extract',
  'convert',
  'lower',
  'adapt',
  'fold',
  'evaluate',
  'consume',
  'join',
  'negate',
  'intersect',
  'dedupe',
  'call',
  'serialize',
  'record',
  'compile',
  'split',
  'count',
  'extend',
  'seal',
  'measure',
  'mix',
  'wire',
  'attach',
  'identify',
  'reorder',
  'warn',
  'execute',
  'compute',
  'find',
  'filter',
  'unwrap',
  'flatten',
  'indent',
  'preview',
  'throw',
  'fail',
  'export',
  'enrich',
  'measure',
  'group',
  'flush',
  'import',
  'round',
  'refresh',
  'hydrate',
  'infer',
  'query',
  'trigger',
  'place',
  'scope',
  'anchor',
  'enforce',
  'combine',
  'calculate',
  'map',
  'capitalize',
  'wrap',
  'preserve',
  'contain',
  'classify',
  'guard',
  'parenthesize',
  'reject',
] as const

/** Public result-named DSL and CSS vocabulary explicitly allowed by docs/language.md. */
const NAMING_ALLOWLIST = new Set([
  'class',
  'rules',
  'raw',
  'recipe',
  'anatomy',
  'atoms',
  'fragment',
  'port',
  'keyframes',
  'fontFace',
  'runtime',
  'transaction',
  'axis',
  'colorSchemes',
  'condition',
  'schemeIs',
  'defaultMode',
  'inLayer',
  'propsOf',
  'fromTokenGroup',
  'tokensOf',
  'namesOf',
  'varsOf',
  'snapshotFrom',
  'fromEntries',
  'mapRecord',
  'range',
  'propertyAliases',
  'ports',
  'inspectManifest',
  'explainManifestPath',
  'runVanityCli',
  'styleAutoImportDeclarations',
  'appAutoImportDeclarations',
  'styleExportNames',
  'didYouMean',
  'exportDesignTokens',
  'importDesignTokens',
  'diffManifests',
  'audit',
  'introspectSystem',
  'generateAgentContext',
  'captureEmission',
  'foldResultOf',
  'foldOf',
  'emitOf',
  'renderOf',
  'rendersLike',
  'defineVanityProject',
  'interpolate',
  'fluid',
  'customProperty',
  'cssNumber',
  'vanityPlugin',
  'hail',
  'hailSpan',
  'hailExact',
  'legibleOn',
  'lighten',
  'darken',
  'desaturate',
  'mix',
  'alpha',
  'angle',
  'aria',
  'calc',
  'channel',
  'clamp',
  'color',
  'colorMix',
  'container',
  'data',
  'displayP3',
  'flex',
  'frequency',
  'grid',
  'hsl',
  'hwb',
  'integer',
  'lab',
  'lch',
  'lightDark',
  'min',
  'max',
  'media',
  'number',
  'oklab',
  'oklch',
  'percent',
  'range',
  'resolution',
  'rgb',
  'rotate',
  'saturate',
  'scope',
  'selector',
  'supports',
  'systemRoot',
  'thisMode',
  'time',
  'unsafe',
  // Public labeled escape constructor and external Oxc visitor hook names.
  'value',
  'VariableDeclarator',
  'ImportSpecifier',
  'CallExpression',
  'Declaration',
  'dec',
  // Public authoring vocabulary and protocol-compatible method names.
  'root',
  'aa',
  'aaa',
  'lc',
  'from',
  'subtract',
  'multiply',
  'divide',
  'linear',
  'modular',
  'invalidColor',
  'forEach',
  // Vite plugin lifecycle hook names are framework-mandated.
  'config',
  'configResolved',
  // Public token-declaration shorthand and JavaScript Proxy protocol hook.
  'tdec',
  'ownKeys',
  // Public cascade and condition algebra vocabulary. These names are the
  // language users write, not implementation helpers that happen to be
  // attached to an emitter or condition object.
  'layer',
  'and',
  'or',
  'not',
  'to',
  'activate',
  'absoluteCondition',
  'scheme',
  'val',
  'tokens',
  'textContrast',
  // Public runtime, extension, and platform protocol names.
  'deprecated',
  'toString',
  'matches',
  'contains',
  'snapshot',
  'runtimeStyle',
  'runtimeProps',
  'fallback',
  'entries',
  'keys',
  'values',
  'checks',
  'introspect',
  'optionsIdentity',
  // Vanilla Extract and Vite own this lifecycle spelling; the adapter mirrors
  // it at the backend boundary instead of inventing a competing hook name.
  'onEndFileScope',
  'handler',
  'unstable_pluginFilter',
  // Hail's documented constructor/mixin vocabulary.
  'inE',
  'circle',
  'square',
  'truncate',
  'contrastOf',
  // The raw-value object is a public CSS data-type vocabulary, including
  // names that are not also first-class constructors yet.
  'unknown',
  'declaration',
  'percentage',
  'length',
  'numberPercentage',
  'lengthPercentage',
  'image',
  'position',
  'easingFunction',
  'transformFunction',
  'transformList',
  'customIdent',
  'dashedIdent',
  'string',
  'url',
  'plugin',
  // Audit category ids are the stable introspection taxonomy.
  'unusedTokens',
  'nearDuplicates',
  'contrast',
  'escapes',
  'scaleStrays',
  'focusVisibility',
  'rawAssertions',
  'aliasEscapes',
  'eagerStyleBarrels',
  'cssParityGaps',
  'staleArtifacts',
  'rootModeDisagreements',
  'ambiguousAxes',
  'mutableRootHazards',
  'nonportableValues',
  'specificityContexts',
])

export async function auditProductionNames(root = packageSourceRoot): Promise<void> {
  const roots = root === packageSourceRoot ? [root, ...packageToolingFiles] : [root]
  const files = (await Promise.all(roots.map(candidate => candidate.endsWith('.cjs') || candidate.endsWith('.mjs')
    ? [candidate]
    : sourceFiles(candidate)))).flat()
  const violations: string[] = []
  const displayRoot = root === packageSourceRoot ? packageDir : root

  for (const file of files) {
    if (isTestFile(file) || file.includes('/test-support/'))
      continue
    const source = await readFile(file, 'utf8')
    violations.push(...findNamingLawViolations(file, source, displayRoot))
  }

  if (violations.length > 0) {
    throw new Error([
      '[vanity] naming-law violations in production source:',
      ...violations.map(value => `  ${value}`),
      'Rename the operation with a documented verb or add a deliberate public-DSL exception to docs/language.md.',
    ].join('\n'))
  }
}

export interface HistoryVocabularyFinding {
  readonly file: string
  readonly line: number
  readonly match: string
  readonly source: string
}

/** Enforce the no-history naming law across the repository's live sources. */
export async function auditHistoryVocabulary(root = join(here, '..')): Promise<void> {
  const findings: HistoryVocabularyFinding[] = []
  for (const file of await historyVocabularyFiles(root)) {
    if (relative(root, file) === 'scripts/audit.ts')
      continue
    const source = await readFile(file, 'utf8')
    findings.push(...findHistoryVocabularyInSource(relative(root, file), source))
  }

  if (findings.length > 0) {
    throw new Error([
      '[vanity] history-vocabulary violations:',
      ...findings.map(finding => `  ${finding.file}:${finding.line} ${finding.match} — ${finding.source.trim()}`),
      'Name the current behavior, or add a narrowly documented current-use exception to historyVocabularyAllowlist.',
    ].join('\n'))
  }
}

/** Scan one source unit so the vocabulary rule stays directly testable. */
export function findHistoryVocabularyInSource(file: string, source: string): HistoryVocabularyFinding[] {
  const findings: HistoryVocabularyFinding[] = []
  for (const [lineIndex, line] of source.split('\n').entries()) {
    historyVocabularyPattern.lastIndex = 0
    for (const match of line.matchAll(historyVocabularyPattern)) {
      const value = match[0]
      const allowed = historyVocabularyAllowlist.some(entry => entry.file === file && line.includes(entry.line))
      if (!allowed) {
        findings.push({
          file,
          line: lineIndex + 1,
          match: value,
          source: line,
        })
      }
    }
  }
  return findings
}

/**
 * Check all production operation declarations in one source file. Keeping this
 * separate makes the audit rule testable with deliberately-invalid fixtures.
 */
export function findNamingLawViolations(file: string, source: string, root = packageDir): string[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const violations: string[] = []
  const check = (name: ts.PropertyName | ts.BindingName | undefined): void => {
    if (!name || !ts.isIdentifier(name))
      return
    const value = name.text
    if (value.startsWith('$') || value === 'constructor' || NAMING_ALLOWLIST.has(value))
      return
    if (NAMING_VERB_PREFIXES.some(prefix => value === prefix
      || (value.startsWith(prefix) && /^[A-Z]/.test(value.slice(prefix.length))))) {
      return
    }
    const position = tree.getLineAndCharacterOfPosition(name.getStart(tree)).line + 1
    violations.push(`${file.slice(root.length + (file.startsWith(root) ? 1 : 0))}:${position} ${value}`)
  }

  const visit = (node: ts.Node): void => {
    // Function declarations are operations even when they are local to a
    // production module; exported-only checking misses precisely these helpers.
    if (ts.isFunctionDeclaration(node))
      check(node.name)

    // MethodDeclaration covers both class methods and object-literal methods.
    if (ts.isMethodDeclaration(node))
      check(node.name)

    // Object-literal facades commonly expose callable operations as arrow
    // properties. Treat their public key as the operation name as well.
    if (ts.isPropertyAssignment(node)
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      check(node.name)
    }

    // Function-valued interface/type members are part of the public contract;
    // checking them prevents implementation names from escaping through a
    // structural surface.
    if (ts.isPropertySignature(node) && node.type && ts.isFunctionTypeNode(node.type))
      check(node.name)

    // Callable constants are named operations regardless of whether they are
    // exported directly or only become reachable through another facade.
    if (ts.isVariableDeclaration(node) && node.initializer
      && ts.isVariableDeclarationList(node.parent)
      && (node.parent.flags & ts.NodeFlags.Const) !== 0
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      check(node.name)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return violations
}

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory())
      files.push(...await sourceFiles(file))
    else if (entry.isFile() && file.endsWith('.ts'))
      files.push(file)
  }
  return files
}

async function historyVocabularyFiles(root: string): Promise<string[]> {
  const files = await Promise.all([
    ...historyScanDirectories.map(directory => historyFiles(join(root, directory))),
    ...historyScanFiles.map(file => [join(root, file)]),
  ])
  return files.flat().filter(file => historyScanExtensions.has(extname(file)))
}

async function historyFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const file = join(path, entry.name)
    if (entry.isDirectory()) {
      if (!['.cache', '.git', '.nuxt', '.output', '.turbo', '.vanity', 'coverage', 'dist', 'dist-ssr', 'node_modules', 'styled-system'].includes(entry.name))
        files.push(...await historyFiles(file))
    }
    else if (entry.isFile() && historyScanExtensions.has(extname(file))) {
      files.push(file)
    }
  }
  return files
}

function isTestFile(file: string): boolean {
  return file.endsWith('.test.ts') || file.endsWith('.test-d.ts') || file.endsWith('.dx.test.ts')
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
