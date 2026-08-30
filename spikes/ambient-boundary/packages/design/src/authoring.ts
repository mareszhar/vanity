/** Stands in for the authoring barrel: `export const { class: cls, t } = ds`. */
export const cls = (rules: Record<string, unknown>): string => `c${Object.keys(rules).length}`
export const t = { color: { brand: 'var(--brand)' } } as const
