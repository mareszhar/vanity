import type { VanityEngine } from '../engine/createEngine'
import type { VanityTokenRecord } from '../internal/inspect'
import type { VanityDtcgCodec, VanityInterchangeSystem, VanityJsonValue } from '../internal/interchange'
import type { VanityGraphInput, VanityTokenModule, VanityTokenPolicy } from '../tokens/types'
import type { VanityCssDataType } from '../values/types'
import { createEngine, enginePrivate } from '../engine/createEngine'
import { VANITY_SYSTEM_INTERCHANGE } from '../internal/interchange'
import { engineOfOpenSystem } from '../system/openSystem'
import { finalizeTokenModule, graphOf, isTokenBuilder, tokenInspectionsOf } from '../tokens/graph'
import { parseColor } from '../tokens/math'
import { compositeNode, ExpressionValue, inputNode, rawNode } from '../values/protocol'

/** Vanity's authored DTCG extension key: `document.$extensions?.[VANITY_DTCG_EXTENSION]`. */
export const VANITY_DTCG_EXTENSION = 'com.mszr.vanity' as const
/** Current authored DTCG extension version: `VANITY_DTCG_EXTENSION_VERSION === 1`. */
export const VANITY_DTCG_EXTENSION_VERSION = 1 as const

/** A standard Design Tokens document: `const document: VanityDtcgDocument = exportDesignTokens(ds)`. */
export type VanityDtcgDocument = Readonly<Record<string, unknown>>
export type VanityDtcgExportMode = 'resolved' | 'authored'

type VanityDtcgSystemContext = {
  readonly defineTokens: unknown
} & (
  | { readonly tdef: unknown }
  | { readonly token: unknown }
)

export interface VanityDtcgExportOptions {
  readonly mode?: VanityDtcgExportMode
  readonly environment?: Readonly<Record<string, string>>
  /** Strict is the default: one unrepresentable/nonportable token fails the document. */
  readonly strict?: boolean
  /** Required when exporting an unfinished module rather than a finalized system. */
  readonly system?: VanityDtcgSystemContext
  readonly prefix?: string
  readonly root?: string
}

export interface VanityDtcgImportOptions {
  /** Defaults to a zero-config open system for ordinary standard DTCG documents. */
  readonly system?: VanityDtcgSystemContext
  readonly strict?: boolean
  /** External references never resolve unless this explicit capability is supplied. */
  readonly resolveExternal?: (reference: string) => unknown
}

export interface VanityDtcgAuthoredExtension {
  readonly version: typeof VANITY_DTCG_EXTENSION_VERSION
  readonly mode: 'authored'
  readonly system: {
    readonly prefix: string
    readonly root: string
    readonly axisOrder: readonly string[]
  }
  readonly tokens: Readonly<Record<string, VanityDtcgAuthoredToken>>
}

export interface VanityDtcgAuthoredToken {
  readonly type: VanityCssDataType
  readonly reference: 'val' | 'var'
  readonly emit: boolean
  readonly mutable: boolean
  readonly root?: string
  readonly layer?: string
  readonly val: VanityDtcgEncodedValue
  readonly branches: readonly {
    readonly address: VanityTokenRecord['semantic']['branches'][number]['address']
    readonly val: VanityDtcgEncodedValue
  }[]
  readonly register?: VanityTokenRecord['semantic']['registration']
  readonly metadata: Readonly<Record<string, unknown>>
  readonly description?: string
  readonly deprecated?: string
  readonly expression: VanityTokenRecord['semantic']['expression']
  readonly lossy?: true
}

export interface VanityDtcgEncodedValue {
  readonly css: string | number | null
  readonly dependencies: readonly { readonly path: string, readonly name?: `--${string}` }[]
  readonly codec?: { readonly id: string, readonly version: string | number, readonly payload: VanityJsonValue }
}

interface ExportSource {
  readonly graph: NonNullable<ReturnType<typeof graphOf>>
  readonly codecs: readonly VanityDtcgCodec[]
}

