/** Port handles shared across contexts, with synchronous Standard Schema validation. */

import type { VanityStandardSchemaV1 } from '../tokens/types'
import type {
  VanityPort,
  VanityPortBindingOptions,
  VanityPortDecValue,
  VanityPortMeta,
  VanityPortStyle,
  VanityPortValue,
} from './types'
import { attachExplanation } from '../introspect/semantic'
import { createVanityRuntimeError } from '../runtime/contract'
import { isHandle } from '../tokens/handle'
import { isCssValue, isVanityValue } from '../values/types'

const PORT = Symbol.for('vanity.port')
const OMIT = Symbol('vanity.port.omit')

interface PortHandleContext {
  readonly serialize?: (value: unknown) => VanityPortValue
  readonly schema?: VanityStandardSchemaV1
  readonly binding?: VanityPortBindingOptions
}

export function isPort(value: unknown): value is VanityPort {
  return typeof value === 'function' && (value as unknown as Record<symbol, unknown>)[PORT] === true
}

export function createPortHandle(meta: VanityPortMeta, context: PortHandleContext = {}): VanityPort {
  const reference = `var(${meta.name}, ${String(meta.defaultValue)})` as `var(--${string}, ${string})`
  const handle = (() => reference) as unknown as VanityPort
  Object.defineProperty(handle, 'name', { value: meta.name, configurable: true })
  Object.defineProperty(handle, PORT, { value: true, configurable: true })

  const dec = (input: VanityPortDecValue<any>): VanityPortStyle => {
    const value = validate(input, meta, context)
    if (value === OMIT)
      return {}
    return { [meta.name]: serialize(value, context, meta) }
  }

  return attachExplanation(Object.assign(handle, {
    meta,
    defaultValue: meta.defaultValue,
    type: meta.type,
    kind: meta.kind,
    var: reference,
    dec,
    bind: (binding: VanityPortBindingOptions) => createPortHandle(meta, { ...context, binding }),
    describe: (text: string): VanityPort => {
      meta.description = text
      return handle
    },
    deprecated: (reason: string): VanityPort => {
      meta.deprecated = reason
      return handle
    },
    toString: () => reference,
  }), {
    id: `port:${meta.name}`,
    kind: 'port',
    name: meta.name,
    type: meta.type,
    default: meta.defaultValue,
    ...(meta.validation === undefined ? {} : { validation: meta.validation }),
    ...(meta.description === undefined ? {} : { description: meta.description }),
    ...(meta.deprecated === undefined ? {} : { deprecated: meta.deprecated }),
  })
}

function validate(input: unknown, meta: VanityPortMeta, context: PortHandleContext): unknown | typeof OMIT {
  const policy = meta.validation
  if (!policy || !shouldValidate(policy.runtime, context.binding?.dev))
    return input

  const schema = context.schema ?? context.binding?.validators?.[policy.id]
  if (!schema) {
    throw createVanityRuntimeError({
      code: 'VANITY_RUNTIME_SCHEMA_MISMATCH',
      message: `port ${meta.name} needs the synchronous Standard Schema validator '${policy.id}'`,
      path: ['port', meta.name, 'validate'],
      fix: `register the '${policy.id}' validator when binding the port`,
    })
  }

  const result = schema['~standard'].validate(input)
  if (isPromiseLike(result)) {
    throw createVanityRuntimeError({
      code: 'VANITY_RUNTIME_SCHEMA_MISMATCH',
      message: `port ${meta.name} validator '${policy.id}' is async; dec() is synchronous`,
      path: ['port', meta.name, 'validate'],
      fix: 'provide a synchronous Standard Schema validator for port.dec()',
    })
  }
  if ('value' in result)
    return result.value

  if (policy.onInvalid === 'omit')
    return OMIT
  if (policy.onInvalid === 'fallback' && policy.fallback !== undefined)
    return policy.fallback

  const detail = result.issues.map(issue => issue.message).join('; ')
  throw createVanityRuntimeError({
    code: 'VANITY_RUNTIME_INVALID_VALUE',
    message: `port ${meta.name} rejected its value`,
    detail: detail ? [detail] : undefined,
    path: ['port', meta.name, 'value'],
    fix: 'provide a value accepted by the port validator, or configure fallback/omit handling',
  })
}

function shouldValidate(mode: false | 'dev' | 'always', explicitDev: boolean | undefined): boolean {
  if (mode === false)
    return false
  if (mode === 'always')
    return true
  if (explicitDev !== undefined)
    return explicitDev
  // eslint-disable-next-line node/prefer-global/process
  return typeof process === 'undefined' || process.env.NODE_ENV !== 'production'
}

function serialize(value: unknown, context: PortHandleContext, meta: VanityPortMeta): VanityPortValue {
  if (context.serialize)
    return context.serialize(value)
  if (isPort(value))
    return value.var
  if (isHandle(value))
    return String(value)
  if ((typeof value === 'object' || typeof value === 'function') && value !== null && '$var' in value)
    return String(value)
  if ((typeof value === 'object' || typeof value === 'function') && value !== null && 'var' in value)
    return (value as { var: string }).var
  if (isCssValue(value))
    return value.css
  if (isVanityValue(value))
    return String(value)
  if (typeof value === 'string' || typeof value === 'number')
    return value
  throw createVanityRuntimeError({
    code: 'VANITY_RUNTIME_INVALID_VALUE',
    message: 'a port value must serialize to CSS text or a finite number',
    path: ['port', meta.name, 'value'],
    fix: 'provide CSS text, a finite number, a vanity value, a token, or another port',
  })
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value
}
