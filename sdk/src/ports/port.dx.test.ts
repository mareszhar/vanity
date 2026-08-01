/**
 * The editor-DX plane: port completions and diagnostics land on the intended
 * key, and hovers stay readable public types ([patterns.md §10]) — locked
 * with selenita against the real language service.
 */

import type { Diagnostic } from '@mszr/selenita'
import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

/** Compiler internals a diagnostic or hover must never leak. */
const LEAK = /ColorValue\b|ContrastValue\b|createPortHandle\b|VanityPortMeta\b/

function expectNoLeak(messages: Array<Diagnostic | string>): void {
  for (const message of messages)
    expect(typeof message === 'string' ? message : message.message).not.toMatch(LEAK)
}

const defineSystem = `
import { createEngine } from '@test/legacy'

const de = createEngine()
const { t, css, port } = de.createSystem({
  tokens: {
    color: {
      brand: de.token({ val: de.oklch(0.58, 0.2, 285), mutable: true }),
      ink: de.oklch(0.2, 0, 0),
    },
    space: { sm: '8px', md: '16px' },
  },
})

void t; void css; void port
`

describe('the authoring shape', () => {
  it('a port declaration with interpolation raises no diagnostics', () => {
    const { errors } = project.check`${defineSystem}
      export const fraction = port(0)
      export const fill = css({
        inlineSize: \`calc(\${fraction} * 100%)\`,
        background: t.color.brand,
      })
    `
    expect(errors).toBeClean()
  })

  it('a color port defaulted to a token raises no diagnostics', () => {
    const { errors } = project.check`${defineSystem}
      export const tint = port(t.color.brand)
      export const fill = css({ background: tint })
    `
    expect(errors).toBeClean()
  })

  it('value-token and color-expression defaults raise no diagnostics', () => {
    const { errors } = project.check`${defineSystem}
      export const gap = port(t.space.sm)
      export const glow = port(de.oklch(0.7, 0.1, 200))
      void gap.dec(t.space.md); void glow.dec('rebeccapurple')
    `
    expect(errors).toBeClean()
  })

  it('port methods autocomplete — declaration fragment, validator binding, metadata, and intent', () => {
    const result = project.query`${defineSystem}
      export const fraction = port(0)
      void fraction.${cursor}
    `
    expect(result.completions).toContainCompletions(['dec', 'bind', 'describe', 'deprecated', 'toString', 'var', 'name', 'type', 'kind'])
  })
})

describe('errors at the cursor', () => {
  it('a number port rejects a string in set()', () => {
    const { errors } = project.check`${defineSystem}
      export const fraction = port(0)
      void fraction.dec('hello')
    `
    expect(errors).toHaveError(/not assignable to parameter of type 'VanityPortDecValue<"number">'/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('a string port rejects a number in set()', () => {
    const { errors } = project.check`${defineSystem}
      export const width = port('4px')
      void width.dec(8)
    `
    expect(errors).toHaveError(/not assignable to parameter of type 'VanityPortDecValue<"length">'/)
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('port rejects a non-port-input default', () => {
    const { errors } = project.check`${defineSystem}
      void port(true)
    `
    expect(errors).toHaveErrorCount(1)
    expectNoLeak(errors)
  })

  it('a color port set accepts a string cleanly', () => {
    const { errors } = project.check`${defineSystem}
      export const tint = port(t.color.brand)
      void tint.dec('oklch(0.45 0.15 250)')
    `
    expect(errors).toBeClean()
  })

  it('a color port set accepts a token reference cleanly', () => {
    const { errors } = project.check`${defineSystem}
      export const tint = port(t.color.brand)
      void tint.dec(t.color.ink)
    `
    expect(errors).toBeClean()
  })
})

describe('hovers', () => {
  it('a port hover reads as the public type, not internals', () => {
    const result = project.query`${defineSystem}
      export const fract${cursor}ion = port(0)
    `
    expect(result.hover).toContain('VanityPort')
    expectNoLeak([result.hover ?? ''])
  })
})
