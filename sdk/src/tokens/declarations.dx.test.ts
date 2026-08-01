import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('token $dec editor DX', () => {
  it('completes the universal property and shows an exact readable bundle', () => {
    const result = project.query`
      import { createSystem } from '@mszr/vanity'
      const ds = createSystem()
        .addConditions({ hover: '&:hover' })
        .addTokens({
          text: { body: { fontSize: '1rem', lineHeight: 1.5, hover: { color: 'purple' } } },
        })
        .consolidate()
      void ds.t.text.body.${cursor('member')}
      void ds.t.text.body.${cursor('bundle')}$dec
    `

    expect(result.at('member').completions).toContainCompletion('$dec')
    expect(result.at('bundle').hover).toContain('fontSize')
    expect(result.at('bundle').hover).toContain('lineHeight')
    expect(result.at('bundle').hover).toContain('hover')
    expect(result.at('bundle').hover).not.toContain('VanityExpressionNode')
  })

  it('keeps namespace misuse local and names both repairs', () => {
    const { errors } = project.check`
      import { createSystem } from '@mszr/vanity'
      const ds = createSystem()
        .addTokens({ text: { body: { fontSize: '1rem' }, heading: { fontSize: '2rem' } } })
        .consolidate()
      ds.class({ ...ds.t.text.$dec })
    `

    expect(errors).toHaveErrorCount(1)
    expect(errors).toHaveError(/\$dec cannot apply.*body|body.*navigate to a leaf bundle/)
  })
})
