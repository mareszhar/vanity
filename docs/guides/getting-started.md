# vanity — getting started

Vanity is a design-system engine and TypeScript harness for CSS. It uses TypeScript for system structure and CSS for styling semantics. The compiler connects the two; the browser remains the runtime.

## 1. Install

```sh
npm install @mszr/vanity vite
```

`vite` is required for the compiler integration. Add `vue`, `nuxt`, `typescript`, or `@mszr/selenita` only when the corresponding Vanity entrypoint is part of the project.

## 2. Create the system

Create and consolidate a design system in a plain TypeScript module—not in a `*.css.ts` file.

```TS
// src/design/system.ts
import { createSystem } from '@mszr/vanity'

export const ds = createSystem()
  .addTokens(ds => ({
    color: {
      brand: '#635bff',
      canvas: '#ffffff',
    },
    space: {
      md: ds.length.rem(1),
    },
  }))
  .consolidate({
    prefix: 'app',
    root: ':root',
  })
```

The open system grows additively. `consolidate()` produces an immutable locked system with resolved tokens, styling emitters, runtime binding, and introspection. It performs no I/O and emits no CSS.

## 3. Compile styles

Point the Vite plugin at that same system module.

```TS
// vite.config.ts
import { vanityPlugin } from '@mszr/vanity/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vanityPlugin({
    compiler: { system: './src/design/system.ts' },
  })],
})
```

Create styles in `*.css.ts` files and use token handles as ordinary CSS values.

```TS
// src/components/Card.css.ts
import { ds } from '../design/system'

export const card = ds.class({
  color: ds.t.color.brand,
  background: ds.t.color.canvas,
  padding: ds.t.space.md,
})
```

The result is ordinary CSS with recognizable classes and custom properties. No client styling engine rebuilds the design graph.

## Next

- Read [the language](../language.md) for the canonical terms and API map.
- Read [system authoring](../reference/spec-system-authoring.md) before adding modules, axes, conditions, or plugins.
- Read [styling and output](../reference/spec-css.md) before building components.
- Read [Vite, Vue, and Nuxt integrations](../reference/spec-integrations.md) when connecting an application.
- Read [the testing kit](../reference/testing-kit.md) when verifying a consumer system or plugin.
