/**
 * The output plane: the emitted CSS is a public contract
 * ([workspace.md §5]) — layer order, condition compilation in both
 * directions, arm intersection, scheme arms, global and raw lanes, locked.
 */

import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { createSystem } from '../test-support/characterization'

/** A tiny system: inline tokens, spec-shaped conditions, default layers. */
function miniSystem() {
  return createSystem({
    tokens: {
      color: { brand: '#635bff' },
      space: { sm: '8px', md: '16px' },
    },
    conditions: {
      open: '&[data-state="open"]',
      md: '@media (min-width: 768px)',
      cardWide: '@container card (min-width: 400px)',
    },
  })
}

describe('css()', () => {
  it('compiles the spec card: both nesting directions, plain selectors, at-rules', () => {
    const { css: emitted } = emit(() => {
      const { css, t } = miniSystem()

      return css({
        'padding': t.space.md,
        'background': t.color.brand,
        'hover': { background: 'rebeccapurple' },
        'md': { padding: t.space.sm },
        'color': { base: 'black', hover: 'white' },
        '&:has(> img:first-child)': { paddingTop: 0 },
        '@supports (view-transition-name: none)': { viewTransitionName: 'card' },
      }, 'card')
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
          --vanity-space-sm: 8px;
          --vanity-space-md: 16px;
        }
      }
      @layer vanity.recipes {
        .prism_card__76x8e40 {
          padding: var(--vanity-space-md);
          background: var(--vanity-color-brand);
          color: black;
        }
        .prism_card__76x8e40:hover {
          background: rebeccapurple;
          color: white;
        }
        .prism_card__76x8e40:has(> img:first-child) {
          padding-top: 0;
        }
        @media (min-width: 768px) {
          .prism_card__76x8e40 {
            padding: var(--vanity-space-sm);
          }
        }
        @supports (view-transition-name: none) {
          .prism_card__76x8e40 {
            view-transition-name: card;
          }
        }
      }"
    `)
  })

  it('intersects nested conditions into one arm', () => {
    const { css: emitted } = emit(() => {
      const { css } = miniSystem()

      return css({
        overflow: 'hidden',
        open: { motionOk: { animationDuration: '200ms' } },
      }, 'content')
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
          --vanity-space-sm: 8px;
          --vanity-space-md: 16px;
        }
      }
      @layer vanity.recipes {
        .prism_content__76x8e40 {
          overflow: hidden;
        }
        @media (prefers-reduced-motion: no-preference) {
          .prism_content__76x8e40[data-state="open"] {
            animation-duration: 200ms;
          }
        }
      }"
    `)
  })

  it('a comma-list condition multiplies through nesting', () => {
    const { css: emitted } = emit(() => {
      const { css } = miniSystem()

      return css({
        open: { hoverFocus: { outlineOffset: '2px' } },
      }, 'pair')
    })

    expect(emitted).toMatch(
      /\.(prism_pair__[\w-]+)\[data-state="open"\]:hover, \.\1\[data-state="open"\]:focus-visible \{/,
    )
  })

  it('compiles the scheme conditions to pinned-subtree and preference arms', () => {
    const { css: emitted } = emit(() => {
      const { css } = miniSystem()

      return css({
        dark: { borderColor: 'white' },
      }, 'panel')
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
          --vanity-space-sm: 8px;
          --vanity-space-md: 16px;
        }
      }
      @layer vanity.recipes {
        .prism_panel__76x8e40:where([data-scheme='dark'], [data-scheme='dark'] *) {
          border-color: white;
        }
        @media (prefers-color-scheme: dark) {
          .prism_panel__76x8e40:where(:not([data-scheme='light'], [data-scheme='light'] *)) {
            border-color: white;
          }
        }
      }"
    `)
  })

  it('a class handle interpolates into a selector as a typed reference', () => {
    const { css: emitted } = emit(() => {
      const { css } = miniSystem()
      const button = css({ display: 'inline-flex' }, 'button')

      return css({
        display: 'flex',
        [`${button} + ${button}`]: { marginInlineStart: 0 },
        [`& ${button}`]: { borderRadius: 0 },
      }, 'toolbar')
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
          --vanity-space-sm: 8px;
          --vanity-space-md: 16px;
        }
      }
      @layer vanity.recipes {
        .prism_button__76x8e40 {
          display: inline-flex;
        }
        .prism_toolbar__76x8e41 {
          display: flex;
        }
        .prism_toolbar__76x8e41 .prism_button__76x8e40 + .prism_button__76x8e40 {
          margin-inline-start: 0;
        }
        .prism_toolbar__76x8e41 .prism_button__76x8e40 {
          border-radius: 0;
        }
      }"
    `)
  })

  it('numbers take the substrate unit rule: px where lengths, unitless where unitless', () => {
    const { css: emitted } = emit(() => {
      const { css } = miniSystem()
      return css({ padding: 8, lineHeight: 1.5, zIndex: 10, flexGrow: 1 }, 'numbers')
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
          --vanity-space-sm: 8px;
          --vanity-space-md: 16px;
        }
      }
      @layer vanity.recipes {
        .prism_numbers__76x8e40 {
          padding: 8px;
          line-height: 1.5;
          z-index: 10;
          flex-grow: 1;
        }
      }"
    `)
  })

  it('custom properties are plain keys; fallback arrays emit repeated declarations', () => {
    const { css: emitted } = emit(() => {
      const { css } = miniSystem()

      return css({
        '--track-size': 8,
        'position': ['-webkit-sticky', 'sticky'],
      }, 'escape')
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
          --vanity-space-sm: 8px;
          --vanity-space-md: 16px;
        }
      }
      @layer vanity.recipes {
        .prism_escape__76x8e40 {
          --track-size: 8;
          position: -webkit-sticky;
          position: sticky;
        }
      }"
    `)
  })

  it('layers: declared once in order; styles land in the default layer or an explicit one', () => {
    const { css: emitted } = emit(() => {
      const { css } = miniSystem()
      css({ display: 'grid' }, 'inRecipes')
      css.layer('overrides')({ maxWidth: '100%' }, 'fixup')
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
          --vanity-space-sm: 8px;
          --vanity-space-md: 16px;
        }
      }
      @layer vanity.recipes {
        .prism_inRecipes__76x8e40 {
          display: grid;
        }
      }
      @layer vanity.overrides {
        .prism_fixup__76x8e41 {
          max-width: 100%;
        }
      }"
    `)
  })

  it('@starting-style and container conditions are plain keys', () => {
    const { css: emitted } = emit(() => {
      const { css } = miniSystem()

      return css({
        'opacity': 1,
        '@starting-style': { opacity: 0 },
        'cardWide': { padding: '24px' },
      }, 'entry')
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
          --vanity-space-sm: 8px;
          --vanity-space-md: 16px;
        }
      }
      @layer vanity.recipes {
        .prism_entry__76x8e40 {
          opacity: 1;
        }
        @starting-style {
          .prism_entry__76x8e40 {
            opacity: 0;
          }
        }
        @container card (min-width: 400px) {
          .prism_entry__76x8e40 {
            padding: 24px;
          }
        }
      }"
    `)
  })
})

