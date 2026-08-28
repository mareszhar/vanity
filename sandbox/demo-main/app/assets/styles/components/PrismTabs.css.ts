const { length } = ds

const controlRadius = calc(t.radius.sm).subtract(length.rem(0.2))

export const tabs = anatomy({
  parts: ['root', 'list', 'trigger', 'panel'],
  base: {
    root: { display: 'grid', gap: t.space.md },
    list: {
      display: 'inline-flex',
      gap: t.space['3xs'],
      padding: t.space['3xs'],
      borderRadius: t.radius.sm,
      background: t.color.canvas,
      border: `1px solid ${t.color.border}`,
      inlineSize: 'fit-content',
      maxInlineSize: '100%',
      overflowX: 'auto',
    },
    trigger: {
      ...t.text.label.$dec,
      display: 'inline-flex',
      alignItems: 'center',
      minBlockSize: t.size.controlSm,
      paddingInline: t.space.sm,
      border: 0,
      borderRadius: controlRadius,
      background: 'transparent',
      color: t.color.inkMuted,
      whiteSpace: 'nowrap',
      cursor: 'pointer',
      transitionProperty: 'background-color, color',
      transitionDuration: t.duration.quick,
      transitionTimingFunction: t.ease.standard,
      hover: { color: t.color.ink },
      selected: { background: t.color.brand, color: t.color.onBrand, boxShadow: t.shadow.raised },
      ...focusRing({ color: t.color.brand }),
    },
    panel: { ...t.text.body.$dec, color: t.color.inkMuted, margin: 0, textWrap: 'pretty' },
  },
})
