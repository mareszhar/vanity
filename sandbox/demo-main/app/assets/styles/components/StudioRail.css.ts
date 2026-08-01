const { class: style, t } = ds

export const rail = style({
  display: 'grid',
  alignContent: 'start',
  gap: t.space.lg,
  padding: t.space.lg,
  borderBlockEnd: `1px solid ${t.color.border}`,
  background: t.color.surface,
  lg: {
    position: 'sticky',
    insetBlockStart: 0,
    blockSize: '100dvh',
    overflowY: 'auto',
    borderBlockEnd: 'none',
    borderInlineEnd: `1px solid ${t.color.border}`,
  },
})

export const brand = style({ display: 'flex', alignItems: 'center', gap: t.space.sm })
export const brandMark = style({
  display: 'grid',
  placeItems: 'center',
  inlineSize: '2.5rem',
  blockSize: '2.5rem',
  flex: '0 0 auto',
  borderRadius: t.radius.md,
  background: `linear-gradient(140deg, ${t.color.brand}, ${t.color.brandHover})`,
  color: t.color.onBrand,
  fontSize: '1.15rem',
  fontWeight: 700,
  boxShadow: t.shadow.raised,
})
export const brandText = style({ display: 'grid' })
export const brandName = style({ ...t.text.title.$dec, margin: 0, letterSpacing: '-0.02em' })
export const brandTag = style({ ...t.text.detail.$dec, margin: 0, color: t.color.inkMuted })

export const section = style({ display: 'grid', gap: t.space.sm })
export const heading = style({
  ...t.text.micro.$dec,
  margin: 0,
  color: t.color.inkFaint,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
})
export const controls = style({ display: 'grid', gap: t.space.md })
export const group = style({ display: 'grid', gap: t.space['2xs'] })
export const controlLabel = style({ ...t.text.label.$dec, color: t.color.inkMuted })

export const presets = style({ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: t.space['2xs'] })
export const preset = style({
  ...t.text.detail.$dec,
  display: 'flex',
  alignItems: 'center',
  gap: t.space.xs,
  minBlockSize: t.size.controlSm,
  paddingInline: t.space.sm,
  border: `1px solid ${t.color.border}`,
  borderRadius: t.radius.sm,
  background: t.color.canvas,
  color: t.color.ink,
  fontWeight: 550,
  cursor: 'pointer',
  transitionProperty: 'border-color, background-color',
  transitionDuration: t.duration.quick,
  transitionTimingFunction: t.ease.standard,
  hover: { borderColor: t.color.brand, background: t.color.brandSoft },
  ...focusRing({ color: t.color.brand }),
})
export const presetDot = style({
  inlineSize: '0.75rem',
  blockSize: '0.75rem',
  flex: '0 0 auto',
  borderRadius: '50%',
  boxShadow: 'inset 0 0 0 1px oklch(0 0 0 / 0.15)',
})

export const actions = style({ display: 'grid', gap: t.space.xs })
export const footer = style({
  display: 'grid',
  gap: t.space.xs,
  paddingBlockStart: t.space.md,
  borderBlockStart: `1px solid ${t.color.border}`,
})
export const note = style({ ...t.text.detail.$dec, margin: 0, color: t.color.inkFaint, textWrap: 'pretty' })