/** Export either a standard environment snapshot or a Vanity-authored round-trip document. */
export function exportDesignTokens(
  source: object,
  options: VanityDtcgExportOptions = {},
): VanityDtcgDocument {
  const resolved = exportSource(source, options)
  const records = tokenInspectionsOf(resolved.graph)
  const mode = options.mode ?? 'resolved'
  const strict = options.strict ?? true
  const environment = {
    ...Object.fromEntries((resolved.graph.axes?.order ?? []).flatMap((axis) => {
      const fallback = resolved.graph.axes!.definitions[axis]!.defaultMode
      return fallback === undefined ? [] : [[axis, fallback]]
    })),
    ...options.environment,
  }
  for (const [axis, mode] of Object.entries(environment)) {
    const definition = resolved.graph.axes?.definitions[axis]
    if (!definition || !(mode in definition.modes))
      throw new TypeError(`[vanity] DTCG export environment selects unknown axis mode '${axis}.${mode}'`)
  }
  const document: Record<string, unknown> = {}
  restoreGroupExtensions(document, records)

  for (const token of records) {
    try {
      const css = selectedCss(token, resolved.graph.axes?.order ?? [], environment)
      const carrier = standardCarrier(token.semantic.type, css, token, records)
      setToken(document, token.path.split('.'), {
        ...(carrier.type === undefined ? {} : { $type: carrier.type }),
        $value: carrier.value,
        ...(token.description === undefined ? {} : { $description: token.description }),
        ...unknownExtensions(token.semantic.metadata),
      })
    }
    catch (error) {
      if (mode === 'resolved')
        throw exportError(token.path, error)
      let css: string | number
      try {
        css = selectedCss(token, resolved.graph.axes?.order ?? [], environment)
      }
      catch {
        // A no-default/reserved token has no honest standard carrier. Its full
        // authored contract still lives in the Vanity extension below.
        continue
      }
      setToken(document, token.path.split('.'), {
        $value: css,
        ...(token.description === undefined ? {} : { $description: token.description }),
        ...unknownExtensions(token.semantic.metadata),
      })
    }
  }

  if (mode === 'authored') {
    const authored: Record<string, VanityDtcgAuthoredToken> = {}
    for (const token of records) {
      if (token.semantic.portability.status === 'nonportable' && strict)
        throw new TypeError(`[vanity] ${token.path} is not losslessly portable: ${token.semantic.portability.reason}`)

      const css = token.css
      authored[token.path] = {
        type: token.semantic.type,
        reference: token.semantic.reference,
        emit: token.semantic.emit,
        mutable: token.semantic.mutable,
        ...(token.root === undefined || token.root === resolved.graph.root ? {} : { root: token.root }),
        ...(token.layer === undefined
          ? {}
          : { layer: token.layer.startsWith(`${resolved.graph.prefix}.`) ? token.layer.slice(resolved.graph.prefix.length + 1) : token.layer }),
        val: encodedValue(token.semantic.hasDefault ? css : null, token, token.semantic.expression, resolved.codecs),
        branches: token.semantic.branches.map(branch => ({
          address: branch.address,
          val: encodedValue(branch.val, token, branch.expression, resolved.codecs),
        })),
        ...(token.semantic.registration === undefined ? {} : { register: token.semantic.registration }),
        metadata: token.semantic.metadata,
        ...(token.description === undefined ? {} : { description: token.description }),
        ...(token.deprecated === undefined ? {} : { deprecated: token.deprecated }),
        expression: token.semantic.expression,
        ...(token.semantic.portability.status === 'nonportable' ? { lossy: true as const } : {}),
      }
    }

    const existing = isPlainObject(document.$extensions) ? document.$extensions : {}
    document.$extensions = {
      ...existing,
      [VANITY_DTCG_EXTENSION]: {
        version: VANITY_DTCG_EXTENSION_VERSION,
        mode: 'authored',
        system: {
          prefix: resolved.graph.prefix,
          root: resolved.graph.root,
          axisOrder: [...(resolved.graph.axes?.order ?? [])],
        },
        tokens: authored,
      } satisfies VanityDtcgAuthoredExtension,
    }
  }

  assertJson(document, `${mode} DTCG document`)
  return deepFreeze(document)
}

/** Import a standard DTCG document, or restore the richer authored Vanity extension. */
export function importDesignTokens(
  document: unknown,
  options: VanityDtcgImportOptions = {},
): VanityTokenModule<VanityGraphInput, VanityTokenPolicy> {
  if (!isPlainObject(document))
    throw new TypeError('[vanity] importDesignTokens() needs one DTCG document object')
  const engine = options.system === undefined
    ? createEngine()
    : engineOfOpenSystem(options.system) ?? options.system as VanityEngine<any, any, any>
  const extension = authoredExtension(document)
  return extension
    ? importAuthored(extension, document, engine, options)
    : importStandard(document, engine, options)
}

