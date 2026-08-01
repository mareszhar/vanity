const { class: style, t } = ds

export const root = style({
  display: 'grid',
  gap: t.space.sm,
  justifyItems: 'start',
  padding: t.space.md,
  background: t.color.surface,
  border: `1px solid ${t.color.border}`,
  borderRadius: t.radius.md,
})

export const title = style({
  margin: 0,
  fontSize: '1.125rem',
  lineHeight: 1.3,
  fontWeight: 600,
  color: t.color.ink,
})

export const body = style({
  margin: 0,
  fontSize: '0.875rem',
  color: t.color.inkMuted,
})
