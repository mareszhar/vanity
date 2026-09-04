/** Canonical token configuration branding. The wrapper is data, not a group. */

import type { VanityDiagnosticCode } from '../diagnostics'
import type { VanityAxisDefinitions, VanityAxisRegistry } from '../system/axes'
import type { VanityCssDataType } from '../values/types'
import type {
  VanityConfiguredToken,
  VanityTokenConfig,
  VanityTokenFactory,
  VanityTypedNoDefaultTokenFactory,
} from './types'
import { VanityError } from '../diagnostics'
import { VANITY_CONFIGURED_TOKEN } from './types'

const DATA_TYPES = {
  unknown: 'unknown',
  number: 'number',
  integer: 'integer',
  percentage: 'percentage',
  numberPercentage: 'number-percentage',
  length: 'length',
  lengthPercentage: 'length-percentage',
  angle: 'angle',
  time: 'time',
  frequency: 'frequency',
  resolution: 'resolution',
  flex: 'flex',
  color: 'color',
  image: 'image',
  position: 'position',
  easingFunction: 'easing-function',
  transformFunction: 'transform-function',
  transformList: 'transform-list',
  customIdent: 'custom-ident',
  dashedIdent: 'dashed-ident',
  string: 'string',
  url: 'url',
} as const satisfies Readonly<Record<string, VanityCssDataType>>

export function createTokenFactory<Axes extends VanityAxisDefinitions = Record<never, never>>(
  axes?: VanityAxisRegistry<Axes>,
): VanityTokenFactory<Axes> {
  const token = ((config: VanityTokenConfig) => createConfiguredToken(config, inferConfiguredType(config), axes)) as VanityTokenFactory<Axes>

  for (const [name, type] of Object.entries(DATA_TYPES)) {
    Object.defineProperty(token, name, {
      enumerable: true,
      value: ((config: Omit<VanityTokenConfig<never>, 'val'> = {}) => createConfiguredToken(config, type, axes)) as unknown as VanityTypedNoDefaultTokenFactory<VanityCssDataType, Axes>,
    })
  }

  return Object.freeze(token) as unknown as VanityTokenFactory<Axes>
}

export function isConfiguredToken(value: unknown): value is VanityConfiguredToken {
  return typeof value === 'object' && value !== null
    && (value as Partial<VanityConfiguredToken>)[VANITY_CONFIGURED_TOKEN] === true
}

function createConfiguredToken<const Config extends VanityTokenConfig, Type extends VanityCssDataType>(
  config: Config,
  type: Type,
  axes?: VanityAxisRegistry<any>,
): VanityConfiguredToken<Config, Type> {
  if (!isPlainObject(config)) {
    throwTokenConfigError(
      'VANITY_TOKENS_INVALID_CONFIG',
      'token() needs one plain configuration object',
      'token',
      'pass a plain token configuration object',
    )
  }

  validateTokenConfig(config, axes)
  const lowered = lowerAxisDerivations(config, axes)
  return Object.freeze({
    [VANITY_CONFIGURED_TOKEN]: true as const,
    config: freezeDeep(lowered) as Config,
    type,
  })
}

/**
 * Axis derivations are authoring sugar, not deferred system semantics. Lower
 * them while the originating system is present so unfinished modules carry
 * self-contained public value IR across HMR and compatible system instances.
 */
function lowerAxisDerivations<Config extends VanityTokenConfig>(
  config: Config,
  axes?: VanityAxisRegistry<any>,
): Config {
  if (config.axes === undefined || axes === undefined)
    return { ...config }

  const loweredAxes: Record<string, Record<string, unknown | null>> = {}
  for (const [axis, configuredModes] of Object.entries(config.axes)) {
    const definition = axes.definitions[axis]!
    const loweredModes: Record<string, unknown | null> = { ...configuredModes }
    const context: Record<string, unknown> = { ...loweredModes }
    if (definition.defaultMode !== undefined && Object.hasOwn(config, 'val') && !Object.hasOwn(context, definition.defaultMode))
      context[definition.defaultMode] = config.val

    for (const mode of definition.modeOrder) {
      const derive = (definition.derive as Readonly<Record<string, ((modes: Readonly<Record<string, any>>) => unknown) | undefined>>)[mode]
      if (derive === undefined || Object.hasOwn(context, mode))
        continue
      let value: unknown
      try {
        value = derive(Object.freeze({ ...context }))
      }
      catch (error) {
        throwTokenConfigError(
          'VANITY_TOKENS_INVALID_AXES',
          `token axis '${axis}' could not derive mode '${mode}': ${error instanceof Error ? error.message : String(error)}`,
          ['axes', axis, mode],
          'return a valid token value from the axis derivation callback',
        )
      }
      if (value !== undefined) {
        loweredModes[mode] = value
        context[mode] = value
      }
    }
    loweredAxes[axis] = loweredModes
  }

  return { ...config, axes: loweredAxes } as Config
}

