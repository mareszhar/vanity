/** The typed runtime boundary — declared, defaulted, named by its export. */
export const fraction = port(0)
const percentage = calc(fraction).multiply(percent(100))

export const track = cls({
  background: t.color.surface,
  blockSize: t.space.sm,
  borderRadius: t.radius.pill,
  overflow: 'hidden',
})

export const fill = cls({
  inlineSize: percentage,
  blockSize: '100%',
  background: t.color.brand,
  motionOk: { transition: `inline-size ${t.duration.normal} ease` },
})
