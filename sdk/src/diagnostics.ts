/**
 * Diagnostics are a contract ([patterns.md §10]): exactly one per mistake,
 * naming the offending key and the fix. Stable `VANITY_*` codes are asserted
 * by the editor-DX suites; renaming one is a breaking change.
 */

export type VanityDiagnosticCode
  = | 'VANITY_TOKENS_CYCLE'
    | 'VANITY_TOKENS_CONTRAST'
    | 'VANITY_TOKENS_DUPLICATE'
    | 'VANITY_TOKENS_INVALID_AXES'
    | 'VANITY_TOKENS_INVALID_COLOR'
    | 'VANITY_TOKENS_INVALID_CONFIG'
    | 'VANITY_TOKENS_INVALID_DECLARATION_BUNDLE'
    | 'VANITY_TOKENS_INVALID_DEFINITION'
    | 'VANITY_TOKENS_INVALID_NAME'
    | 'VANITY_TOKENS_INVALID_OVERRIDE'
    | 'VANITY_TOKENS_MISSING'
    | 'VANITY_TOKENS_TRAIT_CONFLICT'
    | 'VANITY_TOKENS_UNKNOWN_REF'
    | 'VANITY_TOKENS_UNKNOWN_AXIS'
    | 'VANITY_TOKENS_UNKNOWN_MODE'
    | 'VANITY_TOKEN_MODULE_INCOMPATIBLE'
    | 'VANITY_SYSTEM_INCOMPATIBLE'
    | 'VANITY_SYSTEM_COLLISION'
    | 'VANITY_SYSTEM_INVALID_AXIS'
    | 'VANITY_SYSTEM_INVALID_DEFINITION'
    | 'VANITY_SYSTEM_CONDITION_COLLISION'
    | 'VANITY_SYSTEM_INVALID_CONDITION'
    | 'VANITY_SYSTEM_INVALID_PREFIX'
    | 'VANITY_SYSTEM_INVALID_ROOT'
    | 'VANITY_SYSTEM_IN_STYLE_MODULE'
    | 'VANITY_SYSTEM_UNKNOWN_LAYER'
    | 'VANITY_SYSTEM_MISSING'
    | 'VANITY_POLICY_CONFLICT'
    | 'VANITY_POLICY_INVALID'
    | 'VANITY_POLICY_MISSING'
    | 'VANITY_POLICY_RESTRICTED_CONSTRUCTOR'
    | 'VANITY_SYSTEM_SINGULAR_ADD_THRESHOLD'
    | 'VANITY_CSS_INVALID_KEY'
    | 'VANITY_CSS_INVALID_RAW'
    | 'VANITY_CSS_INVALID_SELECTOR'
    | 'VANITY_CSS_INVALID_VALUE'
    | 'VANITY_CSS_UNKNOWN_CONDITION'
    | 'VANITY_CSS_UNKNOWN_PROPERTY'
    | 'VANITY_PORT_INVALID_DEFAULT'
    | 'VANITY_RECIPE_INVALID_KEY'
    | 'VANITY_RECIPE_UNKNOWN_VARIANT'
    | 'VANITY_RECIPE_UNKNOWN_VALUE'
    | 'VANITY_ANATOMY_UNKNOWN_PART'
    | 'VANITY_ANATOMY_INVALID_CONDITION'
    | 'VANITY_ATOMS_UNKNOWN_CONDITION'
    | 'VANITY_ATOMS_KEY_COLLISION'
    | 'VANITY_DTCG_CODEC'
    | 'VANITY_DTCG_INVALID_DOCUMENT'
    | 'VANITY_DTCG_INVALID_VALUE'
    | 'VANITY_DTCG_REFERENCE'
    | 'VANITY_DTCG_UNSUPPORTED'
    | 'VANITY_VALUE_INVALID'
    | 'VANITY_VITE_BUILD_FAILED'
    | 'VANITY_VITE_PLUGIN_MISSING'
    | 'VANITY_STYLE_MODULE_MISUSE'
    | 'VANITY_AMBIENT_SOURCE_DECLARATION'
    | 'VANITY_AUTO_IMPORT_INVALID'
    | 'VANITY_APP_AUTO_IMPORT_STYLE_MODULE'
    | 'VANITY_AUTO_IMPORT_DECLARATIONS_NOT_INCLUDED'
    | 'VANITY_CLI_INVALID_USAGE'
    | 'VANITY_COMPILER_INVALID_INPUT'
    | 'VANITY_CONFIG_INVALID'
    | 'VANITY_COLLECTION_INVALID'
    | 'VANITY_HAIL_INVALID_CONFIG'
    | 'VANITY_MANIFEST_INVALID'
    | 'VANITY_PORT_INVALID_CONFIG'
    | 'VANITY_SUBSTRATE_INVALID_STATE'
    | 'VANITY_TESTING_INVALID_INPUT'

