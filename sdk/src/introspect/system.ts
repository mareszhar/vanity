/**
 * Canonical semantic map. Every outward projection starts here:
 * `ds.introspect()`, Manifest v4, CLI output, DevTools, agents, and diffs.
 */

import type {
  VanityCapabilityOrigin,
  VanityPortableSystemV2,
  VanitySystemIdentities,
} from '../system/contract'
import type { VanityTokenRecord } from './records'

/** Stable introspection discriminator: `ds.introspect().format === VANITY_INTROSPECTION_FORMAT`. */
export const VANITY_INTROSPECTION_FORMAT = 'vanity.introspection/2' as const
/** Current introspection schema version: `ds.introspect().version === VANITY_INTROSPECTION_VERSION`. */
export const VANITY_INTROSPECTION_VERSION = 2 as const

export interface VanityDeclaredAt {
  readonly file: string
  readonly line?: number
  readonly column?: number
}

export type VanitySemanticOwner
  = { readonly kind: 'system', readonly id: string }
    | { readonly kind: 'module', readonly id: string }
    | { readonly kind: 'plugin', readonly id: string }

export interface VanitySemanticEntry {
  readonly id: string
  readonly kind: string
  readonly owner: VanitySemanticOwner
  readonly declaredAt?: VanityDeclaredAt
  readonly description?: string
  readonly deprecated?: string
}

export type VanityIntrospectionDeclaration = VanityTokenRecord['semantic']['declarations'][number]
export type VanityIntrospectionDependency = VanityTokenRecord['semantic']['dependencies'][number]
export type VanityIntrospectionExpression = VanityTokenRecord['semantic']['expression']

export interface VanityIntrospectedToken extends VanitySemanticEntry {
  readonly kind: 'token'
  readonly path: readonly string[]
  readonly root: string
  readonly scopes?: readonly string[]
  readonly module?: readonly string[]
  readonly name?: `--${string}`
  readonly type: VanityTokenRecord['semantic']['type']
  readonly reference: 'val' | 'var'
  readonly emit: boolean
  readonly mutable: boolean
  readonly hasDefault: boolean
  readonly expression: VanityIntrospectionExpression
  readonly inference: VanityTokenRecord['semantic']['inference']
  readonly fold: VanityTokenRecord['semantic']['fold']
  readonly dependencies: readonly VanityIntrospectionDependency[]
  readonly support: VanityTokenRecord['semantic']['support']
  readonly declarations: readonly VanityIntrospectionDeclaration[]
  readonly branches: VanityTokenRecord['semantic']['branches']
  readonly registration?: VanityTokenRecord['semantic']['registration']
  readonly portability: VanityTokenRecord['semantic']['portability']
  readonly preview:
    | { readonly status: 'resolved', readonly val: string, readonly environment: Readonly<Record<string, string>>, readonly caveats?: readonly string[] }
    | { readonly status: 'unavailable', readonly reason: string }
  readonly metadata: Readonly<Record<string, unknown>>
  readonly runtime?: VanityTokenRecord['runtime']
}

/**
 * Stable JSON-safe semantic map returned by `ds.introspect()`.
 *
 * @example
 * `const map: VanitySystemMapV2 = ds.introspect()`
 */
