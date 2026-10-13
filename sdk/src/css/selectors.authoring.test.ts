import { createSystem } from '@mszr/vanity'
import { describe, expect, it } from 'vitest'
import { collectInspection } from '../introspect/records'
import { captureEmission } from '../testing'

describe('unanchored pseudo selector keys', () => {
  const run = (level?: 'off' | 'warn' | 'error') => {
    const ds = createSystem().consolidate({ ...(level ? { audit: { unanchoredSelectors: level } } : {}) })
    return collectInspection(() => captureEmission(() => ds.class({ '::before': { content: '"x"' }, ':hover': { color: 'red' }, '&::before': { color: 'blue' } }, 'pseudo')))
  }
  it('warns for pseudo-element and pseudo-class descendants with the anchored spelling, never for an anchored key', () => {
    const capture = run()
    expect(capture.warnings).toHaveLength(2)
    expect(capture.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'VANITY_SELECTOR_UNANCHORED', severity: 'warning', message: expect.stringContaining('::before'), fix: expect.stringContaining('&::before') }),
      expect.objectContaining({ code: 'VANITY_SELECTOR_UNANCHORED', severity: 'warning', message: expect.stringContaining(':hover'), fix: expect.stringContaining('&:hover') }),
    ]))
    expect(capture.result.css).toContain(' ::before')
    expect(capture.result.css).toContain(' :hover')
  })
  it('honors off without changing CSS and allows explicit promotion to an error', () => {
    expect(run('off').warnings).toEqual([])
    expect(run('off').result.css).toBe(run().result.css)
    expect(() => run('error')).toThrow(/VANITY_SELECTOR_UNANCHORED/)
  })
})
