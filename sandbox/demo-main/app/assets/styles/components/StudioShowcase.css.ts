const { class: style, keyframes, raw, t } = ds

// ─── Entrance for cards: raw @starting-style, no JS racing the paint ──────────
const grow = keyframes({
  from: { transform: 'scaleY(0.04)', opacity: 0.4 },
  to: { transform: 'scaleY(1)', opacity: 1 },
})

export const container = style({
  inlineSize: '100%',
  maxInlineSize: '74rem',
  marginInline: 'auto',
  padding: t.space.lg,
  display: 'grid',
  gap: t.space['2xl'],
  lg: { padding: t.space.xl },
})

// ─── Section scaffolding ──────────────────────────────────────────────────────
export const section = style({ display: 'grid', gap: t.space.lg, scrollMarginBlockStart: t.space.lg })
export const head = style({ display: 'grid', gap: t.space.xs, maxInlineSize: '46rem' })
export const eyebrow = style({
  ...t.text.detail.$dec,
  margin: 0,
  color: t.color.brand,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
})
export const title = style({ ...t.text.heading.$dec, margin: 0, textWrap: 'balance' })
export const lead = style({ ...t.text.lead.$dec, margin: 0, color: t.color.inkMuted, textWrap: 'pretty' })
export const desc = style({ ...t.text.body.$dec, margin: 0, color: t.color.inkMuted, textWrap: 'pretty' })

// ─── Hero ─────────────────────────────────────────────────────────────────────
export const hero = style({ display: 'grid', gap: t.space.md, paddingBlockStart: t.space.md })
export const heroTitle = style({
  ...t.text.display.$dec,
  margin: 0,
  textWrap: 'balance',
  fontSize: 'clamp(2.4rem, 7vw, 3.6rem)',
})
export const heroSerif = style({ fontStyle: 'italic', color: t.color.brand })
export const chips = style({ display: 'flex', flexWrap: 'wrap', gap: t.space.xs })
export const chip = style({
  ...t.text.detail.$dec,
  display: 'inline-flex',
  alignItems: 'center',
  gap: t.space['2xs'],
  paddingInline: t.space.sm,
  paddingBlock: t.space['2xs'],
  border: `1px solid ${t.color.border}`,
  borderRadius: t.radius.pill,
  background: t.color.surface,
  color: t.color.inkMuted,
  textTransform: 'capitalize',
})
export const chipKey = style({ color: t.color.inkFaint })

// ─── Reusable card ──────────────────────────────────────────────────────────
export const card = style({
  padding: t.space.lg,
  border: `1px solid ${t.color.border}`,
  borderRadius: t.radius.lg,
  background: t.color.surface,
  boxShadow: t.shadow.raised,
})

// ─── Palette ──────────────────────────────────────────────────────────────────
export const paletteGrid = style({ display: 'grid', gap: t.space.md, md: { gridTemplateColumns: 'minmax(0, 20rem) minmax(0, 1fr)' } })
export const brandCard = style({
  display: 'grid',
  alignContent: 'space-between',
  gap: t.space.lg,
  minBlockSize: '11rem',
  padding: t.space.lg,
  borderRadius: t.radius.lg,
  background: t.color.brand,
  color: t.color.onBrand,
  boxShadow: t.shadow.raised,
})
export const brandGlyph = style({ ...t.text.display.$dec, margin: 0, fontSize: '3rem', lineHeight: 1 })
export const brandMeta = style({ display: 'grid', gap: t.space['3xs'] })
export const brandRole = style({ ...t.text.label.$dec, margin: 0, opacity: 0.85 })
export const brandCode = style({ fontFamily: t.font.mono, ...t.text.detail.$dec, margin: 0, opacity: 0.85 })

