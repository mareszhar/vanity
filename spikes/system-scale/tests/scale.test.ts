/**
 * DX at realistic scale — every claim is exercised against generated/m.ts,
 * a committed, full-profile system chain (30 groups × 10 fields, 3 variant
 * sets, 8 contributions, 20 helpers). Regenerate with `pnpm generate`.
 *
 *   SC1  a derive callback still sees the WHOLE accumulated tree — first
 *        group, last group, contribution-provided groups, derived groups
 *   SC2  deep reads stay typed: branched fields complete their branches,
 *        both from the open chain and the consolidated surface
 *   SC3  additive-only still errors at the cursor, readably, at scale
 *   SC4  an unmet requirement still collapses to the readable message at scale
 */
import { cursor, defineProject } from '@mszr/selenita'
import { describe, expect, it } from 'vitest'
import '@mszr/selenita/vitest'

const project = defineProject({
  tsconfig: './tsconfig.json',
  aliases: { '#src/*': './src/*', '#gen/*': './generated/*' },
})

describe('sc1 — the accumulated tree is fully visible at the end of a realistic chain', () => {
  it('derive completions include the first group, the last group, plugin groups, and derived groups', () => {
    const { completions } = project.query`
      import { sys } from '#gen/m'
      sys.derive(t => { t.${cursor}; return {} })
    `
    expect(completions).toContainCompletion('g0')
    expect(completions).toContainCompletion('g29')
    expect(completions).toContainCompletion('ctl7')
    expect(completions).toContainCompletion('d20')
  })
})

describe('sc2 — deep reads stay typed at scale', () => {
  it('a branched field completes its branches inside a derive callback', () => {
    const { completions } = project.query`
      import { sys } from '#gen/m'
      sys.derive(t => { t.g29.f2.${cursor}; return {} })
    `
    expect(completions).toContainCompletion('light')
    expect(completions).toContainCompletion('dark')
  })

  it('the consolidated surface reads the same way', () => {
    const { completions } = project.query`
      import { locked } from '#gen/m'
      locked.t.g29.f2.${cursor}
    `
    expect(completions).toContainCompletion('light')
    expect(completions).toContainCompletion('dark')
  })
})

describe('sc3 — additive-only holds at scale', () => {
  it('re-adding an existing field errors at the cursor, naming it', () => {
    const { errors } = project.check`
      import { sys } from '#gen/m'
      sys.group('g0', { f0: 'again' })
    `
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.map(e => e.message).join('\n')).toContain('already exists')
    expect(errors.map(e => e.message).join('\n')).toContain('g0.f0')
  })
})

describe('sc4 — requirement failures stay readable at scale', () => {
  it('an unmet requirement names the missing group', () => {
    const { errors } = project.check`
      import { contribution } from '#src/system'
      import { sys } from '#gen/m'
      const needs = contribution({ id: 'x', requires: { nosuch: ['f0'] }, provides: { extra: { e: 1 } } })
      sys.use(needs)
    `
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.map(e => e.message).join('\n')).toContain(`group 'nosuch' is not present`)
  })
})
