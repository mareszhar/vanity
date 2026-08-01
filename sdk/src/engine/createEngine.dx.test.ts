import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('canonical engine editor DX', () => {
  it('makes the engine and one-import system surfaces discoverable', () => {
    const result = project.query`
      import { createEngine } from '@test/legacy'
      const de = createEngine({ length: { unitless: 'rem' } })
      const tokens = de.defineTokens({ color: { brand: de.oklch(0.58, 0.2, 285) } })
      const ds = de.createSystem({ tokens })
      void de.${cursor('engine')}
      void tokens.${cursor('module')}
      void ds.${cursor('system')}
    `

    expect(result.at('engine').completions).toContainCompletions([
      'defineTokens',
      'createSystem',
      'use',
      'extend',
      'length',
      'oklch',
      'serialize',
    ])
    expect(result.at('module').completions).toContainCompletions(['compose', 'derive'])
    expect(result.at('module').completions).not.toContainCompletion('build')
    expect(result.at('system').completions).toContainCompletions([
      't',
      'css',
      'recipe',
      'length',
      'oklch',
      'serialize',
      'conditions',
      'layers',
    ])
    expect(result.at('system').completions).not.toContainCompletion('defineTokens')
    expect(result.at('system').completions).not.toContainCompletion('createSystem')
  })

  it('keeps staged module inference exact through the engine', () => {
    const { completions } = project.query`
      import { createEngine } from '@test/legacy'
      const de = createEngine()
      const colors = de.defineTokens({ color: { brand: de.oklch(0.58, 0.2, 285) } })
      const metrics = de.defineTokens({ space: { sm: de.length.rem(0.5) } })
      void de.defineTokens().compose(colors).compose(metrics).derive((tokens) => {
        tokens.${cursor}
        return { ready: 'yes' }
      })
    `

    expect(completions).toContainCompletions(['color', 'space'])
  })

  it('keeps the daily engine and system hovers named and implementation-free', () => {
    const result = project.query`
      import { createEngine } from '@test/legacy'
      const de = ${cursor('createEngine')}createEngine()
      const ds = de.createSystem({ tokens: { color: { brand: de.oklch(0.58, 0.2, 285) } } })
      void de.${cursor('oklch')}oklch
      void ds.${cursor('css')}css
      void ds.${cursor('recipe')}recipe
    `

    expect(result.at('createEngine').hover).toContain('createEngine')
    expect(result.at('oklch').hover).toContain('VanityAuthoredColor')
    expect(result.at('oklch').hover).toContain('readonly from')
    expect(result.at('css').hover).toContain('VanityCssFunction')
    expect(result.at('recipe').hover).toContain('VanityRecipeFactory')

    for (const label of ['createEngine', 'oklch', 'css', 'recipe'] as const) {
      const hover = result.at(label).hover ?? ''
      expect(hover).not.toMatch(/RuntimeTokenBuilder|EngineKernel|VanityExpressionNode|\bany\b/)
      expect(hover.length).toBeLessThan(2400)
    }
  })

  it('reports reserved extension names at the returned key', () => {
    const { errors } = project.check`
      import { createEngine } from '@test/legacy'
      createEngine().extend(() => ({ class: {} }))
    `

    expect(errors).toHaveErrorCount(1)
    expect(errors).toHaveError(/class|never/)
  })
})
