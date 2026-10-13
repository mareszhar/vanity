import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { expect, it } from 'vitest'

const project = vanityProject()
it('shows authored usage guidance in the native token hover', () => {
  const result = project.query`
    import { createSystem } from '@mszr/vanity'
    const ds = createSystem().addTokens(h => ({ edge: h.tdef.color({ val: 'red', usage: { for: ['quiet divider'], avoid: 'text and icons' } }) })).consolidate()
    void ds.t.${cursor('edge')}edge
  `
  expect(result.at('edge').hover?.displayText).toContain('quiet divider')
  expect(result.at('edge').hover?.displayText).toContain('text and icons')
})
