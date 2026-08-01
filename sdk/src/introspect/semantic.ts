/** Plane-neutral marker shared by semantic handles and the build-plane explainer. */
export const VANITY_EXPLAINABLE = Symbol.for('vanity.explainable')

export function explainable<T extends object>(value: T, explanation: Readonly<Record<string, unknown>>): T {
  Object.defineProperty(value, VANITY_EXPLAINABLE, {
    configurable: true,
    value: Object.freeze(explanation),
  })
  return value
}

/** Stable human projection; structured data remains the primary API. */
export function formatExplanation(explanation: object): string {
  const record = explanation as Readonly<Record<string, unknown>>
  const kind = 'kind' in record ? String(record.kind) : 'value'
  const id = 'id' in record ? String(record.id) : '(anonymous)'
  const summary = 'description' in record && typeof record.description === 'string'
    ? ` — ${record.description}`
    : ''
  return `${kind} ${id}${summary}\n${JSON.stringify(explanation, null, 2)}`
}
