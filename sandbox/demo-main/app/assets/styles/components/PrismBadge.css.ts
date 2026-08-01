const { recipe, t } = ds

// Soft status planes: the canvas lifted toward the status color, so they stay
// opaque in both schemes. Mixing toward `transparent` would make the badge a
// window onto whatever sits behind it.
const soft = (color: string) => `color-mix(in oklab, ${t.color.canvas} 84%, ${color})`

export const badge = recipe({
  base: {
    ...t.text.micro.$dec,
    display: 'inline-flex',
    alignItems: 'center',
    gap: t.space['3xs'],
    paddingInline: t.space.xs,
    paddingBlock: t.space['3xs'],
    borderRadius: t.radius.pill,
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  variants: {
    tone: {
      brand: { background: t.color.brandSoft, color: t.color.brand },
      neutral: { background: t.color.surface, color: t.color.inkMuted, boxShadow: `inset 0 0 0 1px ${t.color.border}` },
      positive: { background: soft(`${t.color.positive}`), color: t.color.positive },
      warning: { background: soft(`${t.color.warning}`), color: t.color.warning },
      danger: { background: soft(`${t.color.danger}`), color: t.color.danger },
    },
  },
  defaults: { tone: 'brand' },
})
