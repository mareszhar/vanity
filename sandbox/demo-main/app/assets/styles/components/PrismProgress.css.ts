const { calc, class: style, clamp, percent, port, t } = ds

// The fraction is a per-instance runtime input — a port, not a design token.
export const fraction = port(0)
const percentage = calc(fraction).multiply(percent(100))

export const track = style({
  position: 'relative',
  blockSize: t.space.sm,
  borderRadius: t.radius.pill,
  background: t.color.surface,
  border: `1px solid ${t.color.border}`,
  overflow: 'hidden',
})

export const fill = style({
  blockSize: '100%',
  inlineSize: clamp(percent(0), percentage, percent(100)),
  borderRadius: t.radius.pill,
  background: `linear-gradient(90deg, ${t.color.brand}, ${t.color.brandHover})`,
  transitionProperty: 'inline-size',
  transitionDuration: t.duration.base,
  transitionTimingFunction: t.ease.standard,
})
