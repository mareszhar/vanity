const { class: style, t } = ds

export const group = style({
  display: 'inline-grid',
  gridAutoFlow: 'column',
  gridAutoColumns: '1fr',
  gap: t.space['3xs'],
  padding: t.space['3xs'],
  inlineSize: '100%',
  border: `1px solid ${t.color.border}`,
  borderRadius: t.radius.sm,
  background: t.color.canvas,
})

export const option = style({
  ...t.text.detail.$dec,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: t.space['2xs'],
  minBlockSize: t.size.controlSm,
  paddingInline: t.space.xs,
  border: 0,
  borderRadius: `calc(${t.radius.sm} - 0.2rem)`,
  background: 'transparent',
  color: t.color.inkMuted,
  fontWeight: 550,
  textTransform: 'capitalize',
  cursor: 'pointer',
  transitionProperty: 'background-color, color, box-shadow',
  transitionDuration: t.duration.quick,
  transitionTimingFunction: t.ease.standard,
  hover: { color: t.color.ink },
  selected: { background: t.color.brand, color: t.color.onBrand, boxShadow: t.shadow.panel },
  // selected: { background: t.color.surface, color: t.color.ink, boxShadow: t.shadow.raised },
  ...focusRing({ color: t.color.brand }),
})
