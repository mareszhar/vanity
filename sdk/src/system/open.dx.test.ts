import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('open and locked system editor DX', () => {
  it('shows only accumulation on the open system and styling on the locked system', () => {
    const result = project.query`
      import { createSystem } from '@mszr/vanity'
      const open = createSystem().addTokens({ color: { brand: '#635bff' } })
      const ds = open.consolidate()
      void open.${cursor('open')}
      void ds.${cursor('locked')}
    `

    expect(result.at('open').completions).toContainCompletions([
      'addTokens',
      'addToken',
      'defineTokens',
      'tdef',
      'augmentTokens',
      'overwriteTokens',
      'addAxis',
      'defineAxes',
      'addConditions',
      'defineConditions',
      'addConsts',
      'defineConsts',
      'addUtils',
      'defineUtils',
      'addRules',
      'defineRules',
      'addConstructors',
      'defineConstructors',
      'addPlugin',
      'expectTokens',
      'consolidate',
    ])
    expect(result.at('open').completions).not.toContainCompletions([
      'css',
      'recipe',
      'runtime',
    ])
    expect(result.at('locked').completions).toContainCompletions([
      't',
      'class',
      'rules',
      'raw',
      'fragment',
      'tdec',
      'atoms',
      'recipe',
      'runtime',
      'snapshotFrom',
      'introspect',
    ])
    expect(result.at('locked').completions).not.toContainCompletions([
      'addTokens',
      'overwriteTokens',
      'consolidate',
      'createSystem',
    ])
  })

  it('shows logical handles before consolidation and resolved handles after it', () => {
    const result = project.query`
      import { createSystem } from '@mszr/vanity'
      const open = createSystem().addTokens({ color: { brand: '#635bff' } })
      const ds = open.consolidate({ prefix: 'app' })
      void open.t.color.brand.${cursor('logical')}
      void ds.t.color.brand.${cursor('resolved')}
    `

    expect(result.at('logical').completions).toContainCompletions([
      '$path',
      '$type',
      '$reference',
      '$phase',
      '$var',
    ])
    expect(result.at('logical').completions).not.toContainCompletion('$name')
    expect(result.at('resolved').completions).toContainCompletions([
      '$name',
      '$var',
      '$path',
      '$type',
    ])
    expect(result.at('resolved').completions).not.toContainCompletion('$phase')
  })

  it('keeps duplicate additions local to the duplicate key', () => {
    const { errors } = project.check`
      import { createSystem } from '@mszr/vanity'
      createSystem()
        .addConsts({ density: 1 })
        .addConsts({ density: 2 })
    `

    expect(errors).toHaveErrorCount(1)
    expect(errors).toHaveError(/density|never/)
  })
})