export interface VanitySystemMapV2 {
  readonly format: typeof VANITY_INTROSPECTION_FORMAT
  readonly version: typeof VANITY_INTROSPECTION_VERSION
  readonly id: string
  readonly kind: 'system'
  readonly identities: VanitySystemIdentities
  readonly declaredAt?: VanityDeclaredAt
  readonly prefix: string
  readonly root: string
  readonly tokenLayer?: string
  readonly layerRoot: string
  readonly capabilities: VanitySemanticEntry & {
    readonly kind: 'capabilities'
    readonly signature: string
    readonly supportTarget: string
  }
  readonly policies: Readonly<Record<string, unknown>>
  readonly layers: readonly (VanitySemanticEntry & {
    readonly kind: 'layer'
    readonly name: string
    readonly order: number
  })[]
  readonly conditions: Readonly<Record<string, VanitySemanticEntry & {
    readonly kind: 'condition'
    readonly name: string
    readonly readable: string
    readonly arms: VanityPortableSystemV2['conditionArms'][string]
    readonly ast: VanityPortableSystemV2['conditionAsts'][string]
  }>>
  readonly axes: Readonly<Record<string, VanitySemanticEntry & {
    readonly kind: 'axis'
    readonly name: string
    readonly defaultMode?: string
    readonly modeOrder: readonly string[]
    readonly modes: NonNullable<VanityPortableSystemV2['axes']>['definitions'][string]['modes']
    readonly control?: { readonly id: string }
    readonly native?: NonNullable<VanityPortableSystemV2['axes']>['definitions'][string]['native']
  }>>
  readonly roots: Readonly<Record<string, VanitySemanticEntry & {
    readonly kind: 'root'
    readonly path: string
    readonly selector: string
    readonly scopes?: readonly string[]
    readonly axes: readonly string[]
  }>>
  readonly tokens: Readonly<Record<string, VanityIntrospectedToken>>
  readonly plugins: Readonly<Record<string, VanitySemanticEntry & {
    readonly kind: 'plugin'
    readonly name: string
    readonly version: string
    readonly fingerprint?: string
  }>>
  readonly extensions: Readonly<Record<string, VanitySemanticEntry & {
    readonly kind: 'extension'
    readonly name: string
    readonly version: string
    readonly fingerprint?: string
  }>>
  readonly consts: Readonly<Record<string, VanitySemanticEntry & {
    readonly kind: 'const'
    readonly name: string
    readonly value: unknown
  }>>
  readonly constructors: Readonly<Record<string, VanitySemanticEntry & {
    readonly kind: 'constructor'
    readonly name: string
    readonly origin: VanityCapabilityOrigin
  }>>
  readonly utilities: Readonly<Record<string, VanitySemanticEntry & {
    readonly kind: 'utility'
    readonly path: readonly string[]
  }>>
  readonly ruleGroups: Readonly<Record<string, VanitySemanticEntry & {
    readonly kind: 'rule-group'
    readonly name: string
    readonly description?: string
    readonly layer?: string
    readonly order?: number
    readonly selectors: readonly string[]
    readonly fingerprint: string
  }>>
  readonly runtime: VanityPortableSystemV2['runtime']
  readonly overwrites: readonly (VanitySemanticEntry & {
    readonly kind: 'overwrite'
    readonly operation: 'augment' | 'overwrite'
    readonly target: VanityPortableSystemV2['overwrites'][number]['kind']
    readonly paths: readonly string[]
  })[]
  readonly audits: Readonly<Record<string, VanitySemanticEntry & {
    readonly kind: 'audit'
    readonly name: string
    readonly level: 'off' | 'warn' | 'error'
  }>>
}

