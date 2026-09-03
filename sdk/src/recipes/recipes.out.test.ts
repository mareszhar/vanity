/**
 * The output evidence dimension: recipe and anatomy CSS is a public contract
 * ([workspace.md §5]) — per-arm classes in the recipes layer, defaults
 * folded into base where sound, compound entries last so they win by order,
 * part-scoped conditions compiled to ancestor-state selectors, locked.
 */

import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { createFixtureSystem } from '../test-support/current'

function miniSystem() {
  return createFixtureSystem({
    tokens: {
      color: { brand: '#635bff' },
      space: { xs: '4px', sm: '8px', md: '16px' },
    },
    conditions: {
      open: '&[data-state="open"]',
    },
  })
}

describe('recipe()', () => {
  it('emits per-arm classes; a covered default folds into base, an uncovered one keeps its class', () => {
    const { css: emitted } = emit(() => {
      const { recipe, t } = miniSystem()

      return recipe({
        base: { display: 'inline-flex', gap: t.space.xs },
        variants: {
          intent: {
            // `brand` declares a hover arm `danger` lacks — it cannot fold.
            brand: { background: t.color.brand, hover: { background: 'rebeccapurple' } },
            danger: { background: 'crimson' },
          },
          size: {
            // Both values declare exactly `paddingInline` — `md` folds into base.
            sm: { paddingInline: t.space.sm },
            md: { paddingInline: t.space.md },
          },
        },
        toggles: {
          pill: { borderRadius: '999px' },
        },
        compound: [
          { when: { intent: 'danger', size: 'sm' }, style: { fontWeight: 600 } },
        ],
        defaults: { intent: 'brand', size: 'md' },
      }, 'button')
    })

    expect(emitted).toMatchInlineSnapshot(`
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
          --vanity-color-brand: #635bff;
          --vanity-space-xs: 4px;
          --vanity-space-sm: 8px;
          --vanity-space-md: 16px;
        }
      }
      @layer vanity.recipes {
        .prism_button__76x8e40 {
          display: inline-flex;
          gap: var(--vanity-space-xs);
          padding-inline: var(--vanity-space-md);
        }
        .prism_button_intent_brand__76x8e41 {
          background: var(--vanity-color-brand);
        }
        .prism_button_intent_brand__76x8e41:hover {
          background: rebeccapurple;
        }
        .prism_button_intent_danger__76x8e42 {
          background: crimson;
        }
        .prism_button_size_sm__76x8e43 {
          padding-inline: var(--vanity-space-sm);
        }
        .prism_button_pill__76x8e44 {
          border-radius: 999px;
        }
        .prism_button_compound_0__76x8e45 {
          font-weight: 600;
        }
      }"
    `)
  })

  it('arms take full vanity rules — conditions intersect exactly like class()', () => {
    const { css: emitted } = emit(() => {
      const { recipe } = miniSystem()

      return recipe({
        variants: {
          state: {
            active: { open: { motionOk: { animationDuration: '200ms' } } },
          },
        },
      }, 'item')
    })

    expect(emitted).toContain('@media (prefers-reduced-motion: no-preference)')
    expect(emitted).toMatch(/\.prism_item_state_active__[\w-]+\[data-state="open"\]/)
  })

  it('a recipe lives in one declared layer', () => {
    const { css: emitted } = emit(() => {
      const { recipe } = miniSystem()

      return recipe.layer('overrides')({
        base: { margin: 0 },
        variants: { size: { sm: { padding: 0 } } },
      }, 'fixup')
    })

    expect(emitted).toContain('@layer vanity.overrides {')
    expect(emitted).not.toContain('@layer vanity.recipes {')
  })
})

describe('anatomy()', () => {
  it('parts get stable classes; part-scoped conditions compile to ancestor-state selectors', () => {
    const { css: emitted } = emit(() => {
      const { anatomy, t } = miniSystem()

      return anatomy({
        parts: ['root', 'input', 'list'],
        base: {
          input: {
            'borderRadius': t.space.xs,
            'root:open': { borderEndStartRadius: 0, borderEndEndRadius: 0 },
          },
          list: { 'display': 'none', 'root:open': { display: 'block' } },
        },
        variants: {
          size: {
            sm: { input: { paddingInline: t.space.sm } },
            lg: { input: { paddingInline: t.space.md } },
          },
        },
        defaults: { size: 'sm' },
      }, 'combobox')
    })

    expect(emitted).toMatchInlineSnapshot(`
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
          --vanity-color-brand: #635bff;
          --vanity-space-xs: 4px;
          --vanity-space-sm: 8px;
          --vanity-space-md: 16px;
        }
      }
      @layer vanity.recipes {
        .prism_combobox_input__76x8e41 {
          border-radius: var(--vanity-space-xs);
          padding-inline: var(--vanity-space-sm);
        }
        .prism_combobox_root__76x8e40[data-state="open"] .prism_combobox_input__76x8e41 {
          border-end-start-radius: 0;
          border-end-end-radius: 0;
        }
        .prism_combobox_list__76x8e42 {
          display: none;
        }
        .prism_combobox_root__76x8e40[data-state="open"] .prism_combobox_list__76x8e42 {
          display: block;
        }
        .prism_combobox_size_lg_input__76x8e43 {
          padding-inline: var(--vanity-space-md);
        }
      }"
    `)
  })

  it('a comma-list condition scopes each selector part to the referenced part', () => {
    const { css: emitted } = emit(() => {
      const { anatomy } = miniSystem()

      return anatomy({
        parts: ['trigger', 'icon'],
        base: {
          icon: { 'trigger:hoverFocus': { rotate: '180deg' } },
        },
      }, 'select')
    })

    expect(emitted).toMatch(
      /\.(prism_select_trigger__[\w-]+):hover \.(prism_select_icon__[\w-]+), \.\1:focus-visible \.\2/,
    )
  })
})
