import { color, duration, font, lightDark, radius, space } from '@prism/domain'
// The raw vanilla-extract lane — the substrate vanity builds on, driven
// directly. Typed properties and real evaluation, but tokens are a string
// bag (no derivations — hover/soft values are hand-mirrored from
// @prism/domain), variants come from a separate recipes package, and the
// reactive value needs createVar + assignInlineVars plumbing per component.
import { createGlobalTheme, createVar, style } from '@vanilla-extract/css'
import { recipe } from '@vanilla-extract/recipes'

export const vars = createGlobalTheme(':root', {
  color: {
    brand: color.brand,
    brandHover: lightDark(color.brandHover),
    brandSoft: lightDark(color.brandSoft),
    onBrand: color.onBrand,
    surface: lightDark(color.surface),
    border: lightDark(color.border),
    inkMuted: lightDark(color.inkMuted),
    ink: lightDark(color.ink),
  },
  space,
  radius,
  duration,
  font,
})

export const button = recipe({
  base: {
    'display': 'inline-flex',
    'alignItems': 'center',
    'gap': vars.space.xs,
    'border': 'none',
    'borderRadius': vars.radius.sm,
    'fontFamily': vars.font.sans,
    'cursor': 'pointer',
    'transition': `background ${vars.duration.fast} ease, border-color ${vars.duration.fast} ease`,
    ':focus-visible': { outline: `2px solid ${vars.color.brand}`, outlineOffset: '2px' },
  },
  variants: {
    intent: {
      brand: {
        'background': vars.color.brand,
        'color': vars.color.onBrand,
        ':hover': { background: vars.color.brandHover },
      },
      ghost: {
        'background': 'transparent',
        'color': vars.color.ink,
        'border': `1px solid ${vars.color.border}`,
        ':hover': { background: vars.color.brandSoft, borderColor: vars.color.brand },
      },
    },
    size: {
      sm: { fontSize: '0.875rem', lineHeight: 1.45, padding: `${vars.space.xs} ${vars.space.sm}` },
      md: { fontSize: '1rem', lineHeight: 1.5, padding: `${vars.space.sm} ${vars.space.md}` },
    },
    pill: {
      true: { borderRadius: vars.radius.pill },
    },
  },
  defaultVariants: { intent: 'brand', size: 'md' },
})

export const card = style({
  display: 'grid',
  gap: vars.space.sm,
  justifyItems: 'start',
  padding: vars.space.md,
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
})

export const cardTitle = style({
  margin: 0,
  fontSize: '1.125rem',
  lineHeight: 1.3,
  fontWeight: 600,
  color: vars.color.ink,
})

export const cardBody = style({
  margin: 0,
  fontSize: '0.875rem',
  color: vars.color.inkMuted,
})

/** The reactive crossing: a var declared here, assigned inline in the component. */
export const fillFraction = createVar()

export const track = style({
  background: vars.color.surface,
  blockSize: vars.space.sm,
  borderRadius: vars.radius.pill,
  overflow: 'hidden',
})

export const fill = style({
  inlineSize: `calc(${fillFraction} * 100%)`,
  blockSize: '100%',
  background: vars.color.brand,
  transition: 'inline-size 200ms ease',
})