/** Build the one deterministic, data-only semantic representation of a system. */
export function introspectSystem(portable: VanityPortableSystemV2): VanitySystemMapV2 {
  const systemId = `system:${portable.identities.compatibility}`
  const systemSource = declaredAt(portable.source)
  const systemOwner = getOwner('system', systemId)
  const getSemanticOwner = (id: string, fallback: VanitySemanticOwner = systemOwner): VanitySemanticOwner =>
    portable.owners[id] ?? fallback
  const extensions = [...portable.capabilities.extensions].sort((left, right) => left.id.localeCompare(right.id))
  const pluginExtensions = extensions.filter(extension => portable.plugins.includes(extension.id))
  const axes = portable.axes?.definitions ?? {}
  const tokens = Object.fromEntries(
    [...portable.tokenRecords]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map(token => [token.path, createIntrospectedToken(
        token,
        portable,
        getSemanticOwner(`token:${token.path}`, systemOwner),
      )]),
  )

  return normalizeAndFreeze({
    format: VANITY_INTROSPECTION_FORMAT,
    version: VANITY_INTROSPECTION_VERSION,
    id: systemId,
    kind: 'system',
    identities: portable.identities,
    ...(systemSource === undefined ? {} : { declaredAt: systemSource }),
    prefix: portable.prefix,
    root: portable.root,
    ...(portable.tokenLayer === undefined ? {} : { tokenLayer: portable.tokenLayer }),
    layerRoot: portable.layerRoot,
    capabilities: {
      id: `capabilities:${portable.capabilities.signature}`,
      kind: 'capabilities',
      owner: systemOwner,
      ...(systemSource === undefined ? {} : { declaredAt: systemSource }),
      signature: portable.capabilities.signature,
      supportTarget: portable.capabilities.supportTarget,
    },
    policies: portable.policies,
    layers: portable.layers.map((name, order) => ({
      id: `layer:${portable.layerRoot}.${name}`,
      kind: 'layer',
      owner: systemOwner,
      ...(systemSource === undefined ? {} : { declaredAt: systemSource }),
      name,
      order,
    })),
    conditions: Object.fromEntries(Object.keys(portable.conditions).sort().map(name => [
      name,
      {
        id: `condition:${name}`,
        kind: 'condition',
        owner: getSemanticOwner(`condition:${name}`),
        ...(systemSource === undefined ? {} : { declaredAt: systemSource }),
        name,
        readable: portable.conditions[name],
        arms: portable.conditionArms[name],
        ast: portable.conditionAsts[name],
      },
    ])),
    axes: Object.fromEntries(Object.keys(axes).sort().map((name) => {
      const axis = axes[name]
      return [name, {
        id: `axis:${name}`,
        kind: 'axis',
        owner: getSemanticOwner(`axis:${name}`),
        ...(systemSource === undefined ? {} : { declaredAt: systemSource }),
        ...(axis.description === undefined ? {} : { description: axis.description }),
        name,
        ...(axis.defaultMode === undefined ? {} : { defaultMode: axis.defaultMode }),
        modeOrder: axis.modeOrder,
        modes: axis.modes,
        ...(axis.control === undefined ? {} : { control: axis.control }),
        ...(axis.native === undefined ? {} : { native: axis.native }),
      }]
    })),
    roots: Object.fromEntries([...portable.runtime.roots].sort((left, right) => left.path.localeCompare(right.path)).map(root => [
      root.path,
      {
        id: `root:${root.path}`,
        kind: 'root',
        owner: root.path === '$system' ? systemOwner : getOwner('module', `module:${root.path}`),
        ...(systemSource === undefined ? {} : { declaredAt: systemSource }),
        path: root.path,
        selector: root.selector,
        ...(root.scopes === undefined ? {} : { scopes: root.scopes }),
        axes: root.axes,
      },
    ])),
    tokens,
    plugins: Object.fromEntries(pluginExtensions.map(extension => [
      extension.id,
      {
        id: `plugin:${extension.id}`,
        kind: 'plugin',
        owner: getOwner('plugin', `plugin:${extension.id}`),
        ...(systemSource === undefined ? {} : { declaredAt: systemSource }),
        name: extension.id,
        version: extension.version,
        ...(extension.fingerprint === undefined ? {} : { fingerprint: extension.fingerprint }),
      },
    ])),
    extensions: Object.fromEntries(extensions.map(extension => [
      extension.id,
      {
        id: `extension:${extension.id}`,
        kind: 'extension',
        owner: portable.plugins.includes(extension.id)
          ? getOwner('plugin', `plugin:${extension.id}`)
          : systemOwner,
        ...(systemSource === undefined ? {} : { declaredAt: systemSource }),
        name: extension.id,
        version: extension.version,
        ...(extension.fingerprint === undefined ? {} : { fingerprint: extension.fingerprint }),
      },
    ])),
    consts: Object.fromEntries(Object.keys(portable.consts).sort().map(name => [
      name,
      {
        id: `const:${name}`,
        kind: 'const',
        owner: getSemanticOwner(`const:${name}`),
        ...(systemSource === undefined ? {} : { declaredAt: systemSource }),
        name,
        value: portable.consts[name],
      },
    ])),
    constructors: Object.fromEntries([...portable.capabilities.constructors]
      .sort((left, right) => left.name.localeCompare(right.name)).map(({ name, origin }) => {
        return [name, {
          id: `constructor:${name}`,
          kind: 'constructor',
          owner: origin.kind === 'plugin'
            ? getOwner('plugin', `plugin:${origin.id}`)
            : getSemanticOwner(`constructor:${name}`),
          ...(systemSource === undefined ? {} : { declaredAt: systemSource }),
          name,
          origin,
        }]
      })),
    utilities: Object.fromEntries([...portable.utilities].sort().map(path => [
      path,
      {
        id: `utility:${path}`,
        kind: 'utility',
        owner: getSemanticOwner(`utility:${path}`),
        ...(systemSource === undefined ? {} : { declaredAt: systemSource }),
        path: path.split('.'),
      },
    ])),
    ruleGroups: Object.fromEntries([...portable.ruleGroups]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(group => [group.name, {
        id: `rule-group:${group.name}`,
        kind: 'rule-group' as const,
        owner: getSemanticOwner(`rule:${group.name}`),
        ...(systemSource === undefined ? {} : { declaredAt: systemSource }),
        name: group.name,
        ...(group.description === undefined ? {} : { description: group.description }),
        ...(group.layer === undefined ? {} : { layer: group.layer }),
        ...(group.order === undefined ? {} : { order: group.order }),
        selectors: group.selectors,
        fingerprint: group.fingerprint,
      }])),
    runtime: portable.runtime,
    overwrites: portable.overwrites.map((entry, index) => ({
      id: `overwrite:${index}:${entry.kind}:${entry.paths.join(',')}`,
      kind: 'overwrite',
      owner: systemOwner,
      ...(declaredAt(entry.source) === undefined ? {} : { declaredAt: declaredAt(entry.source) }),
      operation: entry.operation ?? 'overwrite',
      target: entry.kind,
      paths: entry.paths,
    })),
    audits: Object.fromEntries(Object.keys(portable.audits).sort().map(name => [
      name,
      {
        id: `audit:${name}`,
        kind: 'audit',
        owner: systemOwner,
        ...(systemSource === undefined ? {} : { declaredAt: systemSource }),
        name,
        level: portable.audits[name],
      },
    ])),
  }) as VanitySystemMapV2
}

