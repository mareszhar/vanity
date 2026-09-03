/**
 * The editor-DX evidence dimension: completions and diagnostics land on the intended key
 * with the intended message, and hovers stay readable public types
 * ([patterns.md §10]) — locked with selenita against the real language
 * service.
 */

import type { Diagnostic } from '@mszr/selenita'
import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

/** Compiler internals a diagnostic or hover must never leak. */
const LEAK = /ColorValue\b|ContrastValue\b|TokenNode\b|RuleWalker\b|VanityArm\b/

function expectNoLeak(messages: Array<Diagnostic | string>): void {
  for (const message of messages)
    expect(typeof message === 'string' ? message : message.message).not.toMatch(LEAK)
}

const defineSystem = `
import { createSystem, media, oklch } from '@mszr/vanity'

const open = createSystem()
  .addConditions({
    open: '&[data-state="open"]',
    md: media('(min-width: 768px)'),
  })
const withTokens = open.addTokens({
  color: { brand: open.tdef({ val: oklch(0.58, 0.2, 285), mutable: true }) },
  space: { sm: '8px', md: '16px' },
})
const { t, class: style, keyframes, rules } = withTokens.consolidate()

void t; void style; void keyframes; void rules
`

describe('the authoring shape', () => {
  it('the spec-shaped style raises no diagnostics', () => {
    const { errors } = project.check`${defineSystem}
      export const card = style({
        padding: t.space.md,
        background: t.color.brand,
        hover: { background: 'rebeccapurple' },
        md: { padding: t.space.sm },
        color: { base: 'black', hover: 'white' },
        '&:has(> img:first-child)': { paddingTop: 0 },
        '@supports (view-transition-name: none)': { viewTransitionName: 'card' },
      })
    `
    expect(errors).toBeClean()
  })

  it('rule keys autocomplete with conditions beside properties', () => {
    const result = project.query`${defineSystem}
      void style({ ${cursor} })
    `
    expect(result.completions).toContainCompletions(['open', 'md', 'hover', 'motionOk', 'dark', 'padding'])
  })

  it('property-first maps autocomplete base and the conditions', () => {
    const result = project.query`${defineSystem}
      void style({ color: { ${cursor} } })
    `
    expect(result.completions).toContainCompletions(['base', 'open', 'md', 'hover'])
  })
})

describe('errors at the cursor', () => {
  it('a typo\'d property is one diagnostic at the key, with the fix', () => {
    const { errors } = project.check`${defineSystem}
      void style({ paddin: '8px' })
    `
    expect(errors).toHaveError(/paddin/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('an unknown condition as a bare key dies at the key', () => {
    const { errors } = project.check`${defineSystem}
      void style({ hovr: { padding: 8 } })
    `
    expect(errors).toHaveError(/hovr/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('an unknown condition inside a property-first map dies at the key', () => {
    const { errors } = project.check`${defineSystem}
      void style({ color: { hovr: 'red' } })
    `
    expect(errors).toHaveError(/hovr/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('an undeclared layer dies at the key with the declared order in reach', () => {
    const { errors } = project.check`${defineSystem}
      void style.layer('overides')({})
    `
    expect(errors).toHaveError(/overides|overrides/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('a condition inside a keyframe step is refused at the key', () => {
    const { errors } = project.check`${defineSystem}
      void keyframes({ from: { hover: { opacity: 0 } } })
    `
    expect(errors).toHaveError(/hover/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('token paths inside rules stay cursor-checked', () => {
    const { errors } = project.check`${defineSystem}
      void style({ gap: t.space.mid })
    `
    expect(errors).toHaveError(/'mid' does not exist/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })
})

describe('hovers', () => {
  it('the system destructure reads as the bound surface, not an internals wall', () => {
    const result = project.query`${defineSystem}
      void st${cursor}yle
    `
    expect(result.hover).toContain('VanityClassEmitter')
    expectNoLeak([result.hover ?? ''])
  })
})
