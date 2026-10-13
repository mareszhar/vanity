/** Pure acceptance shared by runtime writes, SSR projection, and build sampling. */
import type { VanityStandardSchemaV1 } from '../tokens/types'
import type { VanityCssDataType } from '../values/types'
import type { VanityRuntimeDiagnostic, VanityRuntimeOptions, VanityRuntimeTokenContract, VanityRuntimeValidationContract } from './contract'
import type { getTokenRangeError } from './range'
import { isBranchHandle, isHandle } from '../tokens/handle'
import { isCssValue, isVanityValue } from '../values/types'
import { createVanityRuntimeError } from './contract'

export function resolveRuntimeValue(
  token: VanityRuntimeTokenContract,
  input: unknown,
  schemas: Readonly<Record<string, VanityStandardSchemaV1 | undefined>>,
  options: VanityRuntimeOptions,
  compareRange?: typeof getTokenRangeError,
): { readonly input: string | number, readonly value: string } | undefined {
  assertUniversalInput(token.type, input)
  const canonical = typeof input === 'number' ? (Object.is(input, -0) ? 0 : input) : serializeRuntimeValue(input)
  const policy = token.validation
  let output: unknown = canonical
  if (policy && shouldValidate(policy.runtime, options)) {
    const schema = schemas[policy.id]
    if (!schema) {
      throwRuntimeDiagnostic({
        code: 'VANITY_RUNTIME_SCHEMA_MISMATCH',
        message: `validation schema '${policy.id}' is not registered on this application runtime controller`,
        token: token.token,
        path: [...token.token, 'validate'],
        fix: `register the '${policy.id}' Standard Schema validator in runtime({ validators })`,
      })
    }
    const result = schema['~standard'].validate(canonical)
    if (isPromiseLike(result)) {
      throwRuntimeDiagnostic({
        code: 'VANITY_RUNTIME_SCHEMA_MISMATCH',
        message: `validation schema '${policy.id}' is async; runtime setters are synchronous`,
        token: token.token,
        path: [...token.token, 'validate'],
        fix: 'provide a synchronous Standard Schema validator for runtime setters',
      })
    }
    if ('issues' in result && result.issues !== undefined) {
      if (policy.onInvalid === 'omit')
        return undefined
      if (policy.onInvalid === 'fallback' && policy.fallback !== undefined) {
        output = policy.fallback
      }
      else {
        throwRuntimeDiagnostic({
          code: 'VANITY_RUNTIME_INVALID_VALUE',
          message: `validation schema '${policy.id}' rejected the value`,
          detail: result.issues.map(issue => issue.message),
          token: token.token,
          path: [...token.token, 'value'],
          fix: 'set a value accepted by the registered validator, or configure onInvalid: fallback/omit',
        })
      }
    }
    else {
      output = result.value
    }
    assertUniversalInput(token.type, output)
  }
  const serialized = serializeRuntimeValue(output)
  if (token.range) {
    // Generated backing supplies this only for ranged schemas. Missing it
    // would matter for a manually restored or malformed application backing.
    if (!compareRange)
      throwRuntimeDiagnostic({ code: 'VANITY_RUNTIME_SCHEMA_MISMATCH', message: 'the runtime range comparator is missing', token: token.token, fix: 'regenerate the application backing with the current compiler' })
    const error = compareRange(token.type, token.range, serialized)
    if (error) {
      throwRuntimeDiagnostic({ code: 'VANITY_RUNTIME_INVALID_VALUE', message: error, token: token.token, path: [...token.token, 'range'], fix: `set a comparable value inside range [${token.range.join(', ')}]` })
    }
  }
  return { input: canonical, value: serialized }
}

