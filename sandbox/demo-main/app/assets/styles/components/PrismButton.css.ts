// A publishable padding port: a consumer can retune every nested button's inline
// padding through the cascade, zero runtime, via `button.ports.pad.dec(...)`.
const pad = port(t.space.md)

export const button = recipe({
  ports: { pad },
  base: {
    ...t.text.label.$dec,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    minBlockSize: t.size.control,
    paddingInline: pad,
    border: '1px solid transparent',
    borderRadius: t.radius.sm,
    fontFamily: t.font.family,
    fontWeight: 560,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none',
    transitionProperty: 'background-color, border-color, color, box-shadow, transform',
    transitionDuration: t.duration.quick,
    transitionTimingFunction: t.ease.standard,
    ...focusRing({ color: t.color.brand }),
    active: { transform: 'translateY(1px)' },
    disabled: { opacity: 0.5, cursor: 'not-allowed', transform: 'none' },
  },
  variants: {
    intent: {
      solid: {
        background: t.color.brand,
        color: t.color.onBrand,
        boxShadow: t.shadow.raised,
        hover: { background: t.color.brandHover },
      },
      soft: {
        background: t.color.brandSoft,
        color: t.color.brand,
        hover: { background: t.color.brandMuted },
      },
      outline: {
        background: 'transparent',
        color: t.color.ink,
        borderColor: t.color.border,
        hover: { borderColor: t.color.brand, color: t.color.brand },
      },
      ghost: {
        background: 'transparent',
        color: t.color.inkMuted,
        hover: { background: t.color.brandSoft, color: t.color.brand },
      },
    },
    size: {
      sm: { ...t.text.detail.$dec, minBlockSize: t.size.controlSm, ...pad.dec(t.space.sm) },
      md: {},
      lg: { ...t.text.body.$dec, minBlockSize: '3rem', ...pad.dec(t.space.lg) },
    },
  },
  toggles: {
    pill: { borderRadius: t.radius.pill },
    block: { inlineSize: '100%' },
  },
  defaults: { intent: 'solid', size: 'md' },
})