function exportSource(source: object, options: VanityDtcgExportOptions): ExportSource {
  if (VANITY_SYSTEM_INTERCHANGE in source) {
    const interchange = (source as VanityInterchangeSystem)[VANITY_SYSTEM_INTERCHANGE]
    return { graph: interchange.graph, codecs: interchange.codecs }
  }
  if (!isTokenBuilder(source))
    throw new TypeError('[vanity] exportDesignTokens() needs a bound system or unfinished token module')
  if (!options.system)
    throw new TypeError('[vanity] exporting an unfinished token module needs options.system')
  const engine = engineOfOpenSystem(options.system) ?? options.system as VanityEngine<any, any, any>
  const privateEngine = enginePrivate(engine as any)
  const tokens = finalizeTokenModule(source, {
    prefix: options.prefix ?? 'vanity',
    root: options.root ?? ':root',
    serializeValue: value => privateEngine.kernel.serializeValue(value),
    support: privateEngine.kernel.support,
    axes: privateEngine.axes,
    emitCss: false,
    dtcgCodecIds: new Set(privateEngine.dtcg.map(codec => codec.extension)),
  })
  return { graph: graphOf(tokens)!, codecs: privateEngine.dtcg }
}

function authoredExtension(document: Record<string, unknown>): VanityDtcgAuthoredExtension | undefined {
  const extensions = document.$extensions
  if (!isPlainObject(extensions))
    return undefined
  const extension = extensions[VANITY_DTCG_EXTENSION]
  if (!isPlainObject(extension))
    return undefined
  if (extension.version !== VANITY_DTCG_EXTENSION_VERSION || extension.mode !== 'authored' || !isPlainObject(extension.tokens))
    throw new TypeError(`[vanity] unsupported ${VANITY_DTCG_EXTENSION} authored extension version`)
  return extension as unknown as VanityDtcgAuthoredExtension
}

function importAuthored(
  extension: VanityDtcgAuthoredExtension,
  document: Record<string, unknown>,
  engine: VanityEngine<any, any, any>,
  options: VanityDtcgImportOptions,
): VanityTokenModule<VanityGraphInput, VanityTokenPolicy> {
  const actualAxisOrder = enginePrivate(engine as any).axes.order
  if (actualAxisOrder.join('\0') !== extension.system.axisOrder.join('\0')) {
    throw new TypeError(
      `[vanity] authored DTCG axis order (${extension.system.axisOrder.join(', ') || 'none'}) does not match the import engine (${actualAxisOrder.join(', ') || 'none'})`,
    )
  }
  const entries = Object.entries(extension.tokens)
  const ordered = topological(entries.map(([path, token]) => ({
    path,
    dependencies: [token.val, ...token.branches.map(branch => branch.val)]
      .flatMap(value => value.dependencies.map(edge => edge.path)),
  })))
  let module = engine.defineTokens({}, {}) as any

  for (const path of ordered) {
    const token = extension.tokens[path]!
    if (token.lossy && (options.strict ?? true))
      throw new TypeError(`[vanity] authored token '${path}' was exported lossily and cannot be imported in strict mode`)
    const preserved = preservedExtensionsAt(document, path.split('.'))
    const contribution = (engine.defineTokens({}, {
      ...(token.root === undefined ? {} : { root: token.root }),
      ...(token.layer === undefined ? {} : { layer: token.layer }),
    }) as any).derive((t: object) => {
      const config: Record<string, unknown> = {
        reference: token.reference,
        emit: token.emit,
        mutable: token.mutable,
        ...(token.val.css === null ? {} : { val: decodeValue(token.val, token.type, t, engine) }),
        ...(token.register === undefined
          ? {}
          : {
              register: {
                syntax: token.register.syntax,
                inherits: token.register.inherits,
                ...(token.register.initialVal === undefined ? {} : { initialVal: token.register.initialVal }),
              },
            }),
        ...(token.description === undefined ? {} : { description: token.description }),
        ...(token.deprecated === undefined ? {} : { deprecated: token.deprecated }),
        ...(Object.keys(token.metadata).length === 0 && preserved === undefined
          ? {}
          : {
              metadata: {
                ...token.metadata,
                ...(preserved?.token === undefined ? {} : { dtcgExtensions: preserved.token }),
                ...(preserved?.groups.length ? { dtcgGroupExtensions: preserved.groups } : {}),
              },
            }),
      }
      const axes: Record<string, Record<string, unknown | null>> = {}
      const cases: { when: Readonly<Record<string, string>>, val: unknown | null }[] = []
      for (const branch of token.branches) {
        const val = branch.val.css === null ? null : decodeValue(branch.val, token.type, t, engine)
        if (branch.address.kind === 'axis') {
          axes[branch.address.axis] ??= {}
          axes[branch.address.axis]![branch.address.mode] = val
        }
        else if (branch.address.kind === 'case') {
          cases.push({ when: branch.address.when, val })
        }
      }
      if (Object.keys(axes).length > 0)
        config.axes = axes
      if (cases.length > 0)
        config.cases = cases
      return nested(path, configuredByType(engine, token.type, config))
    })
    module = module.compose(contribution)
  }
  return module as VanityTokenModule<VanityGraphInput, VanityTokenPolicy>
}

