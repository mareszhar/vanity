/**
 * The editor-DX plane: variant authoring is where beginners live
 * ([spec-recipes.md §6]) — diagnostics land on the offending key with the
 * valid set in reach, hovers collapse to readable public types, and the
 * call-site law holds at the cursor.
 */

import type { Diagnostic } from '@mszr/selenita'
import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

/** Compiler internals a diagnostic or hover must never leak. */
const LEAK = /ColorValue\b|ContrastValue\b|TokenNode\b|RuleWalker\b|VanityArm\b|VanityRecipeRuntime\b/

function expectNoLeak(messages: Array<Diagnostic | string>): void {
  for (const message of messages)
    expect(typeof message === 'string' ? message : message.message).not.toMatch(LEAK)
}

const defineSystem = `
import { createEngine } from '@test/legacy'

const de = createEngine()
const { t, css, recipe, anatomy, port } = de.createSystem({
  tokens: {
    color: { brand: de.token({ val: de.oklch(0.58, 0.2, 285), mutable: true }) },
    space: { xs: '4px', sm: '8px', md: '16px' },
  },
  conditions: {
    open: '&[data-state="open"]',
    md: de.media('(min-width: 768px)'),
  },
})

void t; void css; void recipe; void anatomy; void port
`

const defineButton = `${defineSystem}
export const button = recipe({
  base: { display: 'inline-flex', gap: t.space.xs },
  variants: {
    intent: {
      brand: { background: t.color.brand },
      ghost: { background: 'transparent' },
    },
    size: {
      sm: { paddingInline: t.space.sm },
      md: { paddingInline: t.space.md },
    },
  },
  toggles: { pill: { borderRadius: '999px' } },
  defaults: { intent: 'brand', size: 'md' },
})
`

describe('the authoring shape', () => {
  it('the spec recipe raises no diagnostics', () => {
    const { errors } = project.check`${defineButton}`
    expect(errors).toBeClean()
  })

  it('variant arms autocomplete like any rule: conditions beside properties', () => {
    const result = project.query`${defineSystem}
      void recipe({ variants: { intent: { brand: { ${cursor} } } } })
    `
    expect(result.completions).toContainCompletions(['open', 'md', 'hover', 'padding'])
  })

  it('call sites autocomplete the declared values', () => {
    const result = project.query`${defineButton}
      void button({ intent: ${cursor} })
    `
    expect(result.completions).toContainCompletions(['brand', 'ghost'])
  })
})

describe('errors at the cursor', () => {
  it('a misspelled variant value at a call site names the valid set', () => {
    const { errors } = project.check`${defineButton}
      void button({ intent: 'brnd' })
    `
    expect(errors).toHaveError(/'"brnd"' is not assignable to type '"brand" \| "ghost" \| undefined'/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('a typo\'d prop key dies at the key — strict literals', () => {
    const { errors } = project.check`${defineButton}
      void button({ intnet: 'brand' })
    `
    expect(errors).toHaveError(/intnet/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('a typo\'d property inside a variant arm dies at that key', () => {
    const { errors } = project.check`${defineSystem}
      void recipe({ variants: { intent: { brand: { paddin: 8 } } } })
    `
    expect(errors).toHaveError(/paddin/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('an impossible compound combination dies at the offending key', () => {
    const { errors } = project.check`${defineSystem}
      void recipe({
        variants: { size: { sm: {}, md: {} } },
        compound: [{ when: { size: 'xl' }, style: {} }],
      })
    `
    expect(errors).toHaveError(/xl/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('a misspelled part dies at the key', () => {
    const { errors } = project.check`${defineSystem}
      void anatomy({
        parts: ['root', 'content'],
        base: { contnet: { padding: 8 } },
      })
    `
    expect(errors).toHaveError(/contnet/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('a part-scoped condition over an undeclared part dies at the key', () => {
    const { errors } = project.check`${defineSystem}
      void anatomy({
        parts: ['root', 'content'],
        base: { content: { 'roto:open': { padding: 0 } } },
      })
    `
    expect(errors).toHaveError(/roto:open/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })
})

describe('hovers', () => {
  it('vanityProps collapses to the plain optional object — no internals wall', () => {
    const result = project.query`${defineButton}
      import type { VanityProps } from '@test/legacy'
      type ButtonPro${cursor}ps = VanityProps<typeof button>
    `
    expect(result.hover).toMatch(/intent\?: "brand" \| "ghost"/)
    expect(result.hover).toMatch(/size\?: "(?:sm" \| "md|md" \| "sm)"/)
    expect(result.hover).toMatch(/pill\?: boolean/)
    expectNoLeak([result.hover ?? ''])
  })
})
