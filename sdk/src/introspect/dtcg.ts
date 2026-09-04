import type { VanityDiagnosticCode } from '../diagnostics'
import type { VanityResolvedPolicies } from '../system/policies'
import type { OpenSystemState } from '../system/state'
import type { VanityGraphInput, VanityTokenFactory, VanityTokenModule, VanityTokenModuleOptions, VanityTokenPolicy } from '../tokens/types'
import type { DtcgCodecRegistry } from '../values/codecs'
import type { VanityValueOperationContext } from '../values/kernel'
import type { VanityCssDataType } from '../values/types'
import type {
  VanityDtcgCodec,
  VanityDtcgDecodeContext,
  VanityInterchangeSystem,
  VanityJsonValue,
} from './interchange'
import type { VanityTokenRecord } from './records'
import { VanityError } from '../diagnostics'
import { createPolicyState, resolvePolicies } from '../system/policies'
import { getSystemTokenModuleRequirement } from '../system/shape'
import { getOpenSystemState } from '../system/state'
import { getTokenModule } from '../tokens/builder'
import { createTokenFactory } from '../tokens/config'
import { composeTokenModules, deriveTokenModule } from '../tokens/derive'
import { parseColor } from '../tokens/math'
import { defineTokenModule, getTokenGraph, getTokenInspections, isTokenModule } from '../tokens/module'
import { getTokenModuleRequirement } from '../tokens/requirements'
import { resolveTokenModule } from '../tokens/resolve'
import { defaultValueKernel } from '../values/defaults'
import { serializeValueWithContext } from '../values/kernel'
import { createCompositeNode, createInputNode, createRawNode, ExpressionValue } from '../values/protocol'
import { VANITY_SYSTEM_INTERCHANGE } from './interchange'

/** Vanity's authored DTCG extension key: `document.$extensions?.[VANITY_DTCG_EXTENSION]`. */
export const VANITY_DTCG_EXTENSION = 'com.mszr.vanity' as const
/** Current authored DTCG extension version: `VANITY_DTCG_EXTENSION_VERSION === 1`. */
export const VANITY_DTCG_EXTENSION_VERSION = 1 as const

/** A standard Design Tokens document: `const document: VanityDtcgDocument = exportDesignTokens(ds)`. */
export type VanityDtcgDocument = Readonly<Record<string, unknown>>

/** Select whether DTCG export preserves authored metadata or resolved values. */
export type VanityDtcgExportMode = 'resolved' | 'authored'

type VanityDtcgSystemContext = {
  readonly defineTokens: unknown
} & (
  | { readonly tdef: unknown }
  | { readonly token: unknown }
)

/** Configure a DTCG export, including its value mode and optional environment. */
export interface VanityDtcgExportOptions {
  /** Choose authored metadata or resolved token values; defaults to resolved. */
  readonly mode?: VanityDtcgExportMode
  /** Values for environment-dependent branches when exporting authored data. */
  readonly environment?: Readonly<Record<string, string>>
  /** Strict is the default: one unrepresentable/nonportable token fails the document. */
  readonly strict?: boolean
  /** Required when exporting an unfinished module rather than a finalized system. */
  readonly system?: VanityDtcgSystemContext
  /** Override the custom-property prefix in an unfinished-module export. */
  readonly prefix?: string
  /** Override the token declaration root in an unfinished-module export. */
  readonly root?: string
}

/** Configure strictness, system context, and external reference handling for DTCG import. */
export interface VanityDtcgImportOptions {
  /** Defaults to a zero-config open system for ordinary standard DTCG documents. */
  readonly system?: VanityDtcgSystemContext
  /** Reject unsupported or unrepresentable DTCG values instead of preserving them. */
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
  readonly graph: NonNullable<ReturnType<typeof getTokenGraph>>
  readonly codecs: DtcgCodecRegistry
}

interface DtcgAuthoringContext {
  readonly axes: OpenSystemState['axes']
  readonly codecs: DtcgCodecRegistry
  readonly valueContext: VanityValueOperationContext
  readonly policies: VanityResolvedPolicies
  readonly token: VanityTokenFactory<any>
  readonly defineTokens: (
    seed?: VanityGraphInput,
    options?: VanityTokenModuleOptions,
  ) => VanityTokenModule<VanityGraphInput, VanityTokenPolicy>
}

