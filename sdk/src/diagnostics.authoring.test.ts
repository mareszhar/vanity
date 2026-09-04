import {
  createSystem,
  defineCssSupportTarget,
  importDesignTokens,
  integer,
  VANITY_DTCG_EXTENSION,
  VanityError,
} from '@mszr/vanity'
import { describe, expect, it } from 'vitest'

function captureDiagnostic(run: () => unknown): VanityError['diagnostics'][number] {
  try {
    run()
  }
  catch (error) {
    expect(error).toBeInstanceOf(VanityError)
    return (error as VanityError).diagnostics[0]!
  }
  throw new Error('expected authoring operation to fail')
}

describe('authoring diagnostics', () => {
  it('gives system and policy failures a stable repair contract', () => {
    const collision = captureDiagnostic(() => (createSystem() as any).addUtils({ class: () => true }))
    expect(collision).toMatchObject({
      code: 'VANITY_SYSTEM_COLLISION',
      path: ['class'],
      fix: { message: expect.stringContaining('choose a name') },
    })

    const policy = captureDiagnostic(() => (createSystem() as any).addPolicies({
      tokens: { emit: 'yes' },
    }))
    expect(policy).toMatchObject({
      code: 'VANITY_POLICY_INVALID',
      path: ['tokens', 'emit'],
      fix: { message: expect.stringContaining('true or false') },
    })
  })

  it('names token and axis authoring failures at the authored path', () => {
    const token = captureDiagnostic(() => (createSystem() as any).addToken('$color', 'red'))
    expect(token).toMatchObject({
      code: 'VANITY_TOKENS_INVALID_NAME',
      path: ['tokens', '$color'],
      fix: { message: expect.stringContaining('does not begin with') },
    })

    const axis = captureDiagnostic(() => (createSystem() as any).addAxis('scheme', { modes: {} }))
    expect(axis).toMatchObject({
      code: 'VANITY_SYSTEM_INVALID_AXIS',
      path: ['axis', 'modes'],
      fix: { message: expect.stringContaining('at least one') },
    })
  })

  it('keeps value and DTCG failures structured through their public entry points', () => {
    const value = captureDiagnostic(() => integer(1.5))
    expect(value).toMatchObject({
      code: 'VANITY_CSS_INVALID_VALUE',
      path: ['integer'],
      fix: { message: expect.stringContaining('whole number') },
    })

    const document = {
      $extensions: {
        [VANITY_DTCG_EXTENSION]: {
          version: 999,
          mode: 'authored',
          tokens: {},
        },
      },
    }
    const dtcg = captureDiagnostic(() => importDesignTokens(document as any))
    expect(dtcg).toMatchObject({
      code: 'VANITY_DTCG_UNSUPPORTED',
      path: ['$extensions', VANITY_DTCG_EXTENSION],
      fix: { message: expect.stringContaining('version') },
    })

    const support = captureDiagnostic(() => defineCssSupportTarget({ id: '', features: [] }))
    expect(support).toMatchObject({
      code: 'VANITY_CSS_INVALID_VALUE',
      path: ['support', 'id'],
      fix: { message: expect.stringContaining('non-empty') },
    })
  })
})
