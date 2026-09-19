import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

interface Measurement {
  readonly wallMs: number
  readonly totalMs?: number
  readonly instantiations?: number
  readonly memoryKb?: number
}

interface BenchmarkScaleReceipt {
  readonly scale: { readonly name: string }
  readonly typecheck: { readonly cold: Measurement, readonly incremental: Measurement }
  readonly editor: {
    readonly completion: Record<string, { readonly medianMs: number }>
    readonly diagnostic: { readonly medianMs: number }
    readonly rename: { readonly medianMs: number }
  }
  readonly declarations: { readonly bytes: number, readonly wallMs: number }
  readonly build: {
    readonly cssBytes: number
    readonly cssGzipBytes: number
    readonly manifestBytes: number
    readonly manifestGzipBytes: number
    readonly wallMs: number
  }
}

interface BenchmarkReceipt {
  readonly environment: {
    readonly architecture: string
    readonly commit: string
    readonly node: string
    readonly os: string
    readonly pnpm: string
    readonly timestamp: string
    readonly typescript: string
  }
  readonly package: {
    readonly rootBytes: number
    readonly presetsBytes: number
    readonly runtimeBytes: number
    readonly runtimeMinifiedBytes: number
    readonly runtimeMinGzipBytes: number
  }
  readonly scales: readonly BenchmarkScaleReceipt[]
}

const workspaceDir = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const receiptPath = join(workspaceDir, '.vanity/benchmarks/current.json')
const documentationPath = join(workspaceDir, 'docs/maintainers/benchmarks.md')
const startMarker = '<!-- benchmark-receipt:start -->'
const endMarker = '<!-- benchmark-receipt:end -->'
const write = process.argv.includes('--write')

function number(value: number | undefined, label: string): number {
  if (value === undefined || !Number.isFinite(value))
    throw new Error(`The benchmark receipt is missing ${label}`)
  return value
}

function bytes(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function seconds(value: number, digits = 2): string {
  return `${(value / 1_000).toFixed(digits)}s`
}

function editor(scale: BenchmarkScaleReceipt, name: string): string {
  return `${number(scale.editor.completion[name]?.medianMs, `${scale.scale.name} ${name} completion`).toFixed(3)}ms`
}

function render(receipt: BenchmarkReceipt): string {
  const { environment, package: packageSizes, scales } = receipt
  const date = environment.timestamp.slice(0, 10)
  const typeRows = scales.map((scale) => {
    const cold = scale.typecheck.cold
    const incremental = scale.typecheck.incremental
    return `| ${capitalize(scale.scale.name)} | ${seconds(number(cold.totalMs, `${scale.scale.name} cold totalMs`))} / ${seconds(cold.wallMs, 3)} | ${bytes(number(cold.instantiations, `${scale.scale.name} instantiations`))} | ${bytes(number(cold.memoryKb, `${scale.scale.name} memoryKb`))} kB | ${seconds(number(incremental.totalMs, `${scale.scale.name} incremental totalMs`))} / ${seconds(incremental.wallMs, 3)} |`
  })
  const editorRows = scales.map(scale => `| ${capitalize(scale.scale.name)} | ${editor(scale, 'root')} | ${editor(scale, 'deep')} | ${editor(scale, 'axis')} | ${editor(scale, 'case')} | ${editor(scale, 'runtime')} | ${editor(scale, 'css')} | ${number(scale.editor.diagnostic.medianMs, `${scale.scale.name} diagnostic`).toFixed(3)}ms | ${number(scale.editor.rename.medianMs, `${scale.scale.name} rename`).toFixed(3)}ms |`)
  const outputRows = scales.map(scale => `| ${capitalize(scale.scale.name)} | ${seconds(scale.declarations.wallMs, 3)} / ${bytes(scale.declarations.bytes)} B | ${seconds(scale.build.wallMs, 3)} | ${bytes(scale.build.cssBytes)} B / ${bytes(scale.build.cssGzipBytes)} B | ${bytes(scale.build.manifestBytes)} B / ${bytes(scale.build.manifestGzipBytes)} B |`)

  return [
    `## Accepted baseline — ${date}`,
    '',
    `Recorded at ${environment.timestamp} from the worktree based on HEAD ${environment.commit}. Environment: ${environment.os} ${environment.architecture}, Node ${environment.node}, pnpm ${environment.pnpm}, TypeScript ${environment.typescript}. Wall-clock measurements are local one-run signals. Source receipt: \`.vanity/benchmarks/current.json\`.`,
    '',
    '| Scale | Cold TS / wall | Instantiations | Memory | Incremental TS / wall |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...typeRows,
    '',
    '| Scale | Root | Deep | Axis | Case | Runtime | CSS | Diagnostic | Rename |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...editorRows,
    '',
    '| Scale | Declaration emit / bytes | Vite build | CSS raw / gzip | Manifest v4 raw / gzip |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...outputRows,
    '',
    `Package entries: root ${bytes(packageSizes.rootBytes)} B raw; runtime ${bytes(packageSizes.runtimeBytes)} B raw, ${bytes(packageSizes.runtimeMinifiedBytes)} B minified, and ${bytes(packageSizes.runtimeMinGzipBytes)} B min+gzip; Hail presets ${bytes(packageSizes.presetsBytes)} B raw.`,
  ].join('\n')
}

function capitalize(value: string): string {
  return value[0]!.toUpperCase() + value.slice(1)
}

const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as BenchmarkReceipt
const documentation = readFileSync(documentationPath, 'utf8')
const start = documentation.indexOf(startMarker)
const end = documentation.indexOf(endMarker)
if (start < 0 || end <= start)
  throw new Error(`Expected generated benchmark markers in ${documentationPath}`)

const contentStart = start + startMarker.length
const generated = render(receipt)
const actual = documentation.slice(contentStart, end).trim()
if (actual === generated) {
  console.log(`✓ benchmark tables match ${receipt.environment.timestamp} (${receipt.environment.commit})`)
}
else if (write) {
  const updated = `${documentation.slice(0, contentStart)}\n\n${generated}\n\n${documentation.slice(end)}`
  writeFileSync(documentationPath, updated)
  console.log(`✓ updated benchmark tables from ${receipt.environment.timestamp}`)
}
else {
  throw new Error('Benchmark tables do not match .vanity/benchmarks/current.json; run `pnpm run bench:docs:update` after reviewing the receipt')
}
