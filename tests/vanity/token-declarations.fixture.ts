// Run with the SDK's TypeScript loader, independently of Playwright's test-file
// transformer. The fixture supplies emitted CSS only; expectations belong to
// the browser spec and come from platform semantics.
import process from 'node:process'
import { colorSchemes, createSystem, data, rawValue } from '../../sdk/src/index'
import { captureEmission } from '../../sdk/src/testing'

const open = createSystem().addAxis('scheme', colorSchemes())
const ds = open.addTokens(open.defineTokens()
  .add('accent', open.oklch(0.6, 0.15, 265))
  .add(m => ({
    accentSoft: open.oklch.from(m.accent, { l: 0.95 }),
    surface: open.tdef.color({ axes: { scheme: {
      light: open.oklch.from(m.accent, { l: 0.9 }),
      dark: open.oklch.from(m.accent, { l: 0.3 }),
    } } }),
  }))
  .add(m => ({ accentWash: open.alpha(m.accentSoft, 0.5) })))
  .consolidate({ prefix: 'probe' })
const live = captureEmission(() => {
  const substitution = { accent: open.oklch(0.6, 0.2, 25) }
  return {
    propagated: ds.class({ ...ds.tdec.propagated(substitution) }, 'propagated'),
    literal: ds.class({ ...ds.tdec(substitution) }, 'literal'),
  }
})

const numericOpen = createSystem()
const numericDs = numericOpen.addTokens(numericOpen.defineTokens().add('seed', 2)
  .add('live', rawValue.number(String.raw`calc(v\61 r(--café-seed) * 2)`))
  .add(m => ({ next: numericOpen.calc(m.live).add(1) })))
  .consolidate({ prefix: 'café' })
const numeric = captureEmission(() => ({
  propagated: numericDs.class({ ...numericDs.tdec.propagated({ seed: 3 }) }),
  literal: numericDs.class({ ...numericDs.tdec({ seed: 3 }) }),
}))

const foldedOpen = createSystem()
  .addAxis('density', { modes: { cozy: data('density', 'cozy'), compact: data('density', 'compact') }, default: 'cozy' })
  .addAxis('tone', { modes: { warm: data('tone', 'warm'), cool: data('tone', 'cool') }, default: 'warm' })
const foldedDs = foldedOpen.addTokens(foldedOpen.defineTokens()
  .add('seed', 0.9)
  .add('a', { val: 0, axes: { density: { compact: 1 } } })
  .add('b', { val: 0, axes: { tone: { cool: 1 } } })
  .add(m => ({ bg: foldedOpen.oklch(foldedOpen.calc(m.seed).multiply(m.a).multiply(m.b), 0, 0) }))
  .add(m => ({ on: foldedOpen.legibleOn(m.bg, { contrast: 0 }) })))
  .consolidate({ prefix: 'intersection' })
const folded = captureEmission(() => foldedDs.class({ ...foldedDs.tdec.propagated({ seed: 0 }) }))

export interface TokenDeclarationFixtures {
  live: typeof live
  numeric: typeof numeric
  folded: typeof folded
}
process.stdout.write(JSON.stringify({ live, numeric, folded }))
