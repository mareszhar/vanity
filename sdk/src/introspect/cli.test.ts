import type { VanityManifest } from './manifest'
import { createSystem } from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { explainManifestPath, inspectManifest } from '../cli'
import { buildManifest } from './manifest'
import { collectInspection } from './records'

function manifest(): VanityManifest {
  const ds = createSystem().addTokens({ color: { brand: 'red' } }).consolidate({ prefix: 'cli' })
  const { records, result } = collectInspection(() => emit(() =>
    ds.class({ color: ds.t.color.brand }, 'button')))
  return buildManifest(records, result.css)
}

describe('the vanity CLI projections', () => {
  it('inspects and explains from Manifest v4 without evaluating authoring code', () => {
    const built = manifest()
    expect(inspectManifest(built)).toContain('1 tokens')
    expect(explainManifestPath(built, 'color.brand')).toContain('token token:color.brand')
    expect(JSON.parse(explainManifestPath(built, 'tokens.color.brand', true))).toMatchObject({
      id: 'token:color.brand',
      kind: 'token',
    })
  })
})