export const ramp = style({ display: 'grid', gap: t.space.md, alignContent: 'start' })
export const rampRow = style({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(4rem, 1fr))', gap: t.space.xs })
export const swatchItem = style({ display: 'grid', gap: t.space['3xs'] })
export const swatch = style({ minBlockSize: '4rem', borderRadius: t.radius.md, border: `1px solid ${t.color.border}` })
export const swatchName = style({ ...t.text.micro.$dec, fontWeight: 600, color: t.color.inkMuted, textTransform: 'capitalize' })

// ─── Typography ─────────────────────────────────────────────────────────────
export const typeList = style({ display: 'grid', gap: t.space.md })
export const typeRow = style({
  display: 'grid',
  gap: t.space['3xs'],
  paddingBlockEnd: t.space.md,
  borderBlockEnd: `1px solid ${t.color.border}`,
})
export const typeMeta = style({ ...t.text.detail.$dec, color: t.color.inkFaint, fontVariantNumeric: 'tabular-nums' })
export const typeSample = style({ margin: 0, color: t.color.ink, overflowWrap: 'anywhere' })
export const samples = {
  display: style({ ...t.text.display.$dec, margin: 0 }),
  heading: style({ ...t.text.heading.$dec, margin: 0 }),
  title: style({ ...t.text.title.$dec, margin: 0 }),
  lead: style({ ...t.text.lead.$dec, margin: 0 }),
  body: style({ ...t.text.body.$dec, margin: 0 }),
  label: style({ ...t.text.label.$dec, margin: 0 }),
  detail: style({ ...t.text.detail.$dec, margin: 0 }),
  micro: style({ ...t.text.micro.$dec, margin: 0 }),
}

export const codeSample = style({
  fontFamily: t.font.mono,
  ...t.text.body.$dec,
  margin: 0,
  padding: t.space.md,
  borderRadius: t.radius.md,
  background: t.color.canvas,
  border: `1px solid ${t.color.border}`,
  color: t.color.inkMuted,
  overflowX: 'auto',
})

// ─── Components gallery ─────────────────────────────────────────────────────
export const gallery = style({ display: 'grid', gap: t.space.md, md: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } })
export const panel = style({
  display: 'grid',
  gap: t.space.md,
  alignContent: 'start',
  padding: t.space.lg,
  border: `1px solid ${t.color.border}`,
  borderRadius: t.radius.lg,
  background: t.color.surface,
  boxShadow: t.shadow.raised,
})
export const panelTitle = style({ ...t.text.label.$dec, margin: 0, color: t.color.inkMuted })
export const row = style({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: t.space.sm })
export const stackY = style({ display: 'grid', gap: t.space.sm })
export const meterRow = style({ display: 'grid', gap: t.space.xs })

// ─── Elevation ─────────────────────────────────────────────────────────────
export const surfaces = style({ display: 'grid', gap: t.space.md, sm: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } })
export const surfaceCard = style({
  display: 'grid',
  gap: t.space['3xs'],
  minBlockSize: '7rem',
  alignContent: 'center',
  justifyItems: 'center',
  padding: t.space.md,
  borderRadius: t.radius.lg,
  border: `1px solid ${t.color.border}`,
  textAlign: 'center',
})
export const surfaceName = style({ ...t.text.label.$dec, margin: 0 })
export const surfaceNote = style({ ...t.text.detail.$dec, margin: 0, color: t.color.inkMuted })

// ─── Container-query specimen ────────────────────────────────────────────────
export const resizer = style({
  containerType: 'inline-size',
  containerName: 'specimen',
  overflow: 'auto',
  resize: 'horizontal',
  inlineSize: 'min(100%, 42rem)',
  minInlineSize: '15rem',
  maxInlineSize: '100%',
  justifySelf: 'start',
  padding: t.space.xs,
  borderRadius: t.radius.lg,
  border: `1px dashed ${t.color.borderStrong}`,
  background: t.color.canvas,
})
export const specimen = style({
  display: 'grid',
  gap: t.space.md,
  padding: t.space.lg,
  borderRadius: t.radius.md,
  background: t.color.surface,
  border: `1px solid ${t.color.border}`,
  specimenWide: { gridTemplateColumns: '8rem minmax(0, 1fr)', alignItems: 'center' },
})
export const specimenArt = style({
  display: 'grid',
  placeItems: 'center',
  minBlockSize: '5rem',
  borderRadius: t.radius.md,
  background: `linear-gradient(140deg, ${t.color.brand}, ${t.color.brandHover})`,
  color: t.color.onBrand,
  fontSize: '1.6rem',
})
export const specimenBody = style({ display: 'grid', gap: t.space.xs })
export const specimenActions = style({
  display: 'grid',
  gap: t.space.xs,
  specimenWide: { gridColumn: '1 / -1', gridAutoFlow: 'column', justifyContent: 'start' },
})
export const specimenHint = style({ ...t.text.detail.$dec, margin: 0, color: t.color.inkFaint })