function importStandard(
  document: Record<string, unknown>,
  engine: VanityEngine<any, any, any>,
  options: VanityDtcgImportOptions,
): VanityTokenModule<VanityGraphInput, VanityTokenPolicy> {
  const tokens: StandardEntry[] = []
  collectStandard(document, [], undefined, [], tokens, document)
  const blocked = tokens.find(token => typeof token.value === 'string' && externalReference(token.value))
  if (blocked && !options.resolveExternal)
    throw new TypeError(`[vanity] external DTCG reference '${blocked.value}' is disabled; pass resolveExternal explicitly`)
  const ordered = topological(tokens.map(token => ({ path: token.path, dependencies: token.alias ? [token.alias] : [] })))
  const byPath = new Map(tokens.map(token => [token.path, token]))
  let module = engine.defineTokens({}) as any
  for (const path of ordered) {
    const token = byPath.get(path)!
    module = module.derive((t: object) => {
      const value = token.alias
        ? tokenAt(t, token.alias)
        : standardCss(token.type, token.value, options)
      const metadata: Record<string, VanityJsonValue> = {}
      if (token.extensions !== undefined)
        metadata.dtcgExtensions = token.extensions as VanityJsonValue
      if (token.groupExtensions.length > 0)
        metadata.dtcgGroupExtensions = token.groupExtensions as unknown as VanityJsonValue
      if (token.alias)
        metadata.dtcgAlias = token.alias
      const config = {
        val: value,
        ...(token.description === undefined ? {} : { description: token.description }),
        ...(Object.keys(metadata).length === 0 ? {} : { metadata }),
      }
      return nested(path, configuredByType(engine, vanityType(token.type), config))
    })
  }
  return module as VanityTokenModule<VanityGraphInput, VanityTokenPolicy>
}

interface StandardEntry {
  path: string
  type?: string
  value: unknown
  alias?: string
  description?: string
  extensions?: unknown
  groupExtensions: readonly { readonly path: readonly string[], readonly extensions: unknown }[]
}

function collectStandard(
  group: Record<string, unknown>,
  path: string[],
  inheritedType: string | undefined,
  inheritedExtensions: readonly { readonly path: readonly string[], readonly extensions: unknown }[],
  target: StandardEntry[],
  root: Record<string, unknown>,
): void {
  const groupType = typeof group.$type === 'string' ? group.$type : inheritedType
  const groupExtensions = group.$extensions === undefined
    ? inheritedExtensions
    : [...inheritedExtensions, { path: [...path], extensions: group.$extensions }]
  if (isPlainObject(group.$root) && '$value' in group.$root) {
    if (path.length === 0)
      throw new TypeError('[vanity] a document-level DTCG $root token has no Vanity token path')
    const siblings = Object.keys(group).filter(key => !key.startsWith('$'))
    if (siblings.length > 0) {
      throw new TypeError(
        `[vanity] DTCG group '${path.join('.')}' has both a $root token and children; Vanity token paths cannot be a leaf and group simultaneously`,
      )
    }
    const authored = group.$root.$value
    const alias = typeof authored === 'string' ? aliasPath(authored, root) : undefined
    target.push({
      path: path.join('.'),
      type: typeof group.$root.$type === 'string' ? group.$root.$type : groupType,
      value: authored,
      ...(alias === undefined ? {} : { alias }),
      ...(typeof group.$root.$description === 'string' ? { description: group.$root.$description } : {}),
      ...(group.$root.$extensions === undefined ? {} : { extensions: group.$root.$extensions }),
      groupExtensions,
    })
  }
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$'))
      continue
    if (!isPlainObject(value))
      throw new TypeError(`[vanity] DTCG group '${[...path, key].join('.')}' must be an object`)
    const next = [...path, key]
    if ('$value' in value || '$ref' in value) {
      const authored = '$value' in value ? value.$value : value.$ref
      const alias = typeof authored === 'string' ? aliasPath(authored, root) : undefined
      target.push({
        path: next.join('.'),
        type: typeof value.$type === 'string' ? value.$type : groupType,
        value: authored,
        ...(alias === undefined ? {} : { alias }),
        ...(typeof value.$description === 'string' ? { description: value.$description } : {}),
        ...(value.$extensions === undefined ? {} : { extensions: value.$extensions }),
        groupExtensions,
      })
    }
    else {
      collectStandard(value, next, typeof value.$type === 'string' ? value.$type : groupType, groupExtensions, target, root)
    }
  }
}