describe('keyframes and globalCss', () => {
  it('keyframes emit under the export-held name; the handle interpolates', () => {
    const { css: emitted } = emit(() => {
      const { css, keyframes } = miniSystem()
      const slideDown = keyframes({
        from: { blockSize: 0, opacity: 0 },
        to: { blockSize: '100px', opacity: 1 },
      }, 'slideDown')

      return css({
        open: { motionOk: { animation: `${slideDown} 200ms ease-out` } },
      }, 'accordion')
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
          --vanity-space-sm: 8px;
          --vanity-space-md: 16px;
        }
      }
      @layer vanity.recipes {
        @keyframes prism_slideDown__76x8e40 {
          from {
            block-size: 0;
            opacity: 0;
          }
          to {
            block-size: 100px;
            opacity: 1;
          }
        }
      }
      @layer vanity.recipes;
      @layer vanity.recipes {
        @media (prefers-reduced-motion: no-preference) {
          .prism_accordion__76x8e41[data-state="open"] {
            animation: prism_slideDown__76x8e40 200ms ease-out;
          }
        }
      }"
    `)
  })

  it('globalCss lands in the reset layer with conditions intact', () => {
    const { css: emitted } = emit(() => {
      const { globalCss, t } = miniSystem()

      globalCss('html, body', {
        margin: 0,
        background: t.color.brand,
        motionReduce: { scrollBehavior: 'auto' },
      })
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
          --vanity-space-sm: 8px;
          --vanity-space-md: 16px;
        }
      }
      @layer vanity.reset {
        html, body {
          margin: 0;
          background: var(--vanity-color-brand);
        }
        @media (prefers-reduced-motion: reduce) {
          html, body {
            scroll-behavior: auto;
          }
        }
      }"
    `)
  })
})

describe('css.raw', () => {
  it('scopes a raw block under the generated class, descendants included', () => {
    const { css: emitted } = emit(() => {
      const { css, t } = miniSystem()

      return css.raw`
        h2 { margin-block: 1.5em 0.5em; }
        a {
          color: ${t.color.brand};
          &:hover { text-decoration-thickness: 2px; }
        }
        @media (min-width: 768px) {
          h2 { margin-block: 2em 1em; }
        }
      `
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
          --vanity-space-sm: 8px;
          --vanity-space-md: 16px;
        }
      }
      @layer vanity.recipes {
        .prism__76x8e40 h2 {
          margin-block: 1.5em .5em;
        }
        .prism__76x8e40 a {
          color: var(--vanity-color-brand);
        }
        .prism__76x8e40 a:hover {
          text-decoration-thickness: 2px;
        }
        @media (width >= 768px) {
          .prism__76x8e40 h2 {
            margin-block: 2em 1em;
          }
        }
      }"
    `)
  })
})