export interface VanityDiagnosticRelatedInput {
  /** Why this source site matters to the primary diagnostic. */
  message: string
  file: string
  /** One-based source line. */
  line?: number
  /** One-based source column. */
  column?: number
}

export interface VanityDiagnosticFix {
  /** Human repair instruction. */
  readonly message: string
  /** Optional machine-applicable replacement. */
  readonly replacement?: string
  readonly file?: string
  readonly line?: number
  readonly column?: number
  readonly endLine?: number
  readonly endColumn?: number
}

export interface VanityDiagnosticRelated extends VanityDiagnosticRelatedInput {
  readonly endLine?: number
  readonly endColumn?: number
}

/** Authoring-friendly input accepted throughout the compiler. */
export interface VanityDiagnosticInput {
  code: VanityDiagnosticCode
  severity?: 'error' | 'warning' | 'info'
  /** The headline: what is wrong, naming the offending key or token path. */
  message: string
  /** Supporting detail lines (resolved values, comparisons). */
  detail?: readonly string[]
  /** The dot path of the offending key, e.g. `color.onBrand`. */
  path?: string | readonly string[]
  /** The style module being evaluated, when known. */
  file?: string
  /** One-based source line, present only when the compiler can prove it. */
  line?: number
  /** One-based source column, present only when the compiler can prove it. */
  column?: number
  /** Other authored sites needed to understand or repair this diagnostic. */
  related?: readonly VanityDiagnosticRelatedInput[]
  /** The suggested fix. */
  fix?: string | VanityDiagnosticFix
}

/** Normalized structured output delivered by errors, sinks, overlays, and integrations. */
export interface VanityDiagnostic {
  readonly code: VanityDiagnosticCode
  readonly severity: 'error' | 'warning' | 'info'
  readonly message: string
  readonly detail?: readonly string[]
  readonly path?: readonly string[]
  readonly file?: string
  readonly line?: number
  readonly column?: number
  readonly endLine?: number
  readonly endColumn?: number
  readonly related?: readonly VanityDiagnosticRelated[]
  readonly fix?: VanityDiagnosticFix
}

/** Stable terminal/overlay rendering for one structured diagnostic. */
export function formatVanityDiagnostic(input: VanityDiagnostic | VanityDiagnosticInput): string {
  const diagnostic = normalizeDiagnostic(input)
  const lines = [`✖ ${diagnostic.code}  ${diagnostic.message}`]

  for (const detail of diagnostic.detail ?? [])
    lines.push(`    ${detail}`)

  if (diagnostic.file) {
    const position = diagnostic.line === undefined
      ? ''
      : `:${diagnostic.line}${diagnostic.column === undefined ? '' : `:${diagnostic.column}`}`
    lines.push(`    at ${diagnostic.file}${position}`)
  }

  for (const related of diagnostic.related ?? []) {
    const position = related.line === undefined
      ? ''
      : `:${related.line}${related.column === undefined ? '' : `:${related.column}`}`
    lines.push(`    related: ${related.message} at ${related.file}${position}`)
  }

  if (diagnostic.fix)
    lines.push(`  fix: ${diagnostic.fix.message}`)

  return lines.join('\n')
}

/** Structured error carrying one or more normalized diagnostics: `error instanceof VanityError`. */
export class VanityError extends Error {
  readonly diagnostics: readonly VanityDiagnostic[]
  readonly code: VanityDiagnosticCode

