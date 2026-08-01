/**
 * The editor-DX plane: completions and diagnostics land on the intended key
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
import { createEngine } from '@test/legacy'

const de = createEngine()
const { t, css, keyframes, globalCss } = de.createSystem({
  tokens: {
    color: { brand: de.token({ val: de.oklch(0.58, 0.2, 285), mutable: true }) },
    space: { sm: '8px', md: '16px' },
  },
  conditions: {
    open: '&[data-state="open"]',
    md: de.media('(min-width: 768px)'),
  },
})

void t; void css; void keyframes; void globalCss
`

describe('the authoring shape', () => {
  it('the spec-shaped style raises no diagnostics', () => {
    const { errors } = project.check`${defineSystem}
      export const card = css({
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
      void css({ ${cursor} })
    `
    expect(result.completions).toContainCompletions(['open', 'md', 'hover', 'motionOk', 'dark', 'padding'])
  })

  it('property-first maps autocomplete base and the conditions', () => {
    const result = project.query`${defineSystem}
      void css({ color: { ${cursor} } })
    `
    expect(result.completions).toContainCompletions(['base', 'open', 'md', 'hover'])
  })
})

describe('errors at the cursor', () => {
  it('a typo\'d property is one diagnostic at the key, with the fix', () => {
    const { errors } = project.check`${defineSystem}
      void css({ paddin: '8px' })
    `
    expect(errors).toHaveError(/paddin/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('an unknown condition as a bare key dies at the key', () => {
    const { errors } = project.check`${defineSystem}
      void css({ hovr: { padding: 8 } })
    `
    expect(errors).toHaveError(/hovr/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('an unknown condition inside a property-first map dies at the key', () => {
    const { errors } = project.check`${defineSystem}
      void css({ color: { hovr: 'red' } })
    `
    expect(errors).toHaveError(/hovr/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('an undeclared layer dies at the key with the declared order in reach', () => {
    const { errors } = project.check`${defineSystem}
      void css.layer('overides')({})
    `
    expect(errors).toHaveError(/overides|overrides/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('a condition name colliding with a CSS property is refused at the definition key', () => {
    const { errors } = project.check`
      import { createEngine } from '@test/legacy'
      void createEngine().createSystem({ tokens: {}, conditions: { color: '&[data-color]' } })
    `
    // The type plane refuses at the key; the build diagnostic carries the sentence.
    expect(errors).toHaveError(/never/)
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
      void css({ gap: t.space.mid })
    `
    expect(errors).toHaveError(/'mid' does not exist/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })
})

describe('hovers', () => {
  it('the system destructure reads as the bound surface, not an internals wall', () => {
    const result = project.query`${defineSystem}
      void cs${cursor}s
    `
    expect(result.hover).toContain('VanityCssFunction')
    expectNoLeak([result.hover ?? ''])
  })
})
