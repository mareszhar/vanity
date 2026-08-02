const { mix, recipe, t } = ds

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
      positive: { background: mix(t.color.canvas, t.color.positive, 0.16), color: t.color.positive },
      warning: { background: mix(t.color.canvas, t.color.warning, 0.16), color: t.color.warning },
      danger: { background: mix(t.color.canvas, t.color.danger, 0.16), color: t.color.danger },
    },
  },
  defaults: { tone: 'brand' },
})