function assertUniversalInput(type: VanityCssDataType, input: unknown): void {
  if (isVanityValue(input) && type !== 'unknown' && input.type !== 'unknown' && !isCompatibleType(type, input.type)) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_INVALID_VALUE',
      message: `expected <${type}> but received a <${input.type}> vanity value`,
      path: ['value'],
      fix: `provide a value compatible with <${type}>`,
    })
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throwRuntimeDiagnostic({
        code: 'VANITY_RUNTIME_INVALID_VALUE',
        message: 'a runtime CSS number must be finite',
        path: ['value'],
        fix: 'pass a finite number',
      })
    }
    if (type === 'integer' && !Number.isInteger(input)) {
      throwRuntimeDiagnostic({
        code: 'VANITY_RUNTIME_INVALID_VALUE',
        message: `expected <integer> but received ${input}`,
        path: ['value'],
        fix: 'pass a whole number',
      })
    }
    if (!['unknown', 'number', 'integer', 'percentage', 'number-percentage'].includes(type)) {
      throwRuntimeDiagnostic({
        code: 'VANITY_RUNTIME_INVALID_VALUE',
        message: `a bare number is not a <${type}> runtime input`,
        path: ['value'],
        fix: `pass a typed value or a compatible token for <${type}>`,
      })
    }
    return
  }
  if (typeof input === 'string') {
    if (input.trim().length === 0) {
      throwRuntimeDiagnostic({
        code: 'VANITY_RUNTIME_INVALID_VALUE',
        message: 'a runtime CSS value cannot be empty',
        path: ['value'],
        fix: 'provide non-empty CSS text',
      })
    }
    return
  }
  if (!isVanityValue(input) && !isHandle(input) && !isBranchHandle(input)) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_INVALID_VALUE',
      message: 'runtime CSS values must be strings, finite numbers, vanity values, or token handles',
      path: ['value'],
      fix: 'pass a string, finite number, vanity value, or token handle',
    })
  }
}

function isCompatibleType(expected: VanityCssDataType, actual: VanityCssDataType): boolean {
  return expected === actual
    || (expected === 'number-percentage' && (actual === 'number' || actual === 'integer' || actual === 'percentage'))
    || (expected === 'length-percentage' && (actual === 'length' || actual === 'percentage'))
    || (expected === 'number' && actual === 'integer')
}

export function serializeRuntimeValue(input: unknown): string {
  if (typeof input === 'number')
    return String(Object.is(input, -0) ? 0 : input)
  if (typeof input === 'string') {
    if (input.trim().length === 0) {
      throwRuntimeDiagnostic({
        code: 'VANITY_RUNTIME_INVALID_VALUE',
        message: 'a runtime CSS value cannot be empty',
        path: ['value'],
        fix: 'provide non-empty CSS text',
      })
    }
    return input
  }
  if (isCssValue(input))
    return input.css
  if (isHandle(input) || isBranchHandle(input) || isVanityValue(input)) {
    const serialized = String(input)
    if (serialized.trim().length === 0) {
      throwRuntimeDiagnostic({
        code: 'VANITY_RUNTIME_INVALID_VALUE',
        message: 'a runtime CSS value cannot serialize to an empty string',
        path: ['value'],
        fix: 'provide a serializable CSS value or token reference',
      })
    }
    return serialized
  }
  throwRuntimeDiagnostic({
    code: 'VANITY_RUNTIME_INVALID_VALUE',
    message: 'cannot serialize this runtime CSS value',
    path: ['value'],
    fix: 'pass a string, finite number, vanity value, or token handle',
  })
}

function shouldValidate(mode: VanityRuntimeValidationContract['runtime'], options: VanityRuntimeOptions): boolean {
  return mode === 'always' || (mode === 'dev' && (options.dev ?? isDevelopmentMode()))
}

export function isDevelopmentMode(): boolean {
  const runtimeProcess = Reflect.get(globalThis, 'process') as { env?: { NODE_ENV?: string } } | undefined
  return runtimeProcess?.env?.NODE_ENV !== 'production'
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === 'object' || typeof value === 'function') && value !== null && 'then' in value
}

function throwRuntimeDiagnostic(diagnostic: VanityRuntimeDiagnostic): never {
  throw createVanityRuntimeError(diagnostic)
}
