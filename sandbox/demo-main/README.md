# Prism — the design-system studio

The flagship Nuxt demo for `@mszr/vanity`. It is a live specimen of one TypeScript design system — palette, surfaces, type scale, components, and capability demos — not a product mockup. Every control on the left re-derives the whole system through ordinary, inspectable CSS.

## Run

From the repository root:

```sh
pnpm run demo:main
```

Nuxt serves the app (`http://localhost:3000` by default).

## What it proves

- SSR links generated stylesheets and paints the studio with real CSS — no `.vanity.css` requests, no unstyled first paint.
- **Hue** writes one channel (`--prism-color-hue`); accent, neutral surfaces, states, and legible foregrounds re-derive through CSS. Authored lightness/chroma keep flowing through HMR because the runtime only _re-hues_, never re-serialises the color.
- **Appearance** (system/light/dark) comes from one elevation-driven token set; an explicit scheme wins even against the OS preference and survives SSR/hydration with no flash.
- **Density** and **motion** are environmental axes; **shadows** combine scheme (transparent in the dark) and density (lifted when spacious) as layered stacks.
- **Radius** and **typeface** are mutable tokens over self-hosted variable faces.
- Buttons are a recipe with a published padding port; the switch and tabs are anatomies with part-scoped conditions; progress crosses the runtime boundary through one typed port.
- The specimen card exercises **container queries**; the inspector traces provenance via `ds.explain()`.
- Presets, "surprise me", and reset all round-trip through one cookie-persisted runtime snapshot.

## Layout

Component styles live apart from components; the design system lives under `assets/styles/design`.

- `app/assets/styles/design/open.ts` — the open system: elevation/BEM plugins and the scheme/density/motion axes.
- `app/assets/styles/design/palette.tokens.ts` — channel-first color, elevation surfaces, and shadows.
- `app/assets/styles/design/foundations.tokens.ts` — density-scaled space, the radius seed, type scale, fonts, motion.
- `app/assets/styles/design/system.ts` — composes the token builders and locks the one `ds`.
- `app/assets/styles/design/authoring.ts` — the user-owned style barrel that re-exports the exact `ds`, selected bound authoring helpers, and independent preset helpers; `cls` is its local shorthand for `ds.class`.
- `app/assets/styles/design/base.css.ts` — self-hosted `@font-face` declarations and the global reset.
- `app/assets/styles/components/*.css.ts` — recipes, anatomies, ports, and the page styles.
- `app/components/*.vue` — template-first Pug SFCs that reach their styles through the `styled` alias (`import * as s from 'styled/Name.css'`).
- `app/composables/useStudio.ts` — the settings model, runtime binding, and SSR snapshot projection.
- `app/utils/vanity.ts` — the one-line re-export that auto-imports `ds` app-wide.
