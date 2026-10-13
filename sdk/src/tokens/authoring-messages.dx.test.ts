import { vanityProject } from '@test'
import { expect, it } from 'vitest'

const project = vanityProject()

it('explains a typed definition with only a value at the cursor', () => {
  const { errors } = project.check`
    import { createSystem } from '@mszr/vanity'
    const open = createSystem()
    open.tdef.color({ val: open.oklch(0.2, 0.02, 265) })
  `
  expect(errors).toHaveErrorCount(1)
  expect(errors).toHaveError(/A token with only a value doesn\\?'t need.*tdef.*write the value directly/)
})

it('rejects an unnecessary named-add wrapper at the cursor with the raw-config repair', () => {
  const { errors } = project.check`
    import { createSystem } from '@mszr/vanity'
    const open = createSystem()
    open.defineTokens().add('hue', open.tdef({ val: 265, mutable: true }))
  `
  expect(errors).toHaveErrorCount(1)
  expect(errors).toHaveError(/add\(name, config\) accepts the raw config.*remove the unnecessary tdef\(\) wrapper/)
})
