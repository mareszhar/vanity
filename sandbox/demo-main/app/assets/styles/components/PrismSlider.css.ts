const thumb = {
  inlineSize: '1.2rem',
  blockSize: '1.2rem',
  borderRadius: '50%',
  background: t.color.raised,
  border: `2px solid ${t.color.brand}`,
  boxShadow: t.shadow.raised,
  cursor: 'grab',
} as const

const track = {
  blockSize: '0.5rem',
  borderRadius: t.radius.pill,
  background: t.color.surface,
  border: `1px solid ${t.color.border}`,
} as const

const spectrum
  = 'linear-gradient(90deg, oklch(0.72 0.17 0), oklch(0.72 0.17 60), oklch(0.72 0.17 120), oklch(0.72 0.17 180), oklch(0.72 0.17 240), oklch(0.72 0.17 300), oklch(0.72 0.17 360))'

export const field = cls({ display: 'grid', gap: t.space['2xs'] })

export const header = cls({
  ...t.text.label.$dec,
  display: 'flex',
  justifyContent: 'space-between',
  gap: t.space.sm,
  color: t.color.inkMuted,
})

export const value = cls({ color: t.color.ink, fontVariantNumeric: 'tabular-nums' })

export const slider = cls({
  'appearance': 'none',
  'WebkitAppearance': 'none',
  'inlineSize': '100%',
  'blockSize': '1.2rem',
  'margin': 0,
  'background': 'transparent',
  'cursor': 'pointer',
  '&::-webkit-slider-runnable-track': track,
  '&::-webkit-slider-thumb': { WebkitAppearance: 'none', ...thumb, marginBlockStart: 'calc((0.5rem - 1.2rem) / 2)' },
  '&::-moz-range-track': track,
  '&::-moz-range-thumb': thumb,
  ...focusRing({ color: t.color.brand }),
})

export const hue = cls({
  '&::-webkit-slider-runnable-track': { background: spectrum, border: `1px solid ${t.color.border}` },
  '&::-moz-range-track': { background: spectrum, border: `1px solid ${t.color.border}` },
})
