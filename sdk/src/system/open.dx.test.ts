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
    expect(result.at('open').completions.indexOf('addTokens')).toBeLessThan(
      result.at('open').completions.indexOf('consolidate'),
    )
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
    expect(result.at('locked').completions.every(name => !/^\$|^VANITY_|^__vanity/i.test(name))).toBe(true)
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

  it('keeps the public system hovers readable', () => {
    const result = project.query`
      import { createSystem } from '@mszr/vanity'
      const open = createSystem().addTokens({ color: { brand: '#635bff' } })
      const ds = open.consolidate({ prefix: 'app' })
      const rt = ds.runtime()
      void ${cursor('open')}open
      void ${cursor('ds')}ds
      void ds.t.color.${cursor('token')}brand
      void ds.${cursor('class')}class
      void ds.${cursor('recipe')}recipe
      void ${cursor('rt')}rt
      void ds.${cursor('runtimeFactory')}runtime
    `

    const budgets = {
      open: 800,
      ds: 1200,
      token: 400,
      class: 400,
      recipe: 600,
      rt: 800,
    } as const
    for (const [name, budget] of Object.entries(budgets)) {
      const hover = result.at(name).hover ?? ''
      expect(hover).toBeTruthy()
      expect(hover.length).toBeLessThan(budget)
      expect(hover).not.toContain('import("./')
      expect(hover).not.toContain('Omit<')
      expect(hover).not.toContain('VANITY_OPEN_SYSTEM_TYPE')
    }
    expect(result.at('runtimeFactory').hover).toContain('Create a live runtime controller')
  })

  it('surfaces public documentation at method, option, token, and runtime cursors', () => {
    const result = project.query`
      import { createSystem } from '@mszr/vanity'
      const open = createSystem().addTokens({ color: { brand: '#635bff' } })
      const ds = open.consolidate({ prefix: 'app' })
      const rt = ds.runtime()
      void open.${cursor('consolidate')}consolidate
      void open.${cursor('tdef')}tdef
      void ds.t.color.${cursor('token')}brand
      void ds.t.color.brand.${cursor('var')}$var
      void ds.${cursor('audit')}audit
      void ${cursor('runtime')}rt
      void createSystem({ tokens: { reference${cursor('reference')}: 'var', emit${cursor('emit')}: true } })
      void open.consolidate({ prefix${cursor('prefix')}: 'app' })
    `

    expect(result.at('consolidate').hover).toContain('Finalize the accumulated shape')
    expect(result.at('tdef').hover).toContain('Define advanced token traits')
    expect(result.at('var').hover).toContain('Return the token\'s `var()` reference')
    expect(result.at('audit').hover).toContain('Run every audit this system can evaluate')
    expect(result.at('reference').hover).toContain('Choose whether a token resolves')
    expect(result.at('emit').hover).toContain('Choose whether tokens emit CSS')
    expect(result.at('prefix').hover).toContain('Prefix custom-property names')
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