// ─── Motion / chart replay ───────────────────────────────────────────────────
export const chart = style({
  display: 'grid',
  gridAutoFlow: 'column',
  gridAutoColumns: '1fr',
  alignItems: 'end',
  gap: 'clamp(0.25rem, 1.5cqi, 0.6rem)',
  minBlockSize: '9rem',
  padding: t.space.md,
  borderRadius: t.radius.md,
  background: `linear-gradient(${t.color.border} 1px, transparent 1px) 0 0 / 100% 25%`,
})
export const bar = style({
  alignSelf: 'end',
  minBlockSize: '6%',
  borderRadius: `${t.radius.xs} ${t.radius.xs} 0 0`,
  background: `linear-gradient(to top, ${t.color.brandMuted}, ${t.color.brand})`,
  transformOrigin: 'bottom',
  motionOk: { animation: `${grow} ${t.duration.base} ${t.ease.standard} both` },
})

// ─── Inspector / provenance ──────────────────────────────────────────────────
export const provenance = style({ display: 'grid', gap: t.space.md, md: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } })
export const factCard = style({
  display: 'grid',
  alignContent: 'start',
  gap: t.space.sm,
  padding: t.space.lg,
  borderRadius: t.radius.lg,
  border: `1px solid ${t.color.border}`,
  background: t.color.surface,
  transitionProperty: 'opacity, transform',
  transitionDuration: t.duration.slow,
  transitionTimingFunction: t.ease.standard,
})

/**
 * Raw CSS stays available for syntax that reads better as CSS. `@starting-style`
 *  gives the cards their entry transition with no JavaScript racing the paint —
 *  and the global reduced-motion reset still overrides it.
 */
export const reveal = raw`
  @starting-style {
    & { opacity: 0; transform: translateY(10px); }
  }
`
export const factHead = style({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: t.space.sm })
export const factRole = style({ ...t.text.detail.$dec, color: t.color.brand, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 })
export const factType = style({
  ...t.text.detail.$dec,
  fontFamily: t.font.mono,
  paddingInline: t.space.xs,
  paddingBlock: t.space['3xs'],
  borderRadius: t.radius.pill,
  border: `1px solid ${t.color.border}`,
  color: t.color.inkMuted,
})
export const factPath = style({ ...t.text.label.$dec, margin: 0, overflowWrap: 'anywhere' })
export const factVar = style({
  fontFamily: t.font.mono,
  ...t.text.detail.$dec,
  margin: 0,
  padding: t.space.sm,
  borderRadius: t.radius.sm,
  background: t.color.canvas,
  color: t.color.ink,
  overflowWrap: 'anywhere',
})
export const factNote = style({ ...t.text.detail.$dec, margin: 0, color: t.color.inkMuted })

// Build-time provenance from `ds.explain()` — the same facts a devtools panel
// reads, projected as plain data the browser can render (no runtime introspection).
export const facts = (() => {
  const brand = ds.explain(t.color.brand)
  const canvas = ds.explain(t.color.canvas)
  const shadow = ds.explain(t.shadow.panel)
  return [
    {
      role: 'Live seed',
      path: brand.path.join('.'),
      type: brand.type,
      name: brand.name,
      note: `Hue rides one mutable custom property; ${brand.dependencies.length} dependencies recompute from it.`,
    },
    {
      role: 'Elevation',
      path: canvas.path.join('.'),
      type: canvas.type,
      name: canvas.name,
      note: `A scheme pair from a single token — ${canvas.declarations.length} declarations, no parallel dark palette.`,
    },
    {
      role: 'Sparse axes',
      path: shadow.path.join('.'),
      type: shadow.type,
      name: shadow.name,
      note: `${shadow.branches.length} authored branches across scheme and density; dark resolves to none.`,
    },
  ]
})()