function selectedCss(token: VanityTokenRecord, axisOrder: readonly string[], environment: Readonly<Record<string, string>>): string | number {
  if (!token.semantic.hasDefault && token.semantic.branches.length === 0)
    throw new TypeError('has no value in the selected environment')
  let val: string | number | null = token.semantic.hasDefault ? token.css : null
  for (const axis of axisOrder) {
    const mode = environment[axis]
    if (mode === undefined)
      continue
    const branch = token.semantic.branches.find(entry => entry.address.kind === 'axis'
      && entry.address.axis === axis && entry.address.mode === mode)
    if (branch?.val !== null && branch !== undefined)
      val = branch.val
  }
  for (const branch of token.semantic.branches) {
    if (branch.address.kind !== 'case' || !Object.entries(branch.address.when).every(([axis, mode]) => environment[axis] === mode))
      continue
    if (branch.val !== null)
      val = branch.val
  }
  if (val === null || val === '')
    throw new TypeError('has no value in the selected environment')
  return val
}

function standardCarrier(
  type: VanityCssDataType,
  css: string | number,
  token: VanityTokenRecord,
  records: readonly VanityTokenRecord[],
): { type?: string, value: unknown } {
  const text = String(css).trim()
  const alias = exactTokenAlias(text, token, records)
  if (alias)
    return { type: dtcgType(type), value: `{${alias}}` }
  switch (dtcgType(type)) {
    case 'number': {
      const value = typeof css === 'number' ? css : Number(text)
      if (!Number.isFinite(value))
        throw new TypeError(`'${text}' is not a resolved DTCG number`)
      return { type: 'number', value }
    }
    case 'dimension': {
      const match = text.match(/^(-?(?:\d+|\d*\.\d+))(px|rem)$/)
      if (!match)
        throw new TypeError(`'${text}' is not a DTCG dimension (only px/rem are standard)`)
      return { type: 'dimension', value: { value: Number(match[1]), unit: match[2] } }
    }
    case 'duration': {
      const match = text.match(/^(-?(?:\d+|\d*\.\d+))(ms|s)$/)
      if (!match)
        throw new TypeError(`'${text}' is not a DTCG duration`)
      return { type: 'duration', value: { value: Number(match[1]), unit: match[2] } }
    }
    case 'color': {
      const color = parseColor(text)
      if (!color)
        throw new TypeError(`'${text}' cannot be resolved to a standard DTCG color`)
      return {
        type: 'color',
        value: {
          colorSpace: 'oklch',
          components: [color.l, color.c, color.h ?? 'none'],
          alpha: color.alpha ?? 1,
        },
      }
    }
    default:
      throw new TypeError(`<${type}> has no honest standard DTCG representation`)
  }
}

function exactTokenAlias(text: string, token: VanityTokenRecord, records: readonly VanityTokenRecord[]): string | undefined {
  const match = text.match(/^var\((--[\w-]+)\)$/)
  if (!match)
    return undefined
  const target = records.find(candidate => candidate.var === match[1])
  return target?.path === token.path ? undefined : target?.path
}

function dtcgType(type: VanityCssDataType): string | undefined {
  if (type === 'number' || type === 'integer')
    return 'number'
  if (type === 'length')
    return 'dimension'
  if (type === 'time')
    return 'duration'
  if (type === 'color')
    return 'color'
  return undefined
}

function vanityType(type: string | undefined): VanityCssDataType {
  if (type === 'number')
    return 'number'
  if (type === 'dimension')
    return 'length'
  if (type === 'duration')
    return 'time'
  if (type === 'color')
    return 'color'
  return 'unknown'
}

