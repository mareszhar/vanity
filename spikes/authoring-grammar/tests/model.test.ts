import { cursor, defineProject } from '@mszr/selenita'
import { describe, expect, it } from 'vitest'
import '@mszr/selenita/vitest'

const project = defineProject({
  tsconfig: './tsconfig.json',
  aliases: { '#src/*': './src/*' },
})

describe('symmetric authoring grammar', () => {
  it('keeps callback context exact and duplicate diagnostics local', () => {
    const result = project.query`
      import { define, system } from '#src/model'
      const module = define()
        .add('seed', 1)
        .add(current => {
          void current.${cursor('context')}seed
          return { doubled: current.seed * 2 }
        })
      const ds = system().add([module]).add(current => ({
        tripled: current.shape.doubled * 1.5,
      }))
      module.add('seed', 2)
      void ds
    `

    expect(result.at('context').completions).toContainCompletion('seed')
    expect(result.errors).toHaveErrorCount(1)
    expect(result.errors).toHaveError(/seed|never/)
  })

  it('keeps a 500-leaf module behind one system mount', () => {
    const leaves = Array.from({ length: 500 }, (_, index) => `k${index}: ${index}`).join(',')
    const source = `
      import { define, system } from '#src/model'
      const module = define().add({ ${leaves} })
      const ds = system().add(module)
      void ds.shape.k499
    `
    const template = Object.assign([source], { raw: [source] }) as unknown as TemplateStringsArray
    const result = project.check(template)
    expect(result.errors).toHaveErrorCount(0)
  })
})
