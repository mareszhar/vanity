/**
 * Compare candidate public-type encodings against the repository's generated
 * scale fixtures. The measurements keep resolution API choices grounded in
 * compiler cost rather than in how small examples happen to feel.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { benchmarkScales } from '../benchmarks/scales'

interface TypeScriptMeasurement {
  checkMs?: number
  instantiations?: number
  memoryKb?: number
  totalMs?: number
  types?: number
  wallMs: number
}

interface CandidateMeasurement {
  declarationBytes: number
  finalDeclaration: string
  typecheck: TypeScriptMeasurement
}

const workspaceDir = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const outputDir = join(workspaceDir, '.vanity/benchmarks/resolution')

rmSync(outputDir, { recursive: true, force: true })
mkdirSync(outputDir, { recursive: true })

function chain(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, index) => {
    const previous = index === 0 ? 'self' : `${prefix}${index - 1}`
    // The first expression remains self-contained; the system leaf then
    // appears in shallow, medium, and deep positions throughout the chain.
    const other = index === 0 || index % 5 !== 0 ? 'self' : 'system'
    return `export const ${prefix}${index} = combine(${previous}, ${other})`
  }).join('\n')
}

function genericSource(count: number): string {
  return `
declare const value: unique symbol
type Resolution = 'self' | 'system'
interface GenericValue<Type, R extends Resolution> {
  readonly type: Type
  readonly [value]: { readonly resolution: R }
}
type ResolutionOf<V> = V extends GenericValue<unknown, infer R> ? R : never
type Join<A extends Resolution, B extends Resolution> = 'system' extends A | B ? 'system' : 'self'
declare function combine<A extends GenericValue<'length', Resolution>, B extends GenericValue<'length', Resolution>>(
  a: A,
  b: B,
): GenericValue<'length', Join<ResolutionOf<A>, ResolutionOf<B>>>
declare const self: GenericValue<'length', 'self'>
declare const system: GenericValue<'length', 'system'>
${chain('generic', count)}
`
}

function erasedSource(count: number): string {
  return `
declare const value: unique symbol
interface SelfValue<Type> {
  readonly type: Type
  readonly [value]: { readonly resolution: 'self' }
}
interface SystemValue<Type> {
  readonly type: Type
  readonly [value]: { readonly resolution: 'system' }
}
type AnyValue<Type> = SelfValue<Type> | SystemValue<Type>
declare function combine(a: SelfValue<'length'>, b: SelfValue<'length'>): SelfValue<'length'>
declare function combine(a: AnyValue<'length'>, b: AnyValue<'length'>): SystemValue<'length'>
declare const self: SelfValue<'length'>
declare const system: SystemValue<'length'>
${chain('erased', count)}
`
}

function number(output: string, label: string): number | undefined {
  const match = output.match(new RegExp(`^${label}:\\s+([\\d.]+)`, 'm'))
  return match ? Number(match[1]) : undefined
}

function tsc(args: string[]): { output: string, wallMs: number } {
  const start = performance.now()
  const result = spawnSync('pnpm', [
    'exec',
    'tsc',
    '--strict',
    '--skipLibCheck',
    '--ignoreConfig',
    '--target',
    'ESNext',
    '--module',
    'ESNext',
    '--moduleResolution',
    'Bundler',
    ...args,
  ], { cwd: workspaceDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const wallMs = performance.now() - start
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.status !== 0)
    throw new Error(output)
  return { output, wallMs }
}

function measure(file: string, declaration: string, finalName: string): CandidateMeasurement {
  const checked = tsc(['--noEmit', '--extendedDiagnostics', file])
  const total = number(checked.output, 'Total time')
  const check = number(checked.output, 'Check time')
  const declarationDir = join(outputDir, declaration)
  tsc(['--declaration', '--emitDeclarationOnly', '--outDir', declarationDir, file])
  const declarationFile = join(declarationDir, `${declaration}.d.ts`)
  const declarationText = readFileSync(declarationFile, 'utf8')
  const finalDeclaration = declarationText.split('\n').find(line => line.includes(` ${finalName}:`))?.trim() ?? ''

  return {
    declarationBytes: statSync(declarationFile).size,
    finalDeclaration,
    typecheck: {
      checkMs: check === undefined ? undefined : check * 1_000,
      instantiations: number(checked.output, 'Instantiations'),
      memoryKb: number(checked.output, 'Memory used'),
      totalMs: total === undefined ? undefined : total * 1_000,
      types: number(checked.output, 'Types'),
      wallMs: checked.wallMs,
    },
  }
}

const result = {
  protocol: 2,
  scales: benchmarkScales.map((scale) => {
    const count = scale.tokens
    const genericFile = join(outputDir, `${scale.name}-generic.ts`)
    const erasedFile = join(outputDir, `${scale.name}-erased.ts`)
    writeFileSync(genericFile, genericSource(count))
    writeFileSync(erasedFile, erasedSource(count))
    return {
      count,
      erased: measure(erasedFile, `${scale.name}-erased`, `erased${count - 1}`),
      generic: measure(genericFile, `${scale.name}-generic`, `generic${count - 1}`),
      scale: scale.name,
    }
  }),
}

writeFileSync(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))
