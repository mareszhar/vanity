const { class: style, t } = ds

export const field = style({ display: 'grid', gap: t.space['2xs'] })

export const label = style({ ...t.text.label.$dec, color: t.color.inkMuted })

export const input = style({
  ...t.text.body.$dec,
  'inlineSize': '100%',
  'minBlockSize': t.size.control,
  'paddingInline': t.space.sm,
  'border': `1px solid ${t.color.border}`,
  'borderRadius': t.radius.sm,
  'background': t.color.canvas,
  'color': t.color.ink,
  'transitionProperty': 'border-color',
  'transitionDuration': t.duration.quick,
  'transitionTimingFunction': t.ease.standard,
  '&::placeholder': { color: t.color.inkFaint },
  'hover': { borderColor: t.color.borderStrong },
  'focusVisible': { ...focusRing({ color: t.color.brand }).focusVisible, borderColor: t.color.brand },
})