function standardCss(type: string | undefined, value: unknown, options: VanityDtcgImportOptions): unknown {
  if (typeof value === 'string' && externalReference(value)) {
    if (!options.resolveExternal)
      throw new TypeError(`[vanity] external DTCG reference '${value}' is disabled; pass resolveExternal explicitly`)
    const resolved = options.resolveExternal(value)
    if (isThenable(resolved))
      throw new TypeError('[vanity] resolveExternal must return synchronously; resolve asynchronous documents before importing them')
    return resolved
  }
  if (type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new TypeError('[vanity] a DTCG number token needs a finite numeric $value')
    return value
  }
  if (type === 'dimension' || type === 'duration') {
    if (!isPlainObject(value) || typeof value.value !== 'number' || typeof value.unit !== 'string')
      throw new TypeError(`[vanity] a DTCG ${type} token needs { value, unit }`)
    if (type === 'dimension' && value.unit !== 'px' && value.unit !== 'rem')
      throw new TypeError('[vanity] DTCG dimensions support only px and rem')
    if (type === 'duration' && value.unit !== 'ms' && value.unit !== 's')
      throw new TypeError('[vanity] DTCG durations support only ms and s')
    return `${value.value}${value.unit}`
  }
  if (type === 'color') {
    if (!isPlainObject(value) || typeof value.colorSpace !== 'string' || !Array.isArray(value.components)
      || value.components.length !== 3) {
      throw new TypeError('[vanity] a DTCG color token needs { colorSpace, components[3], alpha? }')
    }
    if (!value.components.every(component => (typeof component === 'number' && Number.isFinite(component)) || component === 'none'))
      throw new TypeError('[vanity] DTCG color components must be finite numbers or "none"')
    const [first, second, third] = value.components
    const alpha = value.alpha ?? 1
    if (typeof alpha !== 'number' || !Number.isFinite(alpha))
      throw new TypeError('[vanity] DTCG color alpha must be a finite number')
    const channels = `${first} ${second} ${third}`
    const suffix = alpha === 1 ? '' : ` / ${alpha}`
    if (value.colorSpace === 'lab' || value.colorSpace === 'lch'
      || value.colorSpace === 'oklab' || value.colorSpace === 'oklch'
      || value.colorSpace === 'hsl' || value.colorSpace === 'hwb') {
      return `${value.colorSpace}(${channels}${suffix})`
    }
    const colorSpaces = new Set(['srgb', 'srgb-linear', 'display-p3', 'a98-rgb', 'prophoto-rgb', 'rec2020', 'xyz-d50', 'xyz-d65'])
    if (colorSpaces.has(value.colorSpace))
      return `color(${value.colorSpace} ${channels}${suffix})`
    throw new TypeError(`[vanity] unsupported DTCG color space '${value.colorSpace}'`)
  }
  if (options.strict ?? true)
    throw new TypeError(`[vanity] DTCG type '${type ?? 'missing'}' is not supported by the standard importer`)
  return typeof value === 'string' || typeof value === 'number' ? value : JSON.stringify(value)
}

function decodeValue(
  encoded: VanityDtcgEncodedValue,
  type: VanityCssDataType,
  tree: object,
  engine: VanityEngine<any, any, any>,
): unknown {
  if (encoded.css === null)
    return undefined
  if (encoded.codec) {
    const codec = enginePrivate(engine as any).dtcg.find(candidate => candidate.id === encoded.codec!.id
      && String(candidate.version) === String(encoded.codec!.version))
    if (!codec)
      throw new TypeError(`[vanity] authored value needs DTCG codec '${encoded.codec.id}@${encoded.codec.version}'`)
    return codec.decode({
      payload: encoded.codec.payload,
      css: String(encoded.css),
      dependencies: encoded.dependencies.map(edge => tokenAt(tree, edge.path)),
      engine,
    })
  }
  if (typeof encoded.css === 'number')
    return encoded.css
  const replacements = encoded.dependencies
    .filter(edge => edge.name !== undefined)
    .map(edge => ({ syntax: `var(${edge.name})`, value: tokenAt(tree, edge.path) }))
  if (replacements.length === 0)
    return new ExpressionValue(rawNode(type, encoded.css))
  const parts: Array<string | ReturnType<typeof inputNode>> = []
  let remaining = encoded.css
  while (remaining.length > 0) {
    const next = replacements
      .map(replacement => ({ ...replacement, index: remaining.indexOf(replacement.syntax) }))
      .filter(entry => entry.index >= 0)
      .sort((a, b) => a.index - b.index)[0]
    if (!next) {
      parts.push(remaining)
      break
    }
    if (next.index > 0)
      parts.push(remaining.slice(0, next.index))
    parts.push(inputNode(next.value as any, type))
    remaining = remaining.slice(next.index + next.syntax.length)
  }
  return new ExpressionValue(parts.length === 1 && typeof parts[0] !== 'string'
    ? parts[0]
    : compositeNode({ type, parts }))
}

