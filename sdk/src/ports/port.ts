/** Build-time port declaration bound to one finalized system serializer. */

import type {
  VanityPort,
  VanityPortDataTypeOf,
  VanityPortDefinition,
  VanityPortInput,
  VanityPortKind,
  VanityPortMeta,
  VanityPortOptions,
  VanityPortValidation,
  VanityPortValidationMeta,
  VanityPortValue,
  VanityPortWiden,
} from './types'
import { getDiagnosticSource, VanityError } from '../diagnostics'
import { record } from '../introspect/records'
import { substrate } from '../substrate'
import { createPortHandle, isPort } from './handle'

export { isPort } from './handle'

export interface VanityPortContext {
  readonly prefix: string
  readonly serialize: (value: unknown) => VanityPortValue
}

export function createPort<
  Value extends VanityPortInput,
  Output = Value,
>(
  input: Value | VanityPortDefinition<Value, Output>,
  options: VanityPortOptions<Value, Output> | undefined,
  ctx: VanityPortContext,
): VanityPort<VanityPortWiden<Value>, VanityPortDataTypeOf<Value>> {
  const file = substrate.modules.requireStyleModule('port')
  const definition = isDefinition(input) ? input : undefined
  const defaultValue = (definition?.val ?? input) as Value
  const config = definition ?? options
  const bareIdent = substrate.css.createCustomProperty(config?.label).slice(2)
  const name = `--${ctx.prefix}-${bareIdent}`
  let serializedDefault: VanityPortValue
  try {
    serializedDefault = ctx.serialize(defaultValue)
  }
  catch (error) {
    throw new VanityError({
      code: 'VANITY_PORT_INVALID_DEFAULT',
      message: 'a port default is not a serializable CSS value',
      detail: [error instanceof Error ? error.message : String(error)],
      file,
      fix: 'give it CSS text, a finite number, a typed vanity value, a token, or another port',
    })
  }
  const type = getPortDataType(defaultValue)
  const validation = normalizeValidation(config?.validate as VanityPortValidation<any, any> | undefined, ctx)

  const meta: VanityPortMeta = {
    name,
    defaultValue: serializedDefault,
    type,
    kind: getPortKind(type),
    ...(validation === undefined ? {} : { validation }),
  }

  const handle = createPortHandle(meta, {
    serialize: ctx.serialize,
    schema: config?.validate?.schema as any,
  }) as unknown as VanityPort<VanityPortWiden<Value>, VanityPortDataTypeOf<Value>>

  record({
    kind: 'port',
    file,
    ...getDiagnosticSource(),
    ...(config?.label === undefined ? {} : { label: config.label }),
    meta,
  })

  substrate.modules.registerFunctionSerialization(handle as unknown as (...args: unknown[]) => unknown, {
    importPath: '@mszr/vanity/runtime',
    importName: 'restorePort',
    args: [meta as unknown as Record<string, string>],
  })

  return handle
}

function isDefinition<
  Value extends VanityPortInput,
  Output,
>(
  input: Value | VanityPortDefinition<Value, Output>,
): input is VanityPortDefinition<Value, Output> {
  return typeof input === 'object' && input !== null && Object.hasOwn(input, 'val')
}

function normalizeValidation(
  validate: VanityPortValidation | undefined,
  ctx: VanityPortContext,
): VanityPortValidationMeta | undefined {
  if (!validate)
    return undefined
  if (validate.id.trim().length === 0)
    throw new TypeError('[vanity] port.validate.id must be non-empty')
  const runtime = validate.runtime ?? 'dev'
  const onInvalid = validate.onInvalid ?? 'throw'
  if (runtime !== false && runtime !== 'dev' && runtime !== 'always')
    throw new TypeError('[vanity] port.validate.runtime must be false, \'dev\', or \'always\'')
  if (onInvalid !== 'throw' && onInvalid !== 'fallback' && onInvalid !== 'omit')
    throw new TypeError('[vanity] port.validate.onInvalid must be \'throw\', \'fallback\', or \'omit\'')
  if (onInvalid === 'fallback' && !Object.hasOwn(validate, 'fallback'))
    throw new TypeError('[vanity] port.validate with onInvalid: \'fallback\' needs a fallback value')

  const fallback = validate.fallback === undefined ? undefined : ctx.serialize(validate.fallback)
  return Object.freeze({
    id: validate.id,
    runtime,
    onInvalid,
    ...(fallback === undefined ? {} : { fallback }),
  })
}

function getPortDataType(value: VanityPortInput): any {
  if (isPort(value))
    return value.type
  if ((typeof value === 'object' || typeof value === 'function') && value !== null) {
    if ('$type' in value)
      return value.$type
    if ('type' in value)
      return value.type
  }
  if (typeof value === 'number')
    return 'number'
  if (typeof value !== 'string')
    return 'declaration'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(value))
    return 'percentage'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:px|rem|em|vh|vw|vmin|vmax|ch|lh)$/.test(value))
    return 'length'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:deg|grad|rad|turn)$/.test(value))
    return 'angle'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:ms|s)$/.test(value))
    return 'time'
  return 'declaration'
}

function getPortKind(type: string): VanityPortKind {
  if (type === 'number' || type === 'integer')
    return 'number'
  return type === 'color' ? 'color' : 'string'
}