  constructor(
    diagnostics:
      | VanityDiagnostic
      | VanityDiagnosticInput
      | readonly (VanityDiagnostic | VanityDiagnosticInput)[],
    options: { cause?: unknown } = {},
  ) {
    const input = Array.isArray(diagnostics)
      ? diagnostics as readonly (VanityDiagnostic | VanityDiagnosticInput)[]
      : [diagnostics as VanityDiagnostic | VanityDiagnosticInput]
    const all = input.map(normalizeDiagnostic)
    super(all.map(formatVanityDiagnostic).join('\n\n'))
    this.name = 'VanityError'
    this.diagnostics = all
    this.code = all[0].code

    if ('cause' in options)
      Object.defineProperty(this, 'cause', { configurable: true, value: options.cause })

    const authoredFrames = formatDiagnosticFrames(all)
    if (authoredFrames.length > 0) {
      const runtimeFrames = (this.stack ?? '')
        .split('\n')
        .filter(line => /^\s*at\s/.test(line))
      this.stack = [`${this.name}: ${this.message}`, ...authoredFrames, ...runtimeFrames].join('\n')
    }
  }
}

function formatDiagnosticFrames(diagnostics: readonly VanityDiagnostic[]): string[] {
  const seen = new Set<string>()
  const frames: string[] = []
  const add = (label: string, file: string, line?: number, column?: number): void => {
    if (line === undefined)
      return
    const location = `${file}:${line}${column === undefined ? '' : `:${column}`}`
    if (seen.has(location))
      return
    seen.add(location)
    frames.push(`    at ${formatStackLabel(label)} (${location})`)
  }

  for (const diagnostic of diagnostics) {
    if (diagnostic.file)
      add(diagnostic.path?.join('.') ?? diagnostic.code, diagnostic.file, diagnostic.line, diagnostic.column)
    for (const related of diagnostic.related ?? [])
      add(related.message, related.file, related.line, related.column)
  }

  return frames
}

function formatStackLabel(label: string): string {
  const normalized = label.replaceAll(/[^\w$.-]+/g, '_')
  return `vanity.${normalized || 'authored'}`
}

interface VanitySourcePoint {
  line: number
  column: number
}

export interface VanitySourceLocation extends VanitySourcePoint {
  file: string
}

interface VanitySourceContext {
  file: string
  call: VanitySourcePoint
  locations: Record<string, VanitySourcePoint[]>
}

const SOURCE_MAPS = Symbol.for('vanity.sourceMaps')
const CURRENT_SOURCE = Symbol.for('vanity.currentSource')
const WITH_SOURCE = Symbol.for('vanity.withSource')

/** A style-module evaluation is one provenance universe; prior graphs cannot leak into it. */
export function clearDiagnosticSources(): void {
  const state = globalThis as typeof globalThis & Record<symbol, unknown>
  state[SOURCE_MAPS] = new Map<string, VanitySourceContext>()
  state[CURRENT_SOURCE] = undefined
  state[WITH_SOURCE] = <T>(context: VanitySourceContext, key: string, run: () => T): T => {
    state[CURRENT_SOURCE] = context
    const maps = state[SOURCE_MAPS] as Map<string, VanitySourceContext>
    maps.set(key, context)
    return run()
  }
}

/**
 * Normalize one author-friendly diagnostic into the immutable public shape.
 *
 * @example
 * `normalizeDiagnostic({ code: 'VANITY_CSS_INVALID_VALUE', message: 'invalid value', path: 'color.brand' })`
 */
export function normalizeDiagnostic(input: VanityDiagnostic | VanityDiagnosticInput): VanityDiagnostic {
  const diagnostic = createDiagnostic(input)
  if (diagnostic.line !== undefined)
    return diagnostic

  const source = getDiagnosticSource(diagnostic.path?.join('.'))

  return source === undefined ? diagnostic : { ...diagnostic, ...source }
}

