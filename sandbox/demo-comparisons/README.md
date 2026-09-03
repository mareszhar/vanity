# Prism dispatch-card comparison

One small polished dispatch-card workflow implemented five ways: Vue SFC scoped CSS, Tailwind, Panda, raw vanilla-extract, and vanity. Every lane receives the same state and content from `@prism/domain`, so the comparison is about authoring models—not accidental visual drift or the flagship's much larger feature set.

## Run

From the repository root:

```sh
pnpm run demo:comparisons
```

Vite serves the app at `http://localhost:5173` by default. This demo uses Vite while `demo-main` uses Nuxt intentionally: the matrix isolates framework-independent compilation; the flagship verifies Nuxt SSR and module integration.

## Test it

- Change intent, size, and pill: every lane resolves the same finite variant choice.
- Move progress: SFC uses `v-bind()`, Tailwind and Panda use inline style, vanilla-extract uses `createVar` plumbing, and vanity uses a typed port.
- Click every Dispatch and card action button: the shared status and per-lane count confirm that each demo control is functional.
- Change scheme: all lanes follow the same platform `color-scheme` axis.
- Change brand hue: every lane re-derives the same palette. Four write the shared raw channel in their native idiom; Vanity validates and writes its typed token channel through a root-bound runtime.
- Inspect `index.html`: cascade-layer order is declared before any stylesheet because five styling systems share the page.

## Study map

- `src/lanes/sfc` — variables and variants maintained in SFC styles.
- `src/lanes/tailwind` — theme variables and utility maps.
- `panda.config.ts`, `src/lanes/panda` — config/codegen and generated `css()` calls.
- `src/lanes/extract` — vanilla-extract tokens, recipes, and dynamic variables.
- `src/lanes/vanity` — the canonical open → additive tokens → locked-system flow, a public elevation plugin, a CSS-reactive token module, recipe, typed port, and bound runtime.
- `src/shell.css` — comparison chrome only; no lane depends on it for component styling.

## Reference sources

Each peer lane follows the first-party shape relevant to this deliberately small comparison:

- Vue: scoped SFC CSS and reactive `v-bind()` custom properties — [SFC CSS features](https://vuejs.org/api/sfc-css-features).
- Tailwind CSS v4: the Vite plugin, CSS `@import "tailwindcss"`, `@theme` variables, and utility classes — [Vite installation](https://tailwindcss.com/docs/installation/using-vite) and [theme variables](https://tailwindcss.com/docs/theme).
- Panda CSS: its recommended PostCSS integration, generated system, and colocated `cva()`/`css()` authoring — [getting started](https://panda-css.com/docs/overview/getting-started) and [recipes](https://panda-css.com/docs/concepts/recipes).
- vanilla-extract: build-time `recipe()` variants plus `createVar`/`assignInlineVars` for runtime values — [recipes](https://vanilla-extract.style/documentation/packages/recipes/) and [dynamic](https://vanilla-extract.style/documentation/packages/dynamic/).

The comparison does not declare a winner from line count. Its durable questions are where design decisions live, what the editor can prove, what runtime work remains, what CSS ships, and how a cross-cutting change propagates.
