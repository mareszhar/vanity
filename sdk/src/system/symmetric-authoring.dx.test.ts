import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('symmetric authoring editor DX', () => {
  it('keeps module callbacks scoped and system callbacks fully accumulated', () => {
    const result = project.query`
      import { createSystem, defineConsts } from '@mszr/vanity'
      const constants = defineConsts({ seed: 2 }).add(module => {
        void module.${cursor('module')}seed
        return { doubled: module.seed * 2 }
      })
      createSystem().addConsts(constants).addConsts(ds => {
        void ds.consts.${cursor('system')}doubled
        return { tripled: ds.consts.doubled * 1.5 }
      })
    `

    expect(result.at('module').completions).toContainCompletion('seed')
    expect(result.at('system').completions).toContainCompletions(['seed', 'doubled'])
    expect(result.errors).toHaveErrorCount(0)
  })

  it('surfaces the complete verb families without guessing', () => {
    const result = project.query`
      import { createSystem } from '@mszr/vanity'
      void createSystem().${cursor('system')}addTokens
    `

    expect(result.at('system').completions).toContainCompletions([
      'addToken',
      'addTokens',
      'augmentToken',
      'augmentTokens',
      'overwriteToken',
      'overwriteTokens',
      'addAxis',
      'addAxes',
      'augmentAxis',
      'augmentAxes',
      'overwriteAxis',
      'overwriteAxes',
      'addCondition',
      'addConditions',
      'overwriteCondition',
      'overwriteConditions',
      'addConst',
      'addConsts',
      'overwriteConst',
      'overwriteConsts',
      'addUtil',
      'addUtils',
      'addRule',
      'addRules',
      'overwriteRule',
      'overwriteRules',
      'addConstructor',
      'addConstructors',
      'expectToken',
      'expectTokens',
      'expectCondition',
      'expectConditions',
      'expectConst',
      'expectConsts',
      'expectUtil',
      'expectUtils',
      'expectRule',
      'expectRules',
      'expectConstructor',
      'expectConstructors',
    ])
  })

  it('underlines one duplicate singular name instead of the whole chain', () => {
    const { errors } = project.check`
      import { createSystem } from '@mszr/vanity'
      createSystem()
        .addConst('density', 1)
        .addConst('density', 2)
    `

    expect(errors).toHaveErrorCount(1)
    expect(errors).toHaveError(/density|never/)
  })
})