function createIntrospectedToken(
  token: VanityTokenRecord,
  portable: VanityPortableSystemV2,
  defaultOwner: VanitySemanticOwner,
): VanityIntrospectedToken {
  const semantic = token.semantic
  const tokenOwner = token.module === undefined || token.module.length === 0
    ? defaultOwner
    : getOwner('module', `module:${token.module.join('.')}`)
  const source = declaredAt(token.file, token.line, token.column)
  return {
    id: `token:${token.path}`,
    kind: 'token',
    owner: tokenOwner,
    ...(source === undefined ? {} : { declaredAt: source }),
    path: token.path.split('.'),
    root: token.root ?? portable.root,
    ...(token.scopes === undefined ? {} : { scopes: token.scopes }),
    ...(token.module === undefined ? {} : { module: token.module }),
    ...(semantic.emit || semantic.reference === 'var' ? { name: token.var as `--${string}` } : {}),
    type: semantic.type,
    reference: semantic.reference,
    emit: semantic.emit,
    mutable: semantic.mutable,
    hasDefault: semantic.hasDefault,
    expression: semantic.expression,
    inference: semantic.inference,
    fold: semantic.fold,
    dependencies: semantic.dependencies,
    support: semantic.support,
    declarations: semantic.declarations,
    branches: semantic.branches,
    ...(semantic.registration === undefined ? {} : { registration: semantic.registration }),
    portability: semantic.portability,
    preview: tokenPreview(token, portable),
    metadata: semantic.metadata,
    ...(token.runtime === undefined ? {} : { runtime: token.runtime }),
    ...(token.description === undefined ? {} : { description: token.description }),
    ...(token.deprecated === undefined ? {} : { deprecated: token.deprecated }),
  }
}

