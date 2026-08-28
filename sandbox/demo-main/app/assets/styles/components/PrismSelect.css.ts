export const field = cls({ display: 'grid', gap: t.space['2xs'] })

export const label = cls({ ...t.text.label.$dec, color: t.color.inkMuted })

export const wrap = cls({ position: 'relative', display: 'grid' })

export const select = cls({
  ...t.text.body.$dec,
  appearance: 'none',
  WebkitAppearance: 'none',
  inlineSize: '100%',
  minBlockSize: t.size.control,
  // Deliberate room between the value and the caret — never a cramped marker.
  paddingInlineStart: t.space.sm,
  paddingInlineEnd: t.space.xl,
  border: `1px solid ${t.color.border}`,
  borderRadius: t.radius.sm,
  background: t.color.canvas,
  color: t.color.ink,
  cursor: 'pointer',
  textTransform: 'capitalize',
  transitionProperty: 'border-color',
  transitionDuration: t.duration.quick,
  transitionTimingFunction: t.ease.standard,
  hover: { borderColor: t.color.borderStrong },
  focusVisible: { ...focusRing({ color: t.color.brand }).focusVisible, borderColor: t.color.brand },
})

export const caret = cls({
  position: 'absolute',
  insetInlineEnd: t.space.sm,
  insetBlockStart: '50%',
  translate: '0 -50%',
  color: t.color.inkMuted,
  fontSize: '0.62rem',
  pointerEvents: 'none',
})
