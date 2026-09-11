import { existsSync, readFileSync } from 'node:fs'
import { benchmarkScales } from '../benchmarks/scales'

const PACKAGE_BYTE_FIELDS = [
  'rootBytes',
  'presetsBytes',
  'runtimeBytes',
  'runtimeMinifiedBytes',
  'runtimeMinGzipBytes',
] as const

const SCALE_BYTE_FIELDS = [
  'declarationsBytes',
  'cssBytes',
  'cssGzipBytes',
  'manifestBytes',
  'manifestGzipBytes',
] as const

type PackageByteField = typeof PACKAGE_BYTE_FIELDS[number]

export interface BenchmarkScaleByteFacts {
  readonly declarationsBytes: number
  readonly cssBytes: number
  readonly cssGzipBytes: number
  readonly manifestBytes: number
  readonly manifestGzipBytes: number
}

export interface BenchmarkByteFacts {
  readonly package: Readonly<Record<PackageByteField, number>>
  readonly scales: Readonly<Record<string, BenchmarkScaleByteFacts>>
}

export interface BenchmarkByteResult {
  readonly package: Readonly<Record<PackageByteField, number>>
  readonly scales: readonly {
    readonly scale: { readonly name: string }
    readonly build: {
      readonly cssBytes: number
      readonly cssGzipBytes: number
      readonly manifestBytes: number
      readonly manifestGzipBytes: number
    }
    readonly declarations: { readonly bytes: number }
  }[]
}

export interface BenchmarkByteDifference {
  readonly path: string
  readonly actual?: number
  readonly expected?: number
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function readRecord(value: unknown, path: string, failures: string[]): Record<string, unknown> | undefined {
  const record = asRecord(value)
  if (record === undefined)
    failures.push(`benchmark accepted facts ${path} must be an object`)
  return record
}

function readNumber(value: unknown, path: string, failures: string[]): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    failures.push(`benchmark accepted facts ${path} must be a finite number`)
    return undefined
  }
  return value
}

function readPackageFacts(record: Record<string, unknown>, failures: string[]): BenchmarkByteFacts['package'] | undefined {
  const values = Object.fromEntries(PACKAGE_BYTE_FIELDS.map(field => [
    field,
    readNumber(record[field], `$.package.${field}`, failures),
  ])) as Partial<Record<PackageByteField, number | undefined>>

  if (PACKAGE_BYTE_FIELDS.some(field => values[field] === undefined))
    return undefined

  return values as BenchmarkByteFacts['package']
}

function readScaleFacts(record: Record<string, unknown>, path: string, failures: string[]): BenchmarkScaleByteFacts | undefined {
  const values = {
    declarationsBytes: readNumber(record.declarationsBytes, `${path}.declarationsBytes`, failures),
    cssBytes: readNumber(record.cssBytes, `${path}.cssBytes`, failures),
    cssGzipBytes: readNumber(record.cssGzipBytes, `${path}.cssGzipBytes`, failures),
    manifestBytes: readNumber(record.manifestBytes, `${path}.manifestBytes`, failures),
    manifestGzipBytes: readNumber(record.manifestGzipBytes, `${path}.manifestGzipBytes`, failures),
  }

  if (SCALE_BYTE_FIELDS.some(field => values[field] === undefined))
    return undefined

  return values as BenchmarkScaleByteFacts
}

export function readBenchmarkByteFacts(filePath: string, failures: string[]): BenchmarkByteFacts | undefined {
  if (!existsSync(filePath)) {
    failures.push(`benchmark accepted facts are missing: ${filePath}`)
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  }
  catch (error) {
    failures.push(`benchmark accepted facts could not be parsed: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }

  const root = readRecord(parsed, '$', failures)
  const packageRecord = root === undefined ? undefined : readRecord(root.package, '$.package', failures)
  const packageFacts = packageRecord === undefined ? undefined : readPackageFacts(packageRecord, failures)
  const scaleRecord = root === undefined ? undefined : readRecord(root.scales, '$.scales', failures)
  const expectedScaleNames: ReadonlySet<string> = new Set(benchmarkScales.map(scale => scale.name))
  const scales: Record<string, BenchmarkScaleByteFacts> = {}

  if (scaleRecord !== undefined) {
    for (const expectedName of expectedScaleNames) {
      if (!(expectedName in scaleRecord))
        failures.push(`benchmark accepted facts $.scales is missing ${expectedName}`)
    }
    for (const actualName of Object.keys(scaleRecord)) {
      if (!expectedScaleNames.has(actualName))
        failures.push(`benchmark accepted facts $.scales has unexpected scale ${actualName}`)
    }
    for (const expectedName of expectedScaleNames) {
      const scale = readRecord(scaleRecord[expectedName], `$.scales.${expectedName}`, failures)
      const facts = scale === undefined ? undefined : readScaleFacts(scale, `$.scales.${expectedName}`, failures)
      if (facts !== undefined)
        scales[expectedName] = facts
    }
  }

  if (packageFacts === undefined || Object.keys(scales).length !== expectedScaleNames.size)
    return undefined

  return { package: packageFacts, scales }
}

export function benchmarkByteFactsFromResult(result: BenchmarkByteResult): BenchmarkByteFacts {
  const scales: Record<string, BenchmarkScaleByteFacts> = {}
  for (const scale of result.scales) {
    scales[scale.scale.name] = {
      declarationsBytes: scale.declarations.bytes,
      cssBytes: scale.build.cssBytes,
      cssGzipBytes: scale.build.cssGzipBytes,
      manifestBytes: scale.build.manifestBytes,
      manifestGzipBytes: scale.build.manifestGzipBytes,
    }
  }

  return { package: result.package, scales }
}

export function compareBenchmarkByteFacts(
  actual: BenchmarkByteFacts,
  expected: BenchmarkByteFacts,
): BenchmarkByteDifference[] {
  const differences: BenchmarkByteDifference[] = []
  for (const field of PACKAGE_BYTE_FIELDS) {
    if (actual.package[field] !== expected.package[field]) {
      differences.push({
        path: `package.${field}`,
        actual: actual.package[field],
        expected: expected.package[field],
      })
    }
  }

  const scaleNames = new Set([...Object.keys(actual.scales), ...Object.keys(expected.scales)])
  for (const scaleName of [...scaleNames].sort()) {
    const actualScale = actual.scales[scaleName]
    const expectedScale = expected.scales[scaleName]
    for (const field of SCALE_BYTE_FIELDS) {
      if (actualScale?.[field] !== expectedScale?.[field]) {
        differences.push({
          path: `scales.${scaleName}.${field}`,
          actual: actualScale?.[field],
          expected: expectedScale?.[field],
        })
      }
    }
  }

  return differences
}

export function formatBenchmarkByteDifferences(
  differences: readonly BenchmarkByteDifference[],
  actualLabel: string,
  expectedLabel: string,
): string[] {
  return differences.map((difference) => {
    const actual = difference.actual === undefined ? 'missing' : `${formatBytes(difference.actual)} B`
    const expected = difference.expected === undefined ? 'missing' : `${formatBytes(difference.expected)} B`
    return `benchmark ${difference.path}: ${actualLabel} ${actual}, ${expectedLabel} ${expected}`
  })
}

export function countBenchmarkByteFacts(facts: BenchmarkByteFacts): number {
  return PACKAGE_BYTE_FIELDS.length + Object.keys(facts.scales).length * SCALE_BYTE_FIELDS.length
}

function formatBytes(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
