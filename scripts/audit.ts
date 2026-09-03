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
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { audit, formatAuditFindings } from '../sdk/src/introspect/audit'

const here = fileURLToPath(new URL('.', import.meta.url))
const packageDir = join(here, '..', 'sdk')

/** Tooling resolves from the package, exactly as the plugin ships it. */
const requireFromPackage = createRequire(join(packageDir, 'package.json'))

async function main(): Promise<void> {
  await auditProductionNames()

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
  'unit',
  'at',
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
  'to',
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
  'end',
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
])

export async function auditProductionNames(root = join(packageDir, 'src')): Promise<void> {
  const files = await sourceFiles(root)
  const violations: string[] = []

  for (const file of files) {
    if (isTestFile(file) || file.includes('/test-support/'))
      continue
    const source = await readFile(file, 'utf8')
    violations.push(...findNamingLawViolations(file, source, root))
  }

  if (violations.length > 0) {
    throw new Error([
      '[vanity] naming-law violations in production source:',
      ...violations.map(value => `  ${value}`),
      'Rename the operation with a documented verb or add a deliberate public-DSL exception to docs/language.md.',
    ].join('\n'))
  }
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
    if (NAMING_VERB_PREFIXES.some(prefix => value.startsWith(prefix)))
      return
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

function isTestFile(file: string): boolean {
  return file.endsWith('.test.ts') || file.endsWith('.test-d.ts') || file.endsWith('.dx.test.ts')
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
