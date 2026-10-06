import { cursor, snippet } from '@mszr/selenita'
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

    expect(result.at('open')).toSuggest([
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
    ], { requireDocumentation: true })
    expect(result.at('open')).not.toSuggest([
      'css',
      'recipe',
      'runtime',
    ])
    expect(result.at('open').completionNames.indexOf('addTokens')).toBeLessThan(
      result.at('open').completionNames.indexOf('consolidate'),
    )
    expect(result.at('locked')).toSuggest([
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
    expect(result.at('locked')).not.toSuggest([
      'addTokens',
      'overwriteTokens',
      'consolidate',
      'createSystem',
    ])
    expect(result.at('locked').completionNames.every(name => !/^\$|^VANITY_|^__vanity/i.test(name))).toBe(true)
  })

  it('shows logical handles before consolidation and resolved handles after it', () => {
    const result = project.query`
      import { createSystem } from '@mszr/vanity'
      const open = createSystem().addTokens({ color: { brand: '#635bff' } })
      const ds = open.consolidate({ prefix: 'app' })
      void open.t.color.brand.${cursor('logical')}
      void ds.t.color.brand.${cursor('resolved')}
    `

    expect(result.at('logical')).toSuggest([
      '$path',
      '$type',
      '$reference',
      '$phase',
      '$var',
    ])
    expect(result.at('logical')).not.toSuggest('$name')
    expect(result.at('resolved')).toSuggest([
      '$name',
      '$var',
      '$path',
      '$type',
    ])
    expect(result.at('resolved')).not.toSuggest('$phase')
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
      const hover = result.at(name as keyof typeof budgets).hover?.text ?? ''
      expect(hover).toBeTruthy()
      expect(hover.length).toBeLessThan(budget)
      expect(hover).not.toContain('import("./')
      expect(hover).not.toContain('Omit<')
      expect(hover).not.toContain('VANITY_OPEN_SYSTEM_TYPE')
    }
    expect(result.at('runtimeFactory').hover?.documentation).toContain('Create a live runtime controller')
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

    expect(result.at('consolidate').hover?.documentation).toContain('Finalize the accumulated shape')
    expect(result.at('tdef').hover?.documentation).toContain('Define advanced token traits')
    expect(result.at('var').hover?.documentation).toContain('Return the token\'s `var()` reference')
    expect(result.at('audit').hover?.documentation).toContain('Run every audit this system can evaluate')
    expect(result.at('reference').hover?.documentation).toContain('Choose whether a token resolves')
    expect(result.at('emit').hover?.documentation).toContain('Choose whether tokens emit CSS')
    expect(result.at('prefix').hover?.documentation).toContain('Prefix custom-property names')
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

it('completes ordinary direct and detached derivation siblings and branches', () => {
  const sibling = snippet`void siblings.${cursor('sibling')};`
  const result = project.query`
    import { createSystem, defineAxes, thisMode } from '@mszr/vanity'
    const open = createSystem().addAxis('pick', {
      modes: { base: '&', later: thisMode },
      derive: { later: siblings => { ${sibling.scope('direct')} return 'red' as const } },
    })
    const module = defineAxes({ pick: {
      modes: { base: '&', later: thisMode },
      derive: { later: siblings => { ${sibling.scope('detached')} return 42 as const } },
    } })
    const detached = createSystem().addAxes(module)
    const ds = open.addTokens({ ink: open.tdef({ val: 'black', axes: { pick: {} } }) }).consolidate()
    const staged = detached.addTokens({ ink: detached.tdef({ val: 1, axes: { pick: {} } }) }).consolidate()
    void ds.t.ink.$axes.pick.${cursor('branches')}
    void ds.t.ink.$axes.pick.later.${cursor('directValue')}$val
    void staged.t.ink.$axes.pick.later.${cursor('detachedValue')}$val
  `
  const siblings = result.atEach('sibling', ['direct', 'detached'])
  expect(siblings).toHaveCompletionParity()
  for (const member of Object.values(siblings)) {
    expect(member).toSuggest(['base', 'later'])
    expect(member).not.toSuggest('wrong')
  }
  expect(result.at('branches')).toSuggest('later')
  expect(result.at('directValue').hover?.displayText).toContain('"red"')
  expect(result.at('detachedValue').hover?.displayText).toContain('42')
  const { errors } = project.check`
    import { createSystem, defineAxes, thisMode } from '@mszr/vanity'
    createSystem().addAxis('pick', { modes: { base: '&', later: thisMode }, derive: { later: siblings => siblings.base } })
    defineAxes().add('pick', { modes: { base: '&', later: thisMode }, derive: { later: siblings => siblings.base } })
  `
  expect(errors).toHaveErrorCount(0)
})

it('diagnoses missing promised axis capabilities at the configuration', () => {
  for (const field of ['control', 'derive'] as const) {
    const { errors } = project.check`
      import type { VanityOpenAxisConfig } from '@mszr/vanity'
      import { thisMode } from '@mszr/vanity'
      const modes = { base: '&', later: thisMode } as const
      const configuration: VanityOpenAxisConfig<typeof modes, ${field === 'control' ? 'import(\'@mszr/vanity\').VanityAxisControl<keyof typeof modes>' : 'undefined, { later: () => 42 }'}> = { modes }
      void configuration
    `
    expect(errors).toHaveErrorCount(1)
    expect(errors).toHaveError(2322, `Property '${field}' is missing`, { on: 'configuration' })
  }
  const result = project.query`
    import type { VanityOpenAxisConfig } from '@mszr/vanity'
    import { createSystem, thisMode } from '@mszr/vanity'
    const modes = { base: '&', later: thisMode } as const
    type Configuration = ${cursor('configuration')}VanityOpenAxisConfig<typeof modes>
    const known = createSystem().addAxis('pick', { modes, derive: { later: () => 42 as const } })
    const uncertain = createSystem().addAxis('pick', { modes, derive: { later: (): 42 | undefined => undefined } })
    const ds = known.addTokens({ ink: known.tdef({ val: 1, axes: { pick: {} } }) }).consolidate()
    const maybe = uncertain.addTokens({ ink: uncertain.tdef({ val: 1, axes: { pick: {} } }) }).consolidate()
    void ds.t.ink.$axes.pick.${cursor('known')}
    void maybe.t.ink.$axes.pick.${cursor('uncertain')}
  `
  expect(result.at('known')).toSuggest('later')
  expect(result.at('uncertain')).not.toSuggest('later')
  const hover = result.at('configuration').hover?.text ?? ''
  expect(hover).toContain('Known control and derivation types require their fields')
  expect(hover.length).toBeLessThan(2000)
})
