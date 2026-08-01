import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  VANITY_CSS_NAMED_API_ROWS,
  VANITY_CSS_PARITY_LEDGER,
} from '@mszr/vanity/capabilities'
import { describe, expect, it } from 'vitest'

const requiredFields = [
  'id',
  'api',
  'cssConcept',
  'spec',
  'typedGrammar',
  'rawGrammar',
  'inputs',
  'cssWideKeywords',
  'outputType',
  'invalid',
  'semantics',
  'lowering',
  'fallback',
  'escape',
  'fixtures',
  'coverage',
] as const

describe('machine-readable CSS parity ledger', () => {
  it('covers every registered CSS-owned public spelling', () => {
    for (const [api, id] of Object.entries(VANITY_CSS_NAMED_API_ROWS)) {
      expect(VANITY_CSS_PARITY_LEDGER, `${api} → ${id}`).toHaveProperty(id)
    }
  })

  it('pins specs and carries every maintenance field', () => {
    const ids = new Set<string>()

    for (const [key, entry] of Object.entries(VANITY_CSS_PARITY_LEDGER)) {
      expect(entry.id).toBe(key)
      expect(ids.has(entry.id), entry.id).toBe(false)
      ids.add(entry.id)

      for (const field of requiredFields)
        expect(entry, `${entry.id}.${field}`).toHaveProperty(field)

      expect(entry.spec.url).toMatch(/^https:\/\/(?:www\.w3\.org\/TR\/\d{4}\/|drafts\.csswg\.org\/)/)
      expect(entry.spec.revision).not.toMatch(/latest|current/i)
      expect(entry.spec.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.rawGrammar.length).toBeGreaterThan(0)
      expect(entry.escape.length).toBeGreaterThan(0)

      if (entry.coverage !== 'planned' && entry.coverage !== 'raw-only')
        expect(entry.fixtures.length, `${entry.id} typed coverage needs fixtures`).toBeGreaterThan(0)

      for (const fixture of entry.fixtures)
        expect(existsSync(resolve(process.cwd(), fixture)), `${entry.id} fixture ${fixture}`).toBe(true)
    }
  })

  it('locks the systematic CSS-wide keyword row', () => {
    expect(VANITY_CSS_PARITY_LEDGER['CSS-V015'].cssWideKeywords).toEqual([
      'initial',
      'inherit',
      'unset',
      'revert',
      'revert-layer',
    ])
  })
})
