export const button = recipe({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: t.space.xs,
    padding: `${t.space.sm} ${t.space.md}`,
    border: 'none',
    borderRadius: t.radius.sm,
    fontSize: '1rem',
    lineHeight: 1.5,
    cursor: 'pointer',
    motionOk: { transition: `background ${t.duration.fast} ease, border-color ${t.duration.fast} ease` },
    focusVisible: { outline: `2px solid ${t.color.brand}`, outlineOffset: '2px' },
  },
  variants: {
    intent: {
      brand: {
        background: t.color.brand,
        color: t.color.onBrand,
        hover: { background: t.color.brandHover },
      },
      ghost: {
        background: 'transparent',
        color: t.color.ink,
        border: `1px solid ${t.color.border}`,
        hover: { background: t.color.brandSoft, borderColor: t.color.brand },
      },
    },
    size: {
      sm: { fontSize: '0.875rem', lineHeight: 1.45, padding: `${t.space.xs} ${t.space.sm}` },
      md: {},
    },
  },
  toggles: {
    pill: { borderRadius: t.radius.pill },
  },
  defaults: { intent: 'brand', size: 'md' },
})
