import {
  axis,
  createSystem,
  defaultMode,
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
  it.each(['my layer', '1st', 'a.b', 'a,b', 'a; @layer b', 'a; .x{}', 'a;@layer parent.a.suffix;.vanity-sentinel{color:red}/*', 'a/**/', 'a/*', 'a;/*', 'a\\', 'a\0b', '\uFFFD', String.raw`a\2e b`, String.raw`\0`, ''])('rejects invalid system layer name %j at consolidation', (name) => {
    const fromOptions = captureDiagnostic(() => createSystem().consolidate({ prefix: 'app', layerOrder: [name] }))
    expect(fromOptions).toMatchObject({ code: 'VANITY_SYSTEM_INVALID_LAYER' })
    expect(fromOptions.message).toContain(name)

    const fromPolicy = captureDiagnostic(() => createSystem()
      .addPolicies({ layerOrder: [name] })
      .consolidate({ prefix: 'app' }))
    expect(fromPolicy).toMatchObject({ code: 'VANITY_SYSTEM_INVALID_LAYER' })
    expect(fromPolicy.message).toContain(name)
  })

  it.each(['my layer', '1st', 'a.b', 'a,b', 'a; @layer b', 'a; .x{}', 'a;@layer parent.a.suffix;.vanity-sentinel{color:red}/*', 'a/**/', 'a/*', 'a;/*', 'a\\', 'a\0b', '\uFFFD', String.raw`a\2e b`, String.raw`\0`, ''])('rejects invalid axis layer segment %j', (name) => {
    const diagnostic = captureDiagnostic(() => createSystem()
      .addAxis(name, ['on'])
      .consolidate({ prefix: 'app' }))
    expect(diagnostic).toMatchObject({ code: 'VANITY_SYSTEM_INVALID_AXIS' })
    expect(diagnostic.message).toContain(name)

    const fromDefinition = captureDiagnostic(() => createSystem()
      .addAxes({ [name]: axis({ modes: { on: defaultMode() } }) })
      .consolidate({ prefix: 'app' }))
    expect(fromDefinition).toMatchObject({ code: 'VANITY_SYSTEM_INVALID_AXIS' })
    expect(fromDefinition.message).toContain(name)
  })

  it.each(['unset', '-x', '--x', 'é', String.raw`\61 pp`, String.raw`\31 st`, String.raw`\61 `, String.raw`a\20 b`, String.raw`a\;b`])('accepts CSS identifier %j as a layer or axis', (name) => {
    expect(() => createSystem().consolidate({ prefix: 'app', layerOrder: [name] })).not.toThrow()
    expect(() => createSystem().addPolicies({ layerOrder: [name] }).consolidate({ prefix: 'app' })).not.toThrow()
    expect(() => createSystem().addAxis(name, ['on']).consolidate({ prefix: 'app' })).not.toThrow()
  })

  it.each([{ names: ['recipes', 'recipes'] }, { names: ['recipes', String.raw`\72 ecipes`] }])('rejects repeated CSS identities %j at every system boundary', ({ names }) => {
    expect(captureDiagnostic(() => createSystem().consolidate({ layerOrder: names }))).toMatchObject({ code: 'VANITY_SYSTEM_INVALID_LAYER', path: ['consolidate.layerOrder', '1'] })
    expect(captureDiagnostic(() => createSystem().addPolicies({ layerOrder: names }).consolidate())).toMatchObject({ code: 'VANITY_SYSTEM_INVALID_LAYER', path: ['policies.layerOrder', '1'] })
    expect(captureDiagnostic(() => (createSystem().addAxis(names[0]!, ['on']) as any).addAxis(names[1]!, ['on']))).toMatchObject({ code: 'VANITY_SYSTEM_INVALID_AXIS' })
    expect(captureDiagnostic(() => createSystem().addAxes({ [names[0]!]: axis({ modes: { on: defaultMode() } }) }).addAxes({ [names[1]!]: axis({ modes: { on: defaultMode() } }) }))).toMatchObject({ code: 'VANITY_SYSTEM_INVALID_AXIS' })
  })

  it.each([{ names: ['colorScheme', 'color-scheme'] }, { names: ['aA', 'a-a'] }, { names: ['aA', String.raw`\61-a`] }])('rejects axis names sharing a generated attribute %j', ({ names }) => {
    const first = createSystem().addAxis(names[0]!, ['on'])
    const direct = captureDiagnostic(() => (first as any).addAxis(names[1]!, ['on']))
    expect(direct).toMatchObject({ code: 'VANITY_SYSTEM_INVALID_AXIS', path: ['axes', names[1]!] })
    expect(direct.message).toContain(names[0]!)
    expect(direct.message).toContain(names[1]!)
    expect(() => first.consolidate()).not.toThrow()
    expect(captureDiagnostic(() => createSystem().addAxes({ [names[0]!]: axis({ modes: { on: defaultMode() } }), [names[1]!]: axis({ modes: { on: defaultMode() } }) }))).toMatchObject({ code: 'VANITY_SYSTEM_INVALID_AXIS', path: ['axes', names[1]!] })
  })

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
