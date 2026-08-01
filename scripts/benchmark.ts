/**
 * Record Vanity's editor and compiler performance protocol at realistic
 * generated scales. This makes type latency, memory, and declaration shape
 * reviewable product evidence instead of an anecdotal local impression.
 */

import type {
  CompletionInfo,
  Diagnostic,
  LanguageService,
  LanguageServiceHost,
  RenameLocation,
} from 'typescript'
import type { BenchmarkScale } from '../benchmarks/scales'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { arch, platform, release } from 'node:os'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import ts from 'typescript'
import { benchmarkScales } from '../benchmarks/scales'

interface CommandMeasurement {
  output: string
  wallMs: number
}

interface TypeScriptMeasurement {
  instantiations?: number
  memoryKb?: number
  totalMs?: number
  types?: number
  wallMs: number
}

interface EditorMeasurement {
  completion: {
    axis: TimedCount
    case: TimedCount
    css: TimedCount
    deep: TimedCount
    root: TimedCount
    runtime: TimedCount
  }
  diagnostic: TimedCount
  rename: TimedCount
}

interface TimedCount {
  count: number
  medianMs: number
}

interface ScaleMeasurement {
  build: {
    cssBytes: number
    cssGzipBytes: number
    jsBytes: number
    jsGzipBytes: number
    manifestBytes: number
    manifestGzipBytes: number
    wallMs: number
  }
  declarations: {
    bytes: number
    files: number
    wallMs: number
  }
  editor: EditorMeasurement
  scale: BenchmarkScale
  typecheck: {
    cold: TypeScriptMeasurement
    incremental: TypeScriptMeasurement
  }
}

interface BenchmarkResult {
  environment: {
    architecture: string
    commit: string
    node: string
    os: string
    pnpm: string
    timestamp: string
    typescript: string
  }
  package: {
    rootBytes: number
    runtimeBytes: number
  }
  protocol: 1
  scales: ScaleMeasurement[]
}

interface PluginModule {
  create: (info: { languageService: LanguageService }) => LanguageService
}

const require = createRequire(import.meta.url)
const workspaceDir = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const fixturesRoot = join(workspaceDir, 'benchmarks/generated')
const artifactsRoot = join(workspaceDir, '.vanity/benchmarks')
const declarationsRoot = join(artifactsRoot, 'declarations')
const plugin = (require(resolve(workspaceDir, 'sdk/typescript.cjs')) as (modules: { typescript: typeof ts }) => PluginModule)({ typescript: ts })

function command(command: string, args: string[], cwd = workspaceDir): CommandMeasurement {
  const start = performance.now()
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
    maxBuffer: 128 * 1024 * 1024,
  })
  const wallMs = performance.now() - start
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

  if (result.status !== 0)
    throw new Error(`Command failed (${command} ${args.join(' ')})\n${output}`)

  return { output, wallMs }
}

function numeric(output: string, label: string): number | undefined {
  const match = output.match(new RegExp(`^${label}:\\s+([\\d.]+)`, 'm'))
  return match ? Number(match[1]) : undefined
}

function typeScriptMeasurement(config: string, cwd: string): TypeScriptMeasurement {
  const measured = command('pnpm', ['exec', 'tsc', '--project', config, '--extendedDiagnostics'], cwd)
  const seconds = numeric(measured.output, 'Total time')
  return {
    instantiations: numeric(measured.output, 'Instantiations'),
    memoryKb: numeric(measured.output, 'Memory used'),
    totalMs: seconds === undefined ? undefined : seconds * 1_000,
    types: numeric(measured.output, 'Types'),
    wallMs: measured.wallMs,
  }
}