function createDtcgAuthoringContext(state: OpenSystemState): DtcgAuthoringContext {
  const policies = resolvePolicies(state.policies)
  const valueContext = {
    values: state.values,
    policies,
  } satisfies VanityValueOperationContext
  const tokenPolicy = Object.freeze({
    reference: policies.tokens.reference,
    emit: policies.tokens.emit,
  }) satisfies VanityTokenPolicy
  const prior = getTokenModuleRequirement(state.tokens)
  const requirement = getSystemTokenModuleRequirement(
    state.values,
    valueContext,
    state.axes,
    prior?.compatibleCapabilitySignatures,
  )
  return {
    axes: state.axes,
    codecs: state.codecs,
    valueContext,
    policies,
    token: createTokenFactory(state.axes),
    defineTokens: (seed = {}, options = {}) => defineTokenModule(requirement, tokenPolicy, seed, options),
  }
}

function createDtcgDefaultContext(): DtcgAuthoringContext {
  return createDtcgAuthoringContext({
    values: defaultValueKernel,
    tokens: {} as never,
    axes: { definitions: Object.freeze({}), order: Object.freeze([]) },
    policies: createPolicyState(),
    conditions: Object.freeze({}),
    consts: Object.freeze({}),
    utils: Object.freeze({}),
    rules: Object.freeze({}),
    plugins: {} as never,
    codecs: Object.freeze([]),
    provenance: {} as never,
    sequence: 0,
    revisions: {} as never,
  })
}

function getDtcgAuthoringContext(system: VanityDtcgSystemContext): DtcgAuthoringContext {
  const state = getOpenSystemState(system)
  if (!state) {
    throwDtcgError(
      'VANITY_DTCG_INVALID_DOCUMENT',
      'DTCG operations need an open system created by createSystem()',
      'system',
      'pass the open system returned by createSystem()',
    )
  }
  return createDtcgAuthoringContext(state)
}

