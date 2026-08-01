const { class: style, port, t } = ds

/** The typed runtime boundary — declared, defaulted, named by its export. */
export const fraction = port(0)

export const track = style({
  background: t.color.surface,
  blockSize: t.space.sm,
  borderRadius: t.radius.pill,
  overflow: 'hidden',
})

export const fill = style({
  inlineSize: `calc(${fraction} * 100%)`,
  blockSize: '100%',
  background: t.color.brand,
  motionOk: { transition: `inline-size ${t.duration.normal} ease` },
})
