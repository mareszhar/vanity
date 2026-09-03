# @mszr/vanity

**Vanity is a design-system engine and TypeScript harness for CSS.**

Vanity gives design-system authors inferred, composable, refactorable, and inspectable APIs while preserving the full capability and semantics of CSS. It emits ordinary CSS and keeps the browser—not a hidden styling runtime—responsible for live styling work.

## North Star

> 🌟 **Make Vanity the most delightful way to style with TypeScript.**

## Highlights

- **🎨 Use all of CSS without giving up TypeScript.** Author the platform’s names, grammar, selectors, at-rules, layers, custom properties, and future syntax with typed values and token handles. A raw standards escape remains available whenever CSS moves first.
- **🧩 Grow a system without breaking its foundations.** Add tokens, axes, conditions, plugins, and utilities immutably; get loud, local conflicts instead of silent redefinition; then consolidate independent forks from the same base.
- **✂️ Remove the work that should have been inferred.** Tokens flow from definition to use without copied paths, hand-built `var()` calls, mirrored registries, or framework-specific glue.
- **⚡ Ship ordinary CSS, not a client-side style graph.** Vanity compiles classes, custom properties, selectors, conditions, and code-split stylesheets that remain legible, portable, optimizable, and useful without Vanity at runtime.
- **🔎 Understand and evolve every decision confidently.** Exact types, source-local diagnostics, editor DX, manifests, explanations, audits, and diffs retain one semantic identity from authoring through production.
- **🌐 Keep your application architecture yours.** The core stays framework-independent; Vite, Vue, Nuxt, SSR, runtime controls, and the optional Hail policy layer are explicit integrations rather than a required stack.

## Install

```sh
npm install @mszr/vanity
```

Install `vite` when compiling Vanilla style modules. `vue`, `nuxt`, `typescript`, and `@mszr/selenita` are optional peers; add only the integrations and testing tools your project uses.

## Quick start

Create the design system in a plain TypeScript module. The open system defines and adds capabilities; the locked system styles with resolved handles.

```TS
// src/design/system.ts
import { createSystem } from '@mszr/vanity'

export const ds = createSystem()
  .addTokens(ds => ({
    color: {
      brand: ds.tdef.color({
        val: '#635bff',
        mutable: true,
      }),
      canvas: '#ffffff',
    },
    space: {
      md: ds.length.rem(1),
    },
  }))
  .addConditions({
    selected: '&[data-selected]',
  })
  .consolidate({
    prefix: 'app',
    root: ':root',
  })
```

Use the locked system in `*.css.ts`. Tokens are values: no copied string paths or manual `var()` calls.

```TS
// src/components/Card.css.ts
import { ds } from '../design/system'

export const card = ds.class({
  color: ds.t.color.brand,
  background: ds.t.color.canvas,
  padding: ds.t.space.md,
  selected: {
    outline: `2px solid ${ds.t.color.brand}`,
  },
})
```

Configure the Vite plugin with the same plain system entry:

```TS
// vite.config.ts
import { vanityPlugin } from '@mszr/vanity/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vanityPlugin({
    compiler: {
      system: './src/design/system.ts',
    },
    autoImports: {
      shared: '$system', // `ds` in both style and application modules
      app: ['core'],
    },
  })],
})
```

Vanity evaluates the style module at build time and emits ordinary CSS: classes, custom properties, cascade layers, selectors, conditions, and at-rules. `consolidate()` itself performs no I/O and emits nothing, so tools can import the system directly.

## What you can build

Use the locked system to create classes, ordered fragments, selector rules, recipes, anatomies, atom sets, ports, keyframes, font faces, and raw CSS. Mutable tokens and activatable axes lower to declared browser-native slots; the optional runtime controller sets those slots and can create SSR-safe snapshots.

Vite projects manifests and portable system data from the same semantic contract. The CLI can inspect, explain, and diff those artifacts; the testing kit verifies emitted CSS, folding, rendered values, and editor DX.

```TS
const runtime = ds.runtime()

runtime.t.color.brand.$set('#16a34a')
runtime.t.color.brand.$unset()
```

## Documentation

Start with the [getting-started guide](https://github.com/mareszhar/vanity/blob/main/docs/guides/getting-started.md), then choose the contract that matches the work in front of you.

| Need | Documentation |
| --- | --- |
| Understand the product boundary | [Vision](https://github.com/mareszhar/vanity/blob/main/docs/vision.md), [principles](https://github.com/mareszhar/vanity/blob/main/docs/principles.md), and [language](https://github.com/mareszhar/vanity/blob/main/docs/language.md) |
| Define systems, tokens, conditions, and CSS | [System authoring](https://github.com/mareszhar/vanity/blob/main/docs/reference/spec-system-authoring.md), [tokens](https://github.com/mareszhar/vanity/blob/main/docs/reference/spec-tokens.md), [conditions and axes](https://github.com/mareszhar/vanity/blob/main/docs/reference/spec-conditions.md), and [styling/output](https://github.com/mareszhar/vanity/blob/main/docs/reference/spec-css.md) |
| Build components or extensions | [Recipes and anatomy](https://github.com/mareszhar/vanity/blob/main/docs/reference/spec-recipes.md), [ports](https://github.com/mareszhar/vanity/blob/main/docs/reference/spec-ports.md), and [plugins and constructors](https://github.com/mareszhar/vanity/blob/main/docs/reference/spec-extensions.md) |
| Integrate or operate a system | [Vite/Vue/Nuxt integrations](https://github.com/mareszhar/vanity/blob/main/docs/reference/spec-integrations.md), [runtime](https://github.com/mareszhar/vanity/blob/main/docs/reference/spec-runtime.md), and [introspection/tooling](https://github.com/mareszhar/vanity/blob/main/docs/reference/spec-introspection.md) |
| Test a consumer system or plugin | [Testing kit](https://github.com/mareszhar/vanity/blob/main/docs/reference/testing-kit.md) |
| Use the optional opinionated layer | [Hail](https://github.com/mareszhar/vanity/blob/main/docs/reference/spec-hail.md) |
| Browse everything | [Documentation index](https://github.com/mareszhar/vanity/blob/main/docs/README.md) |

## Repository and development

This repository is the maintainer workspace around the publishable `sdk/` package. Its [workspace manual](https://github.com/mareszhar/vanity/blob/main/docs/maintainers/workspace.md) describes commands, CI, release rehearsal, demos, benchmarks, and evidence. Package consumers do not need the workspace to use Vanity.

## License

Vanity is licensed under the [GNU Affero General Public License v3.0](./LICENSE).