function createDiagnostic(input: VanityDiagnostic | VanityDiagnosticInput): VanityDiagnostic {
  const path = input.path === undefined
    ? undefined
    : typeof input.path === 'string' ? input.path.split('.') : [...input.path]
  const fix = input.fix === undefined
    ? undefined
    : typeof input.fix === 'string' ? { message: input.fix } : input.fix
  return Object.freeze({
    code: input.code,
    severity: input.severity ?? 'error',
    message: input.message,
    ...(input.detail === undefined ? {} : { detail: Object.freeze([...input.detail]) }),
    ...(path === undefined ? {} : { path: Object.freeze(path) }),
    ...(input.file === undefined ? {} : { file: input.file }),
    ...(input.line === undefined ? {} : { line: input.line }),
    ...(input.column === undefined ? {} : { column: input.column }),
    ...('endLine' in input && input.endLine !== undefined ? { endLine: input.endLine } : {}),
    ...('endColumn' in input && input.endColumn !== undefined ? { endColumn: input.endColumn } : {}),
    ...(input.related === undefined
      ? {}
      : { related: Object.freeze(input.related.map(related => Object.freeze({ ...related }))) }),
    ...(fix === undefined ? {} : { fix: Object.freeze({ ...fix }) }),
  })
}

export type VanityDiagnosticSink = (diagnostic: VanityDiagnostic) => void

/** One hook-shaped diagnostics boundary shared by compilers and integrations. */
export function reportDiagnostics(
  sink: VanityDiagnosticSink | undefined,
  diagnostics: VanityDiagnostic | VanityDiagnosticInput | readonly (VanityDiagnostic | VanityDiagnosticInput)[],
): void {
  if (!sink)
    return
  const entries = Array.isArray(diagnostics)
    ? diagnostics as readonly (VanityDiagnostic | VanityDiagnosticInput)[]
    : [diagnostics as VanityDiagnostic | VanityDiagnosticInput]
  for (const diagnostic of entries)
    sink(normalizeDiagnostic(diagnostic))
}

/** Exact compiler-owned provenance for manifests and diagnostics. */
export function getDiagnosticSource(path?: string): VanitySourceLocation | undefined {
  const state = globalThis as typeof globalThis & Record<symbol, unknown>
  const current = state[CURRENT_SOURCE] as VanitySourceContext | undefined
  const direct = current && getSourcePoint(current, path)

  if (direct)
    return { file: current!.file, ...direct }

  const maps = state[SOURCE_MAPS]

  if (maps instanceof Map) {
    const matches: Array<{ context: VanitySourceContext, point: VanitySourcePoint }> = []

    for (const context of maps.values()) {
      const point = getSourcePoint(context as VanitySourceContext, path)
      if (point)
        matches.push({ context: context as VanitySourceContext, point })
    }

    if (matches.length === 1)
      return { file: matches[0].context.file, ...matches[0].point }
  }

  // A call site is still trustworthy for diagnostics without a structural
  // path (setup/whole-call failures); never invent a property location.
  if (current && path === undefined)
    return { file: current.file, ...current.call }

  return undefined
}

function getSourcePoint(context: VanitySourceContext, path: string | undefined): VanitySourcePoint | undefined {
  if (path === undefined)
    return undefined

  const exact = context.locations[path] ?? []

  if (exact.length === 1)
    return exact[0]

  const suffix = Object.entries(context.locations)
    .filter(([candidate]) => candidate.endsWith(`.${path}`))
    .flatMap(([, points]) => points)

  return suffix.length === 1 ? suffix[0] : undefined
}

/** `did you mean 'md'?` — the enumerable-fix suggestion, shared by overrides and checks. */
export function didYouMean(input: string, candidates: readonly string[]): string | undefined {
  let best: { candidate: string, distance: number } | undefined

  for (const candidate of candidates) {
    const distance = measureEditDistance(input, candidate)

    if (distance <= Math.max(2, Math.floor(candidate.length / 3)) && (!best || distance < best.distance))
      best = { candidate, distance }
  }

  return best?.candidate
}

function measureEditDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = Array.from<number>({ length: b.length + 1 }).fill(0)
    row[0] = i
    return row
  })

  for (let j = 0; j <= b.length; j++)
    rows[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }

  return rows[a.length][b.length]
}
