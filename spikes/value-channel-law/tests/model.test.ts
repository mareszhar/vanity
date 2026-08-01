import { cursor, defineProject } from '@mszr/selenita'
import { describe, expect, it } from 'vitest'
import { channel, reference, serialize } from '../src/model'
import '@mszr/selenita/vitest'

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
    const { completions } = project.query`
      import { channel } from '#src/model'
      channel().subtract(0.5).${cursor}
    `
    expect(completions).toContainCompletion('add')
    expect(completions).toContainCompletion('subtract')
    expect(completions).toContainCompletion('multiply')
    expect(completions).toContainCompletion('divide')
  })

  it('underlines the incompatible operand rather than the whole chain', () => {
    const { errors } = project.check`
      import { channel } from '#src/model'
      channel().subtract({ nope: true }).multiply(-1000)
    `
    expect(errors).toHaveLength(1)
    expect(errors[0]!.line).toBe(3)
    expect(errors[0]!.column).toBeGreaterThan(20)
  })
})
