const { class: style, t } = ds

export const page = style({
  minBlockSize: '100dvh',
  background: t.color.canvas,
  color: t.color.ink,
  fontFamily: t.font.family,
  colorScheme: 'light dark',
  display: 'grid',
  dark: { colorScheme: 'dark' },
  light: { colorScheme: 'light' },
  lg: { gridTemplateColumns: '20rem minmax(0, 1fr)' },
})

export const skipLink = style({
  position: 'fixed',
  insetBlockStart: t.space.sm,
  insetInlineStart: t.space.sm,
  zIndex: 60,
  paddingInline: t.space.sm,
  paddingBlock: t.space.xs,
  borderRadius: t.radius.sm,
  background: t.color.brand,
  color: t.color.onBrand,
  transform: 'translateY(-200%)',
  focusVisible: { transform: 'translateY(0)' },
})

export const main = style({
  minInlineSize: 0,
  display: 'grid',
  alignContent: 'start',
})

export const facts = style({ display: 'grid', gap: t.space.xs, margin: 0 })
export const fact = style({
  display: 'flex',
  justifyContent: 'space-between',
  gap: t.space.md,
  paddingBlock: t.space.xs,
  borderBlockEnd: `1px solid ${t.color.border}`,
})
export const factLabel = style({ ...t.text.label.$dec, margin: 0, color: t.color.ink })
export const factValue = style({ ...t.text.detail.$dec, margin: 0, color: t.color.inkMuted, textAlign: 'end', textTransform: 'capitalize' })
export const note = style({ ...t.text.detail.$dec, margin: 0, color: t.color.inkFaint })
