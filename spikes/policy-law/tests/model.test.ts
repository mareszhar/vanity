import { cursor, defineProject } from '@mszr/selenita'
import { describe, expect, it } from 'vitest'
import { violates } from '../src/model'
import '@mszr/selenita/vitest'

const project = defineProject({
  tsconfig: './tsconfig.json',
  aliases: { '#src/*': './src/*' },
})

describe('bound constructor diagnostics', () => {
  it('keeps portable authoring valid and rejects only the bound call', () => {
    const result = project.query`
      import { oklch, type BoundConstructors } from '#src/model'
      const ds = null as unknown as BoundConstructors<{
        level: 'forbid',
        use: 'oklchx',
      }>
      oklch(0.6, 0.2, 280)
      ds.${cursor('bound')}oklch(0.6, 0.2, 280)
    `

    expect(result.errors).toHaveErrorCount(1)
    expect(result.errors).toHaveError(/forbidden|oklchx|argument/)
    expect(result.at('bound').completions).toContainCompletion('oklch')
  })
})

describe('enforcement reach', () => {
  it('forgives prior registrations prospectively and scans all retroactively', () => {
    expect(violates({
      valueRevision: 1,
      policyRevision: 2,
      restriction: { level: 'forbid', enforce: 'prospective' },
    })).toBe(false)
    expect(violates({
      valueRevision: 3,
      policyRevision: 2,
      restriction: { level: 'forbid', enforce: 'prospective' },
    })).toBe(true)
    expect(violates({
      valueRevision: 1,
      policyRevision: 2,
      restriction: { level: 'forbid', enforce: 'retroactive' },
    })).toBe(true)
  })
})