function validateTokenConfig(config: VanityTokenConfig, axes?: VanityAxisRegistry<any>): void {
  const conditional = config.mutable === true || config.axes !== undefined || config.cases !== undefined
  if (conditional && config.reference === 'val') {
    throwTokenConfigError(
      'VANITY_TOKENS_TRAIT_CONFLICT',
      'token.reference cannot be \'val\' when mutable, axes, or cases need a custom-property binding',
      'reference',
      'use reference: \'var\' for mutable, axis, or case tokens',
    )
  }
  if (conditional && config.emit === false) {
    throwTokenConfigError(
      'VANITY_TOKENS_TRAIT_CONFLICT',
      'token.emit cannot be false when mutable, axes, or cases need a custom-property binding',
      'emit',
      'use emit: true for mutable, axis, or case tokens',
    )
  }
  if (Object.hasOwn(config, 'val') && config.val === null) {
    throwTokenConfigError(
      'VANITY_TOKENS_INVALID_CONFIG',
      'token({ val: null }) is ambiguous',
      'val',
      'omit val for a base reservation, or use null as an axis/case reservation',
    )
  }
  if (config.reference === 'var' && config.emit === false && Object.hasOwn(config, 'val')) {
    throwTokenConfigError(
      'VANITY_TOKENS_TRAIT_CONFLICT',
      'a var-referenced token with an authored val must emit its custom property',
      ['reference', 'emit'],
      'use emit: true, or use reference: \'val\' for a known nonemitted value',
    )
  }
  if (config.axes !== undefined && !isPlainObject(config.axes)) {
    throwTokenConfigError(
      'VANITY_TOKENS_INVALID_AXES',
      'token.axes must be an object keyed by axis and mode',
      'axes',
      'provide an object whose keys are declared axes and whose values are mode maps',
    )
  }
  if (config.cases !== undefined && !Array.isArray(config.cases)) {
    throwTokenConfigError(
      'VANITY_TOKENS_INVALID_CONFIG',
      'token.cases must be an array of explicit intersections',
      'cases',
      'provide cases as an array of { when, val } entries',
    )
  }
  validateRuntimePolicy(config.validate)

  for (const [axis, modes] of Object.entries(config.axes ?? {})) {
    const definition = axes?.definitions[axis]
    if (!definition) {
      throwTokenConfigError(
        'VANITY_TOKENS_UNKNOWN_AXIS',
        `token axis '${axis}' is not declared by this system`,
        ['axes', axis],
        `declare '${axis}' with addAxis() before using it in a token`,
      )
    }
    if (!isPlainObject(modes)) {
      throwTokenConfigError(
        'VANITY_TOKENS_INVALID_AXES',
        `token axis '${axis}' must be an object keyed by mode`,
        ['axes', axis],
        'provide an object keyed by the axis modes',
      )
    }
    for (const mode of Object.keys(modes)) {
      if (!Object.hasOwn(definition.modes, mode)) {
        throwTokenConfigError(
          'VANITY_TOKENS_UNKNOWN_MODE',
          `token axis '${axis}' has no mode '${mode}'`,
          ['axes', axis, mode],
          `use one of the declared modes: ${definition.modeOrder.join(', ')}`,
        )
      }
    }
  }

  const caseAddresses = new Set<string>()
  for (const entry of config.cases ?? []) {
    if (!isPlainObject(entry) || !isPlainObject(entry.when) || !Object.hasOwn(entry, 'val')) {
      throwTokenConfigError(
        'VANITY_TOKENS_INVALID_CONFIG',
        'every token case needs plain when and val fields',
        'cases',
        'provide each case as { when: { axis: mode }, val }',
      )
    }
    const names = Object.keys(entry.when)
    if (names.length < 2) {
      throwTokenConfigError(
        'VANITY_TOKENS_INVALID_CONFIG',
        'a sparse token case must intersect at least two declared axes',
        'cases',
        'add a second declared axis to the case or use an axis branch instead',
      )
    }
    for (const [axis, mode] of Object.entries(entry.when)) {
      const definition = axes?.definitions[axis]
      if (!definition) {
        throwTokenConfigError(
          'VANITY_TOKENS_UNKNOWN_AXIS',
          `token case axis '${axis}' is not declared by this system`,
          ['cases', axis],
          `declare '${axis}' with addAxis() before using it in a token case`,
        )
      }
      if (typeof mode !== 'string' || !Object.hasOwn(definition.modes, mode)) {
        throwTokenConfigError(
          'VANITY_TOKENS_UNKNOWN_MODE',
          `token case axis '${axis}' has no mode '${String(mode)}'`,
          ['cases', axis],
          `use one of the declared modes: ${definition.modeOrder.join(', ')}`,
        )
      }
    }
    const address = [...Object.entries(entry.when)].sort(([a], [b]) => a.localeCompare(b)).map(([axis, mode]) => `${axis}:${mode}`).join('|')
    if (caseAddresses.has(address)) {
      throwTokenConfigError(
        'VANITY_TOKENS_INVALID_CONFIG',
        `duplicate token case '${address}'`,
        'cases',
        'remove the duplicate intersection or give it a different axis/mode address',
      )
    }
    caseAddresses.add(address)
  }
}