function encodedValue(
  css: string | number | null,
  token: VanityTokenRecord,
  expression: VanityTokenRecord['semantic']['expression'] | undefined,
  codecs: readonly VanityDtcgCodec[],
): VanityDtcgEncodedValue {
  const codec = expression === undefined ? undefined : codecForExpression(expression, codecs)
  const payload = codec === undefined || css === null || expression === undefined
    ? undefined
    : codec.encode({ expression, css: String(css) })
  if (payload !== undefined)
    assertJson(payload, `codec '${codec!.id}' payload for ${token.path}`)
  return {
    css,
    dependencies: token.semantic.dependencies.flatMap(edge => edge.path === undefined
      ? []
      : [{ path: edge.path, ...(edge.name === undefined ? {} : { name: edge.name }) }]),
    ...(codec === undefined || payload === undefined
      ? {}
      : { codec: { id: codec.id, version: codec.version, payload } }),
  }
}

function configuredByType(engine: VanityEngine<any, any, any>, type: VanityCssDataType, config: Record<string, unknown>): unknown {
  if ('val' in config)
    return (engine.token as any)(config)
  const method = ({
    'number-percentage': 'numberPercentage',
    'length-percentage': 'lengthPercentage',
    'easing-function': 'easingFunction',
    'transform-function': 'transformFunction',
    'transform-list': 'transformList',
    'custom-ident': 'customIdent',
    'dashed-ident': 'dashedIdent',
  } as Record<string, string>)[type] ?? type
  return typeof (engine.token as any)[method] === 'function'
    ? (engine.token as any)[method](config)
    : (engine.token as any)(config)
}

function codecForExpression(
  expression: VanityTokenRecord['semantic']['expression'],
  codecs: readonly VanityDtcgCodec[],
): VanityDtcgCodec | undefined {
  return expression.kind === 'plugin' && expression.extension !== undefined
    ? codecs.find(candidate => candidate.extension === expression.extension!.id)
    : undefined
}

function unknownExtensions(metadata: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return isPlainObject(metadata.dtcgExtensions) ? { $extensions: metadata.dtcgExtensions } : {}
}

function preservedExtensionsAt(
  document: Record<string, unknown>,
  path: readonly string[],
): { readonly token?: unknown, readonly groups: readonly { readonly path: readonly string[], readonly extensions: unknown }[] } | undefined {
  let current: unknown = document
  const groups: { path: readonly string[], extensions: unknown }[] = []
  if (document.$extensions !== undefined) {
    const rootExtensions = isPlainObject(document.$extensions)
      ? Object.fromEntries(Object.entries(document.$extensions).filter(([name]) => name !== VANITY_DTCG_EXTENSION))
      : document.$extensions
    if (!isPlainObject(rootExtensions) || Object.keys(rootExtensions).length > 0)
      groups.push({ path: [], extensions: rootExtensions })
  }
  for (let index = 0; index < path.length; index++) {
    if (!isPlainObject(current))
      return groups.length === 0 ? undefined : { groups }
    current = current[path[index]!]
    if (index < path.length - 1 && isPlainObject(current) && current.$extensions !== undefined)
      groups.push({ path: path.slice(0, index + 1), extensions: current.$extensions })
  }
  const token = isPlainObject(current) ? current.$extensions : undefined
  return token === undefined && groups.length === 0 ? undefined : { ...(token === undefined ? {} : { token }), groups }
}

function restoreGroupExtensions(document: Record<string, unknown>, records: readonly VanityTokenRecord[]): void {
  const seen = new Set<string>()
  for (const token of records) {
    const groups = token.semantic.metadata.dtcgGroupExtensions
    if (!Array.isArray(groups))
      continue
    for (const entry of groups) {
      if (!isPlainObject(entry) || !Array.isArray(entry.path) || !entry.path.every(part => typeof part === 'string'))
        continue
      const key = entry.path.join('.')
      if (seen.has(key))
        continue
      seen.add(key)
      let group = document
      for (const part of entry.path) {
        if (!isPlainObject(group[part]))
          group[part] = {}
        group = group[part] as Record<string, unknown>
      }
      if (entry.extensions !== undefined)
        group.$extensions = entry.extensions
    }
  }
}

