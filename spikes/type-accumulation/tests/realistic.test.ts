/**
 * Closer-to-real shapes, still fully agnostic:
 *   R1  BRANCHED fields — a field value carrying per-variant sub-values (the
 *       shape a "token with modes/axes" takes). Accumulation must see through it.
 *   R2  CONTRIBUTION CHAINS — one contribution PROVIDES what a later one
 *       REQUIRES, so ordering/interaction resolves structurally.
 *   R3  contribution ordering is enforced: requiring-before-providing fails,
 *       and the failure is readable.
 */
import { cursor, defineProject } from '@mszr/selenita'
import { describe, expect, it } from 'vitest'
import '@mszr/selenita/vitest'

const project = defineProject({ tsconfig: './tsconfig.json', aliases: { '#src/*': './src/*' } })

describe('r1 — branched fields accumulate and stay inspectable', () => {
  it('a field whose value is a per-branch record keeps both the field and its branches typed', () => {
    const { completions } = project.query`
      import { create } from '#src/builder'
      const built = create()
        .add('color', { canvas: { light: 'white', dark: '#111' }, ink: 'black' })
        .consolidate()
      built.read('color').canvas.${cursor}
    `
    expect(completions).toContainCompletion('light')
    expect(completions).toContainCompletion('dark')
  })

  it('the field itself is still visible alongside plain fields', () => {
    const { completions } = project.query`
      import { create } from '#src/builder'
      create()
        .add('color', { canvas: { light: 'white', dark: '#111' }, brand: 'red' })
        .derive(shape => { shape.color.${cursor}; return {} })
    `
    expect(completions).toContainCompletion('canvas')
    expect(completions).toContainCompletion('brand')
  })
})

describe('r2 — contribution chains: A provides what B requires', () => {
  it('b is satisfied because A ran first', () => {
    const { errors } = project.check`
      import { create, contribution } from '#src/builder'
      const a = contribution({ id: 'a', requires: {}, provides: { scheme: { light: '&', dark: '&$d' } } })
      const b = contribution({ id: 'b', requires: { scheme: ['light', 'dark'] }, provides: { motion: { on: '&' } } })
      create().use(a).use(b) // A provides scheme, B requires it — ordered, clean
    `
    expect(errors.length).toBe(0)
  })

  it('b contributions are visible downstream of A', () => {
    const { completions } = project.query`
      import { create, contribution } from '#src/builder'
      const a = contribution({ id: 'a', requires: {}, provides: { scheme: { light: '&' } } })
      const b = contribution({ id: 'b', requires: { scheme: ['light'] }, provides: { motion: { on: '&' } } })
      create().use(a).use(b).derive(shape => { shape.${cursor}; return {} })
    `
    expect(completions).toContainCompletion('scheme')
    expect(completions).toContainCompletion('motion')
  })
})

describe('r4 — additive-only: growth never redefines', () => {
  it('adding a NEW field to an existing group is fine', () => {
    const { errors } = project.check`
      import { create } from '#src/builder'
      create().add('color', { brand: 'red' }).add('color', { ink: 'black' })
    `
    expect(errors.length).toBe(0)
  })

  it('adding a brand new group is fine', () => {
    const { errors } = project.check`
      import { create } from '#src/builder'
      create().add('color', { brand: 'red' }).add('space', { md: 'x' })
    `
    expect(errors.length).toBe(0)
  })

  it('re-adding an EXISTING field errors AT THE CURSOR, naming it', () => {
    const { errors } = project.check`
      import { create } from '#src/builder'
      create().add('color', { brand: 'red' }).add('color', { brand: 'blue' })
    `
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.map(e => e.message).join('\n')).toContain('already exists')
    expect(errors.map(e => e.message).join('\n')).toContain('color.brand')
  })
})

describe('r3 — wrong order fails readably', () => {
  it('requiring before providing names the missing group', () => {
    const { errors } = project.check`
      import { create, contribution } from '#src/builder'
      const a = contribution({ id: 'a', requires: {}, provides: { scheme: { light: '&' } } })
      const b = contribution({ id: 'b', requires: { scheme: ['light'] }, provides: {} })
      create().use(b).use(a) // B requires scheme before A provides it
    `
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.map(e => e.message).join('\n')).toContain('group \'scheme\' is not present')
  })
})