function validateRuntimePolicy(validate: VanityTokenConfig['validate']): void {
  if (validate === undefined)
    return
  if (!isPlainObject(validate) || typeof validate.id !== 'string' || validate.id.trim().length === 0) {
    throwTokenConfigError(
      'VANITY_TOKENS_INVALID_CONFIG',
      'token.validate needs a stable non-empty id for build/app schema lookup',
      ['validate', 'id'],
      'provide a stable non-empty validation id',
    )
  }
  if (validate.runtime !== undefined && validate.runtime !== false && validate.runtime !== 'dev' && validate.runtime !== 'always') {
    throwTokenConfigError(
      'VANITY_TOKENS_INVALID_CONFIG',
      'token.validate.runtime must be false, \'dev\', or \'always\'',
      ['validate', 'runtime'],
      'set runtime to false, \'dev\', or \'always\'',
    )
  }
  if (validate.onInvalid !== undefined && validate.onInvalid !== 'throw' && validate.onInvalid !== 'fallback' && validate.onInvalid !== 'omit') {
    throwTokenConfigError(
      'VANITY_TOKENS_INVALID_CONFIG',
      'token.validate.onInvalid must be \'throw\', \'fallback\', or \'omit\'',
      ['validate', 'onInvalid'],
      'set onInvalid to \'throw\', \'fallback\', or \'omit\'',
    )
  }
  if (validate.onInvalid === 'fallback' && !Object.hasOwn(validate, 'fallback')) {
    throwTokenConfigError(
      'VANITY_TOKENS_INVALID_CONFIG',
      'token.validate with onInvalid: \'fallback\' needs a fallback value',
      ['validate', 'fallback'],
      'provide fallback or choose onInvalid: \'throw\' or \'omit\'',
    )
  }
  if (validate.schema !== undefined) {
    const standard = validate.schema['~standard']
    if (!standard || standard.version !== 1 || typeof standard.vendor !== 'string' || typeof standard.validate !== 'function') {
      throwTokenConfigError(
        'VANITY_TOKENS_INVALID_CONFIG',
        'token.validate.schema must implement Standard Schema v1',
        ['validate', 'schema'],
        'provide a schema with a valid ~standard version, vendor, and validate function',
      )
    }
  }
}

function inferConfiguredType(config: VanityTokenConfig): VanityCssDataType {
  const val = Object.hasOwn(config, 'val')
    ? config.val
    : getFirstConfiguredValue(config)
  if ((typeof val === 'object' || typeof val === 'function') && val !== null && Object.hasOwn(val, 'type')) {
    const type = (val as { type?: unknown }).type
    if (typeof type === 'string')
      return type as VanityCssDataType
  }
  if (typeof val === 'number')
    return Number.isInteger(val) ? 'integer' : 'number'
  if (typeof val === 'string') {
    if (/^-?(?:\d+|\d*\.\d+)%$/.test(val))
      return 'percentage'
    if (/^-?(?:\d+|\d*\.\d+)(?:px|rem|em|vh|vw|vmin|vmax|ch|lh)$/.test(val))
      return 'length'
    if (/^-?(?:\d+|\d*\.\d+)(?:deg|grad|rad|turn)$/.test(val))
      return 'angle'
    if (/^-?(?:\d+|\d*\.\d+)(?:ms|s)$/.test(val))
      return 'time'
  }
  return 'unknown'
}

function getFirstConfiguredValue(config: VanityTokenConfig): unknown {
  for (const modes of Object.values(config.axes ?? {})) {
    for (const value of Object.values(modes)) {
      if (value !== null)
        return value
    }
  }
  for (const entry of config.cases ?? []) {
    if (entry.val !== null)
      return entry.val
  }
  return undefined
}

function isPlainObject(value: unknown): value is Record<string, any> {
  if (typeof value !== 'object' || value === null)
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function freezeDeep<T>(value: T): T {
  if (Array.isArray(value) && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of value)
      freezeDeep(child)
  }
  else if (isPlainObject(value) && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value))
      freezeDeep(child)
  }
  return value
}

function throwTokenConfigError(
  code: Extract<VanityDiagnosticCode, `VANITY_TOKENS_${string}`>,
  message: string,
  path: string | readonly string[],
  fix: string,
): never {
  throw new VanityError({ code, message, path, fix })
}