function tokenPreview(token: VanityTokenRecord, portable: VanityPortableSystemV2): VanityIntrospectedToken['preview'] {
  const environment = Object.freeze(Object.fromEntries(Object.entries(portable.axes?.definitions ?? {}).flatMap(([axis, definition]) =>
    definition.defaultMode === undefined ? [] : [[axis, definition.defaultMode]],
  )))
  let selected: string | number | undefined = token.preview.status === 'available'
    ? (environment.scheme === 'dark' ? token.preview.dark : token.preview.light)
    : undefined
  for (const axis of portable.axes?.order ?? []) {
    const mode = environment[axis]
    const branch = token.semantic.branches.find(entry =>
      entry.address.kind === 'axis' && entry.address.axis === axis && entry.address.mode === mode)
    if (branch?.val !== null && branch?.val !== undefined)
      selected = branch.val
  }
  for (const branch of token.semantic.branches) {
    if (
      branch.address.kind === 'case'
      && Object.entries(branch.address.when).every(([axis, mode]) => environment[axis] === mode)
      && branch.val !== null
    ) {
      selected = branch.val
    }
  }
  if (selected === undefined)
    return token.preview.status === 'unavailable' ? token.preview : { status: 'unavailable', reason: 'no value in the default environment' }
  if (String(selected).includes('var('))
    return { status: 'unavailable', reason: 'the selected environment contains a runtime token/custom-property dependency' }
  const caveats = token.preview.status === 'available'
    && token.preview.light !== token.preview.dark
    && environment.scheme === undefined
    ? ['the color preview has scheme branches; selected light because the axis has no declared default']
    : undefined
  return {
    status: 'resolved',
    val: String(selected),
    environment,
    ...(caveats === undefined ? {} : { caveats }),
  }
}

function declaredAt(file: string | undefined, line?: number, column?: number): VanityDeclaredAt | undefined {
  if (file === undefined)
    return undefined
  return {
    file: normalizeSourceId(file),
    ...(line === undefined ? {} : { line }),
    ...(column === undefined ? {} : { column }),
  }
}

export function normalizeSourceId(file: string): string {
  const normalized = file.replaceAll('\\', '/').replace(/^file:\/\//, '')
  if (!normalized.startsWith('/'))
    return normalized.replace(/^\.\//, '')
  const packageMarker = normalized.lastIndexOf('/node_modules/')
  if (packageMarker >= 0)
    return normalized.slice(packageMarker + '/node_modules/'.length)
  const sourceMarker = normalized.lastIndexOf('/src/')
  return sourceMarker >= 0 ? normalized.slice(sourceMarker + 1) : normalized.split('/').pop()!
}

function getOwner<Kind extends VanitySemanticOwner['kind']>(
  kind: Kind,
  id: string,
): Extract<VanitySemanticOwner, { kind: Kind }> {
  return Object.freeze({ kind, id }) as Extract<VanitySemanticOwner, { kind: Kind }>
}

function normalizeAndFreeze(value: unknown): any {
  if (Array.isArray(value))
    return Object.freeze(value.map(normalizeAndFreeze))
  if (!value || typeof value !== 'object')
    return value
  return Object.freeze(Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, normalizeAndFreeze(child)])))
}
