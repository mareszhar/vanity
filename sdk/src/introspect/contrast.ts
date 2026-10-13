/** Shape checks shared by the portable system and manifest readers. */
export function getContrastRecordError(value: Record<string, unknown>): string | undefined {
  const required = ['kind', 'pairing', 'scheme', 'algorithm', 'measured', 'min', 'accepted']
  const optional = ['file', 'line', 'column', 'fallback', 'evidence', 'samples', 'step', 'worst', 'profile', 'note', 'tokens', 'environment']
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => ![...required, ...optional].includes(key)))
    return 'must have the current contrast-record fields'
  if (value.kind !== 'contrast' || typeof value.pairing !== 'string' || !['light', 'dark'].includes(String(value.scheme)) || !['apca', 'wcag2'].includes(String(value.algorithm)))
    return 'must name a contrast pairing, scheme and algorithm'
  if (typeof value.measured !== 'number' || !Number.isFinite(value.measured) || typeof value.min !== 'number' || !Number.isFinite(value.min) || typeof value.accepted !== 'boolean')
    return 'must carry measured contrast, threshold and acceptance'
  for (const key of ['file', 'fallback']) {
    if (value[key] !== undefined && typeof value[key] !== 'string')
      return `${key} must be text`
  }
  for (const key of ['line', 'column']) {
    if (value[key] !== undefined && (!Number.isInteger(value[key]) || Number(value[key]) < 1))
      return `${key} must be a positive integer`
  }
  return getContrastEvidenceError(value)
}

export function getContrastEvidenceError(value: Record<string, unknown>): string | undefined {
  const isObject = (input: unknown): input is Record<string, unknown> => typeof input === 'object' && input !== null && !Array.isArray(input)
  const isSampleCount = (input: unknown) => typeof input === 'number' && Number.isInteger(input) && input >= 0
  const isStringList = (input: unknown) => Array.isArray(input) && input.every(v => typeof v === 'string')
  if (value.profile !== undefined && !['development', 'production', 'both'].includes(String(value.profile)))
    return 'profile must name development, production or both'
  if (value.samples !== undefined && !isSampleCount(value.samples))
    return 'samples must be a non-negative integer'
  if (value.note !== undefined && typeof value.note !== 'string')
    return 'note must be text'
  if (value.step !== undefined && (!isObject(value.step) || !Object.values(value.step).every(v => typeof v === 'string')))
    return 'step must map token paths to text'
  if (value.worst !== undefined && (!isObject(value.worst) || !Object.values(value.worst).every(v => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))))
    return 'worst must map token paths to canonical inputs'
  if (value.tokens !== undefined && !isStringList(value.tokens))
    return 'tokens must list token paths'
  if (value.environment !== undefined && (!isObject(value.environment) || !Object.values(value.environment).every(v => typeof v === 'string')))
    return 'environment must map axes to modes'
  if (value.evidence !== undefined) {
    const evidence = value.evidence
    if (!isObject(evidence))
      return 'evidence must be an object'
    const keys: Record<string, string[]> = { type: ['level'], environments: ['level', 'environments'], sampled: ['level', 'samples', 'parameters'], unresolved: ['level', 'reason'] }
    const allowed = keys[String(evidence.level)]
    if (!allowed || Object.keys(evidence).some(key => !allowed.includes(key)) || allowed.some(key => !Object.hasOwn(evidence, key)))
      return 'evidence must have the fields for its evidence level'
    if (evidence.level === 'environments' && !isStringList(evidence.environments))
      return 'environments evidence must list environments'
    if (evidence.level === 'sampled' && (!isSampleCount(evidence.samples) || !isObject(evidence.parameters)))
      return 'sampled evidence needs a count and parameters'
    if (evidence.level === 'unresolved' && typeof evidence.reason !== 'string')
      return 'unresolved evidence needs a reason'
  }
}

/** Human labels keep the method and its limits beside the measured result. */
export function formatContrastEvidence(value: import('./records').VanityContrastRecord): string {
  const environment = value.environment ? ` [${Object.entries(value.environment).map(([axis, mode]) => `${axis}=${mode}`).join(', ')}]` : ''
  if (value.evidence?.level === 'unresolved')
    return `not evaluated: ${value.evidence.reason}`
  if (value.evidence?.level === 'sampled') {
    const profile = value.profile && value.profile !== 'both' ? ` (${value.profile})` : ''
    const limit = value.evidence.parameters.limit
    return `sampled${profile}${environment}: ${Object.entries(value.step ?? {}).map(([path, step]) => `${path} ${step}`).join(', ')} (${value.samples ?? value.evidence.samples} reachable samples)${value.worst ? `, worst at ${JSON.stringify(value.worst)}` : ''}${limit ? `; ${limit}` : ''}${value.note ? `; ${value.note}` : ''}; evidence for the declared range and validation, not proof`
  }
  return `checked: authored ${value.fallback ? 'representative' : 'values'}${environment}${value.note ? `; ${value.note}` : ''}`
}