function filesBelow(root: string): string[] {
  if (!existsSync(root))
    return []

  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

function timedCount<T>(action: () => readonly T[] | undefined, repetitions = 5): TimedCount {
  const times: number[] = []
  let count = 0

  for (let index = 0; index < repetitions; index++) {
    const start = performance.now()
    const result = action()
    times.push(performance.now() - start)
    count = result?.length ?? 0
  }

  return { count, medianMs: median(times) }
}

function markerPosition(source: string, marker: string): number {
  const index = source.indexOf(marker)
  if (index < 0)
    throw new Error(`Missing benchmark marker ${marker}`)
  return index + marker.length
}

function editorMeasurement(root: string): EditorMeasurement {
  const configPath = join(root, 'tsconfig.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  const overlays = new Map<string, string>()
  const versions = new Map<string, number>()
  const probes = resolve(root, 'src/probes.ts')
  const renameFile = resolve(root, 'src/modules/module-00.tokens.ts')

  const source = (path: string): string | undefined => overlays.get(path) ?? ts.sys.readFile(path)
  const host: LanguageServiceHost = {
    fileExists: ts.sys.fileExists,
    getCompilationSettings: () => parsed.options,
    getCurrentDirectory: () => root,
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    getScriptFileNames: () => parsed.fileNames,
    getScriptSnapshot: (path) => {
      const text = source(path)
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
    },
    getScriptVersion: path => String(versions.get(path) ?? 0),
    readDirectory: ts.sys.readDirectory,
    readFile: source,
  }
  const service = plugin.create({ languageService: ts.createLanguageService(host) })
  const probeSource = source(probes)!
  const renameSource = source(renameFile)!

  service.getProgram()?.getTypeChecker()

  const completion = (marker: string): TimedCount => {
    const position = markerPosition(probeSource, marker)
    return timedCount(() => {
      const result: CompletionInfo | undefined = service.getCompletionsAtPosition(probes, position, {})
      return result?.entries
    })
  }

  const diagnosticMarker = '/* @diagnostic */'
  const diagnosticPosition = markerPosition(probeSource, diagnosticMarker)
  const following = probeSource.slice(diagnosticPosition).match(/^token\d+/)?.[0]
  if (!following)
    throw new Error('Diagnostic benchmark marker must precede a token identifier')
  overlays.set(
    probes,
    `${probeSource.slice(0, diagnosticPosition)}tokne${following.slice(5)}${probeSource.slice(diagnosticPosition + following.length)}`,
  )
  versions.set(probes, 1)
  const diagnostic = timedCount((): readonly Diagnostic[] => service.getSemanticDiagnostics(probes), 3)

  const renamePosition = markerPosition(renameSource, '/* @rename */')
  const rename = timedCount((): readonly RenameLocation[] | undefined => {
    const info = service.getRenameInfo(renameFile, renamePosition)
    if (!info.canRename)
      return []
    return service.findRenameLocations(renameFile, renamePosition, false, false, true)
  }, 3)

  return {
    completion: {
      axis: completion('/* @complete-axis */'),
      case: completion('/* @complete-case */'),
      css: completion('/* @complete-css */'),
      deep: completion('/* @complete-deep */'),
      root: completion('/* @complete-root */'),
      runtime: completion('/* @complete-runtime */'),
    },
    diagnostic,
    rename,
  }
}

function declarationMeasurement(scale: BenchmarkScale, root: string): ScaleMeasurement['declarations'] {
  const outDir = join(declarationsRoot, scale.name)
  rmSync(outDir, { recursive: true, force: true })
  const measured = command('pnpm', ['exec', 'tsc', '--project', 'tsconfig.declarations.json'], root)
  const files = filesBelow(outDir).filter(path => extname(path).startsWith('.d.') || path.endsWith('.d.ts') || path.endsWith('.d.mts'))
  return {
    bytes: files.reduce((sum, path) => sum + statSync(path).size, 0),
    files: files.length,
    wallMs: measured.wallMs,
  }
}

function buildMeasurement(root: string): ScaleMeasurement['build'] {
  const dist = join(root, 'dist')
  const vanity = join(root, '.vanity')
  rmSync(dist, { recursive: true, force: true })
  rmSync(vanity, { recursive: true, force: true })
  const measured = command('pnpm', [
    '--dir',
    join(workspaceDir, 'sdk'),
    'exec',
    'vite',
    'build',
    root,
    '--config',
    join(root, 'vite.config.ts'),
  ])
  const css = filesBelow(dist).filter(path => extname(path) === '.css')
  const cssText = css.map(path => readFileSync(path)).reduce((all, next) => Buffer.concat([all, next]), Buffer.alloc(0))
  const js = filesBelow(dist).filter(path => ['.js', '.mjs'].includes(extname(path)))
  const jsText = js.map(path => readFileSync(path)).reduce((all, next) => Buffer.concat([all, next]), Buffer.alloc(0))
  const manifest = join(vanity, 'manifest.json')
  const manifestText = existsSync(manifest) ? readFileSync(manifest) : Buffer.alloc(0)
  return {
    cssBytes: cssText.byteLength,
    cssGzipBytes: gzipSync(cssText).byteLength,
    jsBytes: jsText.byteLength,
    jsGzipBytes: gzipSync(jsText).byteLength,
    manifestBytes: manifestText.byteLength,
    manifestGzipBytes: manifestText.byteLength === 0 ? 0 : gzipSync(manifestText).byteLength,
    wallMs: measured.wallMs,
  }
}

function measureScale(scale: BenchmarkScale): ScaleMeasurement {
  const root = join(fixturesRoot, scale.name)
  const buildInfo = join(artifactsRoot, `${scale.name}.tsbuildinfo`)
  const packageScope = join(root, 'node_modules/@mszr')
  const packageLink = join(packageScope, 'vanity')
  mkdirSync(packageScope, { recursive: true })
  if (!existsSync(packageLink))
    symlinkSync(relative(packageScope, join(workspaceDir, 'sdk')), packageLink, 'dir')
  rmSync(buildInfo, { force: true })

  console.log(`• ${scale.name}: cold typecheck`)
  const cold = typeScriptMeasurement('tsconfig.json', root)
  console.log(`• ${scale.name}: incremental typecheck`)
  const incremental = typeScriptMeasurement('tsconfig.json', root)
  console.log(`• ${scale.name}: declaration emit`)
  const declarations = declarationMeasurement(scale, root)
  console.log(`• ${scale.name}: editor operations`)
  const editor = editorMeasurement(root)
  console.log(`• ${scale.name}: Vite/CSS/manifest build`)
  const build = buildMeasurement(root)

  return {
    build,
    declarations,
    editor,
    scale,
    typecheck: { cold, incremental },
  }
}

mkdirSync(artifactsRoot, { recursive: true })
mkdirSync(declarationsRoot, { recursive: true })

const result: BenchmarkResult = {
  environment: {
    architecture: arch(),
    commit: command('git', ['rev-parse', '--short=8', 'HEAD']).output.trim(),
    node: process.version,
    os: `${platform()} ${release()}`,
    pnpm: command('pnpm', ['--version']).output.trim(),
    timestamp: new Date().toISOString(),
    typescript: ts.version,
  },
  package: {
    rootBytes: statSync(join(workspaceDir, 'sdk/dist/index.mjs')).size,
    runtimeBytes: statSync(join(workspaceDir, 'sdk/dist/runtime.mjs')).size,
  },
  protocol: 1,
  scales: benchmarkScales.map(measureScale),
}

const output = join(artifactsRoot, 'current.json')
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
console.log(`✓ wrote ${relative(workspaceDir, output)}`)