/** Export either a standard environment snapshot or a Vanity-authored round-trip document. */
export function exportDesignTokens(
  source: object,
  options: VanityDtcgExportOptions = {},
): VanityDtcgDocument {
  const resolved = resolveExportSource(source, options)
  const records = getTokenInspections(resolved.graph)
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
    if (!definition || !(mode in definition.modes)) {
      throwDtcgError(
        'VANITY_DTCG_INVALID_VALUE',
        `DTCG export environment selects unknown axis mode '${axis}.${mode}'`,
        ['environment', axis],
        `select one of the declared modes for '${axis}'`,
      )
    }
  }
  const document: Record<string, unknown> = {}
  restoreGroupExtensions(document, records)

  for (const token of records) {
    try {
      const css = selectCss(token, resolved.graph.axes?.order ?? [], environment)
      const carrier = createStandardCarrier(token.semantic.type, css, token, records)
      setToken(document, token.path.split('.'), {
        ...(carrier.type === undefined ? {} : { $type: carrier.type }),
        $value: carrier.value,
        ...(token.description === undefined ? {} : { $description: token.description }),
        ...getUnknownExtensions(token.semantic.metadata),
      })
    }
    catch (error) {
      if (mode === 'resolved')
        throw createExportError(token.path, error)
      let css: string | number
      try {
        css = selectCss(token, resolved.graph.axes?.order ?? [], environment)
      }
      catch {
        // A no-default/reserved token has no honest standard carrier. Its full
        // authored contract still lives in the Vanity extension below.
        continue
      }
      setToken(document, token.path.split('.'), {
        $value: css,
        ...(token.description === undefined ? {} : { $description: token.description }),
        ...getUnknownExtensions(token.semantic.metadata),
      })
    }
  }

  if (mode === 'authored') {
    const authored: Record<string, VanityDtcgAuthoredToken> = {}
    for (const token of records) {
      if (token.semantic.portability.status === 'nonportable' && strict) {
        throwDtcgError(
          'VANITY_DTCG_UNSUPPORTED',
          `${token.path} is not losslessly portable: ${token.semantic.portability.reason}`,
          token.path,
          'set strict: false to accept a lossy snapshot, or install a DTCG codec for the value',
        )
      }

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
        val: encodeValue(token.semantic.hasDefault ? css : null, token, token.semantic.expression, resolved.codecs),
        branches: token.semantic.branches.map(branch => ({
          address: branch.address,
          val: encodeValue(branch.val, token, branch.expression, resolved.codecs),
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
  return freezeDeep(document)
}

/** Import a standard DTCG document, or restore the richer authored Vanity extension. */
export function importDesignTokens(
  document: unknown,
  options: VanityDtcgImportOptions = {},
): VanityTokenModule<VanityGraphInput, VanityTokenPolicy> {
  if (!isPlainObject(document)) {
    throwDtcgError(
      'VANITY_DTCG_INVALID_DOCUMENT',
      'importDesignTokens() needs one DTCG document object',
      'document',
      'pass a plain DTCG document object',
    )
  }
  const authoring = options.system === undefined
    ? createDtcgDefaultContext()
    : getDtcgAuthoringContext(options.system)
  const extension = getAuthoredExtension(document)
  return extension
    ? importAuthoredDocument(extension, document, authoring, options)
    : importStandardDocument(document, authoring, options)
}

function resolveExportSource(source: object, options: VanityDtcgExportOptions): ExportSource {
  if (VANITY_SYSTEM_INTERCHANGE in source) {
    const interchange = (source as VanityInterchangeSystem)[VANITY_SYSTEM_INTERCHANGE]
    return { graph: interchange.graph, codecs: interchange.codecs }
  }
  const module = isTokenModule(source) ? source : getTokenModule(source)
  if (!module) {
    throwDtcgError(
      'VANITY_DTCG_INVALID_DOCUMENT',
      'exportDesignTokens() needs a bound system or unfinished token module',
      'source',
      'pass a consolidated system or the unfinished module returned by defineTokens()',
    )
  }
  if (!options.system) {
    throwDtcgError(
      'VANITY_DTCG_INVALID_DOCUMENT',
      'exporting an unfinished token module needs options.system',
      ['options', 'system'],
      'provide the open system that owns the unfinished token module',
    )
  }
  const authoring = getDtcgAuthoringContext(options.system)
  const tokens = resolveTokenModule(module, {
    prefix: options.prefix ?? 'vanity',
    root: options.root ?? ':root',
    serializeValue: value => serializeValueWithContext(authoring.valueContext, value),
    support: authoring.valueContext.policies.support,
    axes: authoring.axes,
    emitCss: false,
    dtcgCodecIds: new Set(authoring.codecs.map(codec => codec.extension)),
  })
  return { graph: getTokenGraph(tokens)!, codecs: authoring.codecs }
}

function getAuthoredExtension(document: Record<string, unknown>): VanityDtcgAuthoredExtension | undefined {
  const extensions = document.$extensions
  if (!isPlainObject(extensions))
    return undefined
  const extension = extensions[VANITY_DTCG_EXTENSION]
  if (!isPlainObject(extension))
    return undefined
  if (extension.version !== VANITY_DTCG_EXTENSION_VERSION || extension.mode !== 'authored' || !isPlainObject(extension.tokens)) {
    throwDtcgError(
      'VANITY_DTCG_UNSUPPORTED',
      `unsupported ${VANITY_DTCG_EXTENSION} authored extension version`,
      ['$extensions', VANITY_DTCG_EXTENSION],
      `provide authored extension version ${VANITY_DTCG_EXTENSION_VERSION} with mode 'authored' and a token map`,
    )
  }
  return extension as unknown as VanityDtcgAuthoredExtension
}

function importAuthoredDocument(
  extension: VanityDtcgAuthoredExtension,
  document: Record<string, unknown>,
  authoring: DtcgAuthoringContext,
  options: VanityDtcgImportOptions,
): VanityTokenModule<VanityGraphInput, VanityTokenPolicy> {
  const actualAxisOrder = authoring.axes.order
  if (actualAxisOrder.join('\0') !== extension.system.axisOrder.join('\0')) {
    throwDtcgError(
      'VANITY_DTCG_INVALID_DOCUMENT',
      `authored DTCG axis order (${extension.system.axisOrder.join(', ') || 'none'}) does not match the importing system (${actualAxisOrder.join(', ') || 'none'})`,
      ['$extensions', VANITY_DTCG_EXTENSION, 'system', 'axisOrder'],
      'import the document with a system declaring the same axis order',
    )
  }
  const entries = Object.entries(extension.tokens)
  const ordered = orderTopologically(entries.map(([path, token]) => ({
    path,
    dependencies: [token.val, ...token.branches.map(branch => branch.val)]
      .flatMap(value => value.dependencies.map(edge => edge.path)),
  })))
  let module = authoring.defineTokens({}, {}) as any

  for (const path of ordered) {
    const token = extension.tokens[path]!
    if (token.lossy && (options.strict ?? true)) {
      throwDtcgError(
        'VANITY_DTCG_UNSUPPORTED',
        `authored token '${path}' was exported lossily and cannot be imported in strict mode`,
        ['$extensions', VANITY_DTCG_EXTENSION, 'tokens', path],
        'set strict: false to import the lossy authored value, or export it with a codec',
      )
    }
    const preserved = getPreservedExtensionsAt(document, path.split('.'))
    const contribution = deriveTokenModule(authoring.defineTokens({}, {
      ...(token.root === undefined ? {} : { root: token.root }),
      ...(token.layer === undefined ? {} : { layer: token.layer }),
    }) as any, (t: object) => {
      const config: Record<string, unknown> = {
        reference: token.reference,
        emit: token.emit,
        mutable: token.mutable,
        ...(token.val.css === null ? {} : { val: decodeValue(token.val, token.type, t, getDtcgContext(authoring)) }),
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
        const val = branch.val.css === null ? null : decodeValue(branch.val, token.type, t, getDtcgContext(authoring))
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
      return createNestedRecord(path, configureByType(authoring, token.type, config))
    })
    module = composeTokenModules(module, contribution)
  }
  return module as VanityTokenModule<VanityGraphInput, VanityTokenPolicy>
}

function importStandardDocument(
  document: Record<string, unknown>,
  authoring: DtcgAuthoringContext,
  options: VanityDtcgImportOptions,
): VanityTokenModule<VanityGraphInput, VanityTokenPolicy> {
  const tokens: StandardEntry[] = []
  collectStandard(document, [], undefined, [], tokens, document)
  const blocked = tokens.find(token => typeof token.value === 'string' && isExternalReference(token.value))
  if (blocked && !options.resolveExternal) {
    throwDtcgError(
      'VANITY_DTCG_REFERENCE',
      `external DTCG reference '${blocked.value}' is disabled`,
      blocked.path,
      'pass resolveExternal explicitly, or replace the external reference with a local value',
    )
  }
  const ordered = orderTopologically(tokens.map(token => ({ path: token.path, dependencies: token.alias ? [token.alias] : [] })))
  const byPath = new Map(tokens.map(token => [token.path, token]))
  let module = authoring.defineTokens({}) as any
  for (const path of ordered) {
    const token = byPath.get(path)!
    module = deriveTokenModule(module, (t: object) => {
      const value = token.alias
        ? getTokenAt(t, token.alias)
        : parseStandardCss(token.type, token.value, options, token.path)
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
      return createNestedRecord(path, configureByType(authoring, getVanityType(token.type), config))
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
    if (path.length === 0) {
      throwDtcgError(
        'VANITY_DTCG_INVALID_DOCUMENT',
        'a document-level DTCG $root token has no Vanity token path',
        ['$root'],
        'nest the $root token below a named token path',
      )
    }
    const siblings = Object.keys(group).filter(key => !key.startsWith('$'))
    if (siblings.length > 0) {
      throwDtcgError(
        'VANITY_DTCG_INVALID_DOCUMENT',
        `DTCG group '${path.join('.')}' has both a $root token and children; Vanity token paths cannot be a leaf and group simultaneously`,
        [...path, '$root'],
        'choose either a $root token or child tokens at this path',
      )
    }
    const authored = group.$root.$value
    const alias = typeof authored === 'string' ? getAliasPath(authored, root) : undefined
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
    if (!isPlainObject(value)) {
      throwDtcgError(
        'VANITY_DTCG_INVALID_DOCUMENT',
        `DTCG group '${[...path, key].join('.')}' must be an object`,
        [...path, key],
        'make the group a plain object containing a DTCG token or nested group',
      )
    }
    const next = [...path, key]
    if ('$value' in value || '$ref' in value) {
      const authored = '$value' in value ? value.$value : value.$ref
      const alias = typeof authored === 'string' ? getAliasPath(authored, root) : undefined
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

function selectCss(token: VanityTokenRecord, axisOrder: readonly string[], environment: Readonly<Record<string, string>>): string | number {
  if (!token.semantic.hasDefault && token.semantic.branches.length === 0) {
    throwDtcgError(
      'VANITY_DTCG_INVALID_VALUE',
      `${token.path} has no value in the selected environment`,
      token.path,
      'provide a base value or select an environment containing one of its branches',
    )
  }
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
  if (val === null || val === '') {
    throwDtcgError(
      'VANITY_DTCG_INVALID_VALUE',
      `${token.path} has no value in the selected environment`,
      token.path,
      'select an environment with a concrete value for this token',
    )
  }
  return val
}

function createStandardCarrier(
  type: VanityCssDataType,
  css: string | number,
  token: VanityTokenRecord,
  records: readonly VanityTokenRecord[],
): { type?: string, value: unknown } {
  const text = String(css).trim()
  const alias = getExactTokenAlias(text, token, records)
  if (alias)
    return { type: getDtcgType(type), value: `{${alias}}` }
  switch (getDtcgType(type)) {
    case 'number': {
      const value = typeof css === 'number' ? css : Number(text)
      if (!Number.isFinite(value)) {
        throwDtcgError(
          'VANITY_DTCG_INVALID_VALUE',
          `'${text}' is not a resolved DTCG number`,
          token.path,
          'use a finite numeric token value',
        )
      }
      return { type: 'number', value }
    }
    case 'dimension': {
      const match = text.match(/^(-?(?:\d+|\d*\.\d+))(px|rem)$/)
      if (!match) {
        throwDtcgError(
          'VANITY_DTCG_UNSUPPORTED',
          `'${text}' is not a DTCG dimension (only px/rem are standard)`,
          token.path,
          'use px or rem, or export with strict: false',
        )
      }
      return { type: 'dimension', value: { value: Number(match[1]), unit: match[2] } }
    }
    case 'duration': {
      const match = text.match(/^(-?(?:\d+|\d*\.\d+))(ms|s)$/)
      if (!match) {
        throwDtcgError(
          'VANITY_DTCG_UNSUPPORTED',
          `'${text}' is not a DTCG duration`,
          token.path,
          'use milliseconds or seconds, or export with strict: false',
        )
      }
      return { type: 'duration', value: { value: Number(match[1]), unit: match[2] } }
    }
    case 'color': {
      const color = parseColor(text)
      if (!color) {
        throwDtcgError(
          'VANITY_DTCG_UNSUPPORTED',
          `'${text}' cannot be resolved to a standard DTCG color`,
          token.path,
          'use a standard color representation or export with strict: false',
        )
      }
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
      throwDtcgError(
        'VANITY_DTCG_UNSUPPORTED',
        `<${type}> has no honest standard DTCG representation`,
        token.path,
        'install a DTCG codec for this value or export with strict: false',
      )
  }
}

function getExactTokenAlias(text: string, token: VanityTokenRecord, records: readonly VanityTokenRecord[]): string | undefined {
  const match = text.match(/^var\((--[\w-]+)\)$/)
  if (!match)
    return undefined
  const target = records.find(candidate => candidate.var === match[1])
  return target?.path === token.path ? undefined : target?.path
}

function getDtcgType(type: VanityCssDataType): string | undefined {
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

function getVanityType(type: string | undefined): VanityCssDataType {
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

function parseStandardCss(
  type: string | undefined,
  value: unknown,
  options: VanityDtcgImportOptions,
  path = '$value',
): unknown {
  if (typeof value === 'string' && isExternalReference(value)) {
    if (!options.resolveExternal) {
      throwDtcgError(
        'VANITY_DTCG_REFERENCE',
        `external DTCG reference '${value}' is disabled`,
        path,
        'pass resolveExternal explicitly, or replace the external reference with a local value',
      )
    }
    const resolved = options.resolveExternal(value)
    if (isThenable(resolved)) {
      throwDtcgError(
        'VANITY_DTCG_REFERENCE',
        'resolveExternal must return synchronously; resolve asynchronous documents before importing them',
        path,
        'resolve the external document before calling importDesignTokens()',
      )
    }
    return resolved
  }
  if (type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throwDtcgError(
        'VANITY_DTCG_INVALID_VALUE',
        'a DTCG number token needs a finite numeric $value',
        path,
        'provide a finite number in $value',
      )
    }
    return value
  }
  if (type === 'dimension' || type === 'duration') {
    if (!isPlainObject(value) || typeof value.value !== 'number' || typeof value.unit !== 'string') {
      throwDtcgError(
        'VANITY_DTCG_INVALID_VALUE',
        `a DTCG ${type} token needs { value, unit }`,
        path,
        'provide a DTCG object with numeric value and string unit fields',
      )
    }
    if (type === 'dimension' && value.unit !== 'px' && value.unit !== 'rem') {
      throwDtcgError(
        'VANITY_DTCG_UNSUPPORTED',
        'DTCG dimensions support only px and rem',
        path,
        'use px or rem for a standard DTCG dimension',
      )
    }
    if (type === 'duration' && value.unit !== 'ms' && value.unit !== 's') {
      throwDtcgError(
        'VANITY_DTCG_UNSUPPORTED',
        'DTCG durations support only ms and s',
        path,
        'use ms or s for a standard DTCG duration',
      )
    }
    return `${value.value}${value.unit}`
  }
  if (type === 'color') {
    if (!isPlainObject(value) || typeof value.colorSpace !== 'string' || !Array.isArray(value.components)
      || value.components.length !== 3) {
      throwDtcgError(
        'VANITY_DTCG_INVALID_VALUE',
        'a DTCG color token needs { colorSpace, components[3], alpha? }',
        path,
        'provide a colorSpace and exactly three components',
      )
    }
    if (!value.components.every(component => (typeof component === 'number' && Number.isFinite(component)) || component === 'none')) {
      throwDtcgError(
        'VANITY_DTCG_INVALID_VALUE',
        'DTCG color components must be finite numbers or "none"',
        path,
        'replace each color component with a finite number or "none"',
      )
    }
    const [first, second, third] = value.components
    const alpha = value.alpha ?? 1
    if (typeof alpha !== 'number' || !Number.isFinite(alpha)) {
      throwDtcgError(
        'VANITY_DTCG_INVALID_VALUE',
        'DTCG color alpha must be a finite number',
        path,
        'provide a finite numeric alpha value',
      )
    }
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
    throwDtcgError(
      'VANITY_DTCG_UNSUPPORTED',
      `unsupported DTCG color space '${value.colorSpace}'`,
      path,
      'use a standard DTCG color space or provide a codec',
    )
  }
  if (options.strict ?? true) {
    throwDtcgError(
      'VANITY_DTCG_UNSUPPORTED',
      `DTCG type '${type ?? 'missing'}' is not supported by the standard importer`,
      path,
      'use a supported DTCG type, install a codec, or set strict: false',
    )
  }
  return typeof value === 'string' || typeof value === 'number' ? value : JSON.stringify(value)
}

function decodeValue(
  encoded: VanityDtcgEncodedValue,
  type: VanityCssDataType,
  tree: object,
  context: VanityDtcgDecodeContext,
): unknown {
  if (encoded.css === null)
    return undefined
  if (encoded.codec) {
    const codec = context.codecs.find(candidate => candidate.id === encoded.codec!.id
      && String(candidate.version) === String(encoded.codec!.version))
    if (!codec) {
      throwDtcgError(
        'VANITY_DTCG_CODEC',
        `authored value needs DTCG codec '${encoded.codec.id}@${encoded.codec.version}'`,
        'value.codec',
        'install the matching codec on the importing system before importing this document',
      )
    }
    try {
      return codec.decode({
        payload: encoded.codec.payload,
        css: String(encoded.css),
        dependencies: encoded.dependencies.map(edge => getTokenAt(tree, edge.path)),
        context,
      })
    }
    catch (error) {
      throwDtcgError(
        'VANITY_DTCG_CODEC',
        `DTCG codec '${encoded.codec.id}@${encoded.codec.version}' could not decode the authored value`,
        'value.codec',
        error instanceof Error ? error.message : 'fix the codec payload or its decode() implementation',
      )
    }
  }
  if (typeof encoded.css === 'number')
    return encoded.css
  const replacements = encoded.dependencies
    .filter(edge => edge.name !== undefined)
    .map(edge => ({ syntax: `var(${edge.name})`, value: getTokenAt(tree, edge.path) }))
  if (replacements.length === 0)
    return new ExpressionValue(createRawNode(type, encoded.css))
  const parts: Array<string | ReturnType<typeof createInputNode>> = []
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
    parts.push(createInputNode(next.value as any, type))
    remaining = remaining.slice(next.index + next.syntax.length)
  }
  return new ExpressionValue(parts.length === 1 && typeof parts[0] !== 'string'
    ? parts[0]
    : createCompositeNode({ type, parts }))
}

function getDtcgContext(authoring: DtcgAuthoringContext): VanityDtcgDecodeContext {
  return Object.freeze({
    values: authoring.valueContext.values,
    policies: authoring.policies,
    codecs: authoring.codecs,
  })
}

function encodeValue(
  css: string | number | null,
  token: VanityTokenRecord,
  expression: VanityTokenRecord['semantic']['expression'] | undefined,
  codecs: DtcgCodecRegistry,
): VanityDtcgEncodedValue {
  const codec = expression === undefined ? undefined : getCodecForExpression(expression, codecs)
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

function configureByType(authoring: DtcgAuthoringContext, type: VanityCssDataType, config: Record<string, unknown>): unknown {
  if ('val' in config)
    return (authoring.token as any)(config)
  const method = ({
    'number-percentage': 'numberPercentage',
    'length-percentage': 'lengthPercentage',
    'easing-function': 'easingFunction',
    'transform-function': 'transformFunction',
    'transform-list': 'transformList',
    'custom-ident': 'customIdent',
    'dashed-ident': 'dashedIdent',
  } as Record<string, string>)[type] ?? type
  return typeof (authoring.token as any)[method] === 'function'
    ? (authoring.token as any)[method](config)
    : (authoring.token as any)(config)
}

function getCodecForExpression(
  expression: VanityTokenRecord['semantic']['expression'],
  codecs: DtcgCodecRegistry,
): VanityDtcgCodec | undefined {
  return expression.kind === 'plugin' && expression.extension !== undefined
    ? codecs.find(candidate => candidate.extension === expression.extension!.id)
    : undefined
}

function getUnknownExtensions(metadata: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return isPlainObject(metadata.dtcgExtensions) ? { $extensions: metadata.dtcgExtensions } : {}
}

function getPreservedExtensionsAt(
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

function getAliasPath(value: string, document: Record<string, unknown>): string | undefined {
  const curly = value.match(/^\{([^}]+)\}$/)
  if (curly)
    return curly[1]
  if (value.startsWith('#/')) {
    const parts = value.slice(2).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    let current: unknown = document
    for (const part of parts) {
      if (!isPlainObject(current) || !(part in current)) {
        throwDtcgError(
          'VANITY_DTCG_REFERENCE',
          `unresolved DTCG JSON Pointer '${value}'`,
          '$value',
          'point the reference at an existing DTCG entry',
        )
      }
      current = current[part]
    }
    return parts.filter(part => !part.startsWith('$')).join('.')
  }
  return undefined
}

function isExternalReference(value: string): boolean {
  return /^(?:https?:|file:|\.\.?\/)/.test(value)
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
    ? typeof (value as { then?: unknown }).then === 'function'
    : false
}

function orderTopologically(entries: readonly { path: string, dependencies: readonly string[] }[]): string[] {
  const paths = new Set(entries.map(entry => entry.path))
  for (const entry of entries) {
    const unknown = entry.dependencies.find(dependency => !paths.has(dependency))
    if (unknown !== undefined) {
      throwDtcgError(
        'VANITY_DTCG_REFERENCE',
        `DTCG token '${entry.path}' references unknown token '${unknown}'`,
        entry.path,
        `add '${unknown}' to the document before referencing it`,
      )
    }
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
    throwDtcgError(
      'VANITY_DTCG_REFERENCE',
      `DTCG alias/dependency cycle: ${pending.join(' → ')}`,
      pending[0] ?? '$value',
      'break the alias cycle so each DTCG token depends on an earlier value',
    )
  }
  return result
}

function getTokenAt(tree: object, path: string): unknown {
  let current: any = tree
  for (const part of path.split('.')) {
    current = current?.[part]
    if (current === undefined) {
      throwDtcgError(
        'VANITY_DTCG_REFERENCE',
        `DTCG reference '${path}' does not name an imported token`,
        path,
        'reference a token path present in the imported document',
      )
    }
  }
  return current
}

function createNestedRecord(path: string, value: unknown): object {
  return path.split('.').reduceRight<object>((child, key) => ({ [key]: child }), value as object)
}

function setToken(document: Record<string, unknown>, path: readonly string[], token: object): void {
  for (const segment of path) {
    if (segment.startsWith('$') || /[.{}]/.test(segment)) {
      throwDtcgError(
        'VANITY_DTCG_INVALID_DOCUMENT',
        `token segment '${segment}' cannot be represented as a DTCG name`,
        path,
        'use token names without $, dots, or braces',
      )
    }
  }
  let current = document
  for (const part of path.slice(0, -1)) {
    if (!isPlainObject(current[part]))
      current[part] = {}
    current = current[part] as Record<string, unknown>
  }
  current[path.at(-1)!] = token
}

function createExportError(path: string, error: unknown): VanityError {
  return new VanityError({
    code: 'VANITY_DTCG_UNSUPPORTED',
    message: `cannot export '${path}' as standard DTCG: ${error instanceof Error ? error.message : String(error)}`,
    path,
    fix: 'use a standard DTCG-compatible value, install a codec, or export with strict: false',
  })
}

function assertJson(value: unknown, label: string, seen = new Set<object>()): asserts value is VanityJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throwDtcgError(
        'VANITY_DTCG_INVALID_DOCUMENT',
        `${label} contains a non-finite number`,
        label,
        'replace the non-finite number with a finite JSON number',
      )
    }
    return
  }
  if (typeof value !== 'object') {
    throwDtcgError(
      'VANITY_DTCG_INVALID_DOCUMENT',
      `${label} is not JSON-safe`,
      label,
      'use only JSON-compatible values in the DTCG document',
    )
  }
  if (seen.has(value)) {
    throwDtcgError(
      'VANITY_DTCG_INVALID_DOCUMENT',
      `${label} contains a cycle`,
      label,
      'remove the circular reference from the DTCG document',
    )
  }
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach(child => assertJson(child, label, seen))
  }
  else {
    if (!isPlainObject(value)) {
      throwDtcgError(
        'VANITY_DTCG_INVALID_DOCUMENT',
        `${label} contains a non-plain object`,
        label,
        'replace the class instance with a plain object',
      )
    }
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

function freezeDeep<T>(value: T): T {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null || Object.isFrozen(value))
    return value
  Object.freeze(value)
  for (const child of Object.values(value as Record<string, unknown>))
    freezeDeep(child)
  return value
}

function throwDtcgError(
  code: Extract<VanityDiagnosticCode, `VANITY_DTCG_${string}`>,
  message: string,
  path: string | readonly string[],
  fix: string,
): never {
  throw new VanityError({ code, message, path, fix })
}
