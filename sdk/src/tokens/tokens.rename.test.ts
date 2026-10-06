/** Native editor rename and repair actions for the shipped TypeScript plugin. */
import { mark, snippet } from '@mszr/selenita'
import { vanityProject, vanityTypeScriptPlugin } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject({
  plugins: [vanityTypeScriptPlugin],
  aliases: { '@mszr/vanity/vanity-style-auto-imports': './node_modules/@mszr/vanity/vanity-style-auto-imports.d.ts' },
})
const unrelated = `
  import { createSystem, defineTokens } from '@mszr/vanity'
  const tokens = defineTokens().add('brand', 'blue')
  const other = createSystem().addTokens(tokens).consolidate()
  void other.t.brand
  const { brand: otherAccent } = other.t
  void otherAccent
  const spelling = 'brand'
  void spelling
`

const native = vanityProject()

describe('token rename-symbol', () => {
  it('leaves ordinary bindings on TypeScript’s native rename path', () => {
    const files = { 'ordinary.ts': snippet`const ${mark('binding')`brand`} = 1; void brand` }
    const baseline = native.query(files).at('binding').rename
    const rename = project.query(files).at('binding').rename
    expect(baseline.canRename).toBe(true)
    expect(baseline.locations).toHaveLength(2)
    expect(rename).toEqual(baseline)
  })
  it('connects modular definitions, derived references and consumers without renaming unrelated tokens', () => {
    const result = project.query({
      'colors.ts': snippet`
        import { defineTokens, oklch } from '@mszr/vanity'
        export const colors = defineTokens({ color: { ${mark('definition')`brand`}: oklch(0.58, 0.2, 285) } })
          .add(m => ({ color: { brandSoft: m.color.${mark('reference')`brand`} } }))
      `,
      'metrics.ts': `
        import { defineTokens, length } from '@mszr/vanity'
        export const metrics = defineTokens({ space: { sm: length.rem(0.5) } })
      `,
      'design.ts': `
        import { createSystem } from '@mszr/vanity'
        import { colors } from './colors'
        import { metrics } from './metrics'
        export const ds = createSystem().addTokens(colors).addTokens(metrics).consolidate()
      `,
      'consumer.ts': snippet`
        import { ds } from './design'
        void ds.t.color.${mark('consumer')`brand`}
      `,
      'other.ts': unrelated,
    })
    expect(result).toBeClean()
    const expected = (['definition', 'reference', 'consumer'] as const).map(name => result.rangeOf(name))
    for (const name of ['definition', 'consumer'] as const) {
      const rename = result.at(name).rename
      expect(rename.canRename).toBe(true)
      expect(rename.locations).toHaveLength(expected.length)
      expect(rename.locations).toEqual(expect.arrayContaining(expected))
    }
  })

  it('connects builder keys, derived references and consumers without renaming unrelated tokens', () => {
    const result = project.query({
      'tokens.ts': snippet`
        import { defineTokens } from '@mszr/vanity'
        export const colors = defineTokens()
          .add('${mark('definition')`brand`}', '#635bff')
          .add('brandSoft', m => m.${mark('reference')`brand`})
      `,
      'design.ts': `
        import { createSystem } from '@mszr/vanity'
        import { colors } from './tokens'
        export const ds = createSystem().addTokens(colors).consolidate()
      `,
      'consumer.ts': snippet`
        import { ds } from './design'
        void ds.t.${mark('consumer')`brand`}
      `,
      'other.ts': unrelated,
    })
    expect(result).toBeClean()
    const expected = (['definition', 'reference', 'consumer'] as const).map(name => result.rangeOf(name))
    for (const name of ['definition', 'consumer'] as const) {
      const rename = result.at(name).rename
      expect(rename.canRename).toBe(true)
      expect(rename.locations).toHaveLength(expected.length)
      expect(rename.locations).toEqual(expect.arrayContaining(expected))
    }
  })

  it('preserves native aliased and shorthand binding edits for an owned token', () => {
    const result = project.query({
      'tokens.ts': `import { defineTokens } from '@mszr/vanity'; export const tokens = defineTokens().add('brand', 'red')`,
      'design.ts': `import { createSystem } from '@mszr/vanity'; import { tokens } from './tokens'; export const ds = createSystem().addTokens(tokens).consolidate()`,
      'consumer.ts': snippet`
        import { ds } from './design'
        void ds.t.${mark('use')`brand`}
        const { ${mark('alias')`brand`}: accent } = ds.t
        void accent
        const { ${mark('shorthand')`brand`} } = ds.t
        void brand
      `,
      'other.ts': unrelated,
    })
    expect(result).toBeClean()
    const locations = result.at('use').rename.locations
    expect(locations).toHaveLength(4)
    expect(locations).toContainEqual(result.rangeOf('alias'))
    expect(locations).toContainEqual({ ...result.rangeOf('shorthand'), suffixText: ': brand' })
  })

  it('locates ambient source notices and application emitter misuse, with usable repair edits', () => {
    const result = project.query({
      'node_modules/@mszr/vanity/vanity-style-auto-imports.d.ts': 'export {}',
      'ambient.d.ts': `/* generated by vanity */
        declare global { var cls: typeof import('@mszr/vanity').createSystem }
        export {}
      `,
      'button.css.ts': snippet`void ${mark('ambient')`cls`}`,
      'component.ts': snippet`
        import { createSystem } from '@mszr/vanity'
        const ds = createSystem().consolidate()
        void ds.${mark('emitter')`class`}({})
      `,
    })
    const notice = result.diagnostics.find(diagnostic => diagnostic.code === 990001)
    expect(notice).toMatchObject({
      severity: 'suggestion',
      range: result.rangeOf('ambient'),
      message: expect.stringContaining('VANITY_AMBIENT_SOURCE_DECLARATION'),
    })
    expect(result).toHaveErrorCount(1)
    expect(result).toHaveError(990002, /belongs in a \*\.css\.ts style module/, { on: result.rangeOf('emitter') })
    expect(notice!.codeFixes.map(fix => fix.description)).toEqual(expect.arrayContaining([
      'Add the type-only unlock import',
      'Import cls from the authoring barrel',
    ]))
    const unlock = notice!.codeFixes.find(fix => fix.description === 'Add the type-only unlock import')!
    expect(unlock.edits).toEqual([expect.objectContaining({
      range: expect.objectContaining({ file: 'button.css.ts' }),
      newText: 'import type {} from \'@mszr/vanity/vanity-style-auto-imports\'\n',
    })])
    const repaired = project.check(unlock.fixedFiles)
    expect(repaired.diagnostics.some(diagnostic => diagnostic.code === 990001)).toBe(false)
    expect(repaired).toHaveErrorCount(1)
    expect(repaired).toHaveError(990002, { on: 'class' })
    for (const statement of [
      'import {} from \'@mszr/vanity/vanity-style-auto-imports\'',
      'import type { Missing } from \'@mszr/vanity/vanity-style-auto-imports\'',
      'import type {} from \'other/vanity-style-auto-imports\'',
    ]) {
      const unacknowledged = project.check({ ...result.files, 'button.css.ts': `${statement}\nvoid cls` })
      expect(unacknowledged.diagnostics.some(diagnostic => diagnostic.code === 990001)).toBe(true)
    }
  })
})
