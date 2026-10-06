import { cursor, defineProject, mark } from '@mszr/selenita/vitest'
import { describe, expect, it } from 'vitest'
import { channel, reference, serialize } from '../src/model'

const project = defineProject({
  tsconfig: './tsconfig.json',
  aliases: { '#src/*': './src/*' },
})

describe('semantic reference rebinding', () => {
  it('keeps the logical path and resolves only at the host boundary', () => {
    const pivot = reference('control.pivot')
    const expression = channel().subtract(pivot).multiply(-1000)

    expect(serialize(expression, path => `--final-${path.replaceAll('.', '-')}`))
      .toBe('calc(((channel - var(--final-control-pivot)) * -1000))')
    expect(serialize(expression, path => `--other-${path.replaceAll('.', '-')}`))
      .toBe('calc(((channel - var(--other-control-pivot)) * -1000))')
  })
})

describe('relative-channel DX', () => {
  it('keeps the full operation family after every link', () => {
    const observation = project.query`
      import { channel } from '#src/model'
      channel().subtract(0.5).${cursor}
    `
    expect(observation).toSuggest('add')
    expect(observation).toSuggest('subtract')
    expect(observation).toSuggest('multiply')
    expect(observation).toSuggest('divide')
  })

  it('underlines the incompatible operand rather than the whole chain', () => {
    const observation = project.check`
      import { channel } from '#src/model'
      channel().subtract({ ${mark('operand')`nope`}: true }).multiply(-1000)
    `
    expect(observation).toHaveErrorCount(1)
    expect(observation).toHaveError(2353, /nope/, { on: observation.rangeOf('operand') })
  })
})