function aliasPath(value: string, document: Record<string, unknown>): string | undefined {
  const curly = value.match(/^\{([^}]+)\}$/)
  if (curly)
    return curly[1]
  if (value.startsWith('#/')) {
    const parts = value.slice(2).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    let current: unknown = document
    for (const part of parts) {
      if (!isPlainObject(current) || !(part in current))
        throw new TypeError(`[vanity] unresolved DTCG JSON Pointer '${value}'`)
      current = current[part]
    }
    return parts.filter(part => !part.startsWith('$')).join('.')
  }
  return undefined
}

function externalReference(value: string): boolean {
  return /^(?:https?:|file:|\.\.?\/)/.test(value)
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
    ? typeof (value as { then?: unknown }).then === 'function'
    : false
}

function topological(entries: readonly { path: string, dependencies: readonly string[] }[]): string[] {
  const paths = new Set(entries.map(entry => entry.path))
  for (const entry of entries) {
    const unknown = entry.dependencies.find(dependency => !paths.has(dependency))
    if (unknown !== undefined)
      throw new TypeError(`[vanity] DTCG token '${entry.path}' references unknown token '${unknown}'`)
  }
  const indegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()
  for (const entry of entries) {
    const dependencies = new Set(entry.dependencies)
    indegree.set(entry.path, dependencies.size)
    for (const dependency of dependencies) {
      const next = dependents.get(dependency) ?? []
      next.push(entry.path)
      dependents.set(dependency, next)
    }
  }
  const ready = entries.filter(entry => indegree.get(entry.path) === 0).map(entry => entry.path)
  const result: string[] = []
  for (let index = 0; index < ready.length; index++) {
    const path = ready[index]!
    result.push(path)
    for (const dependent of dependents.get(path) ?? []) {
      const next = indegree.get(dependent)! - 1
      indegree.set(dependent, next)
      if (next === 0)
        ready.push(dependent)
    }
  }
  if (result.length !== entries.length) {
    const completed = new Set(result)
    const pending = entries.map(entry => entry.path).filter(path => !completed.has(path))
    throw new TypeError(`[vanity] DTCG alias/dependency cycle: ${pending.join(' → ')}`)
  }
  return result
}

function tokenAt(tree: object, path: string): unknown {
  let current: any = tree
  for (const part of path.split('.')) {
    current = current?.[part]
    if (current === undefined)
      throw new TypeError(`[vanity] DTCG reference '${path}' does not name an imported token`)
  }
  return current
}

function nested(path: string, value: unknown): object {
  return path.split('.').reduceRight<object>((child, key) => ({ [key]: child }), value as object)
}

function setToken(document: Record<string, unknown>, path: readonly string[], token: object): void {
  for (const segment of path) {
    if (segment.startsWith('$') || /[.{}]/.test(segment))
      throw new TypeError(`[vanity] token segment '${segment}' cannot be represented as a DTCG name`)
  }
  let current = document
  for (const part of path.slice(0, -1)) {
    if (!isPlainObject(current[part]))
      current[part] = {}
    current = current[part] as Record<string, unknown>
  }
  current[path.at(-1)!] = token
}

function exportError(path: string, error: unknown): TypeError {
  return new TypeError(`[vanity] cannot export '${path}' as standard DTCG: ${error instanceof Error ? error.message : String(error)}`)
}

function assertJson(value: unknown, label: string, seen = new Set<object>()): asserts value is VanityJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError(`[vanity] ${label} contains a non-finite number`)
    return
  }
  if (typeof value !== 'object')
    throw new TypeError(`[vanity] ${label} is not JSON-safe`)
  if (seen.has(value))
    throw new TypeError(`[vanity] ${label} contains a cycle`)
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach(child => assertJson(child, label, seen))
  }
  else {
    if (!isPlainObject(value))
      throw new TypeError(`[vanity] ${label} contains a non-plain object`)
    Object.values(value).forEach(child => assertJson(child, label, seen))
  }
  seen.delete(value)
}

function isPlainObject(value: unknown): value is Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function deepFreeze<T>(value: T): T {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null || Object.isFrozen(value))
    return value
  Object.freeze(value)
  for (const child of Object.values(value as Record<string, unknown>))
    deepFreeze(child)
  return value
}
