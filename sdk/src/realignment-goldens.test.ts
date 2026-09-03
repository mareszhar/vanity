import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { createSystem } from './index'
import { substrate } from './substrate'
import { createValueKernel, isValueKernelCompatible } from './values/kernel'

function locked(open: { readonly consolidate: () => object }) {
  return substrate.modules.runInFileScope({
    filePath: 'src/realignment-goldens.system.ts',
    packageName: '@vanity/fixture',
  }, () => open.consolidate()) as any
}

describe('realignment evidence goldens', () => {
  it('freezes emitted CSS and runtime address semantics', () => {
    const open = createSystem()
    const system = locked(open.addTokens({
      color: { brand: 'rebeccapurple' },
      space: { md: open.tdef({ val: '1rem', mutable: true }) },
    }))
    const { css, returned } = emit(() => {
      const className = system.class({
        color: system.t.color.brand,
        padding: system.t.space.md,
      }, 'realignmentGolden')
      const seed = system.snapshotFrom((runtime: any) => {
        runtime.t.space.md.$set('2rem')
      })

      return {
        className,
        names: system.namesOf(system.t.color),
        seed,
      }
    })

    expect(returned).toMatchInlineSnapshot(`
      {
        "className": "prism_realignmentGolden__76x8e40",
        "names": {
          "brand": "--vanity-color-brand",
        },
        "seed": {
          "modes": {},
          "overrides": [
            {
              "address": {
                "kind": "base",
              },
              "token": [
                "space",
                "md",
              ],
              "val": "2rem",
            },
          ],
          "system": "vanity-runtime-2-1jno513",
          "version": 1,
        },
      }
    `)
    expect(css).toMatchInlineSnapshot(`
      "@layer vanity;
      @layer vanity.reset;
      @layer vanity.tokens;
      @layer vanity.recipes;
      @layer vanity.utilities;
      @layer vanity.overrides;
      @layer vanity.tokens.base;
      @layer vanity.tokens.axes;
      @layer vanity.tokens.cases;
      @layer vanity.tokens.overrides;
      @layer vanity.tokens.base {
        :root {
          --vanity-color-brand: rebeccapurple;
          --vanity-v-1epzled: 1rem;
          --vanity-space-md: var(--vanity-v-1epzled);
        }
      }
      @layer vanity.recipes {
        .prism_realignmentGolden__76x8e40 {
          color: var(--vanity-color-brand);
          padding: var(--vanity-space-md);
        }
      }"
    `)
  })

  it('freezes deterministic compatibility evidence for value capabilities', () => {
    const first = createValueKernel({ length: () => 'px' })
    const equivalent = createValueKernel({ length: () => 'px' })
    const changed = createValueKernel({ length: () => 'px', editorial: () => 'rem' })

    expect(first.signature).toBe(equivalent.signature)
    expect(isValueKernelCompatible(first, equivalent)).toBe(true)
    expect(first.signature).not.toBe(changed.signature)
    expect(isValueKernelCompatible(first, changed)).toBe(false)
  })
})
