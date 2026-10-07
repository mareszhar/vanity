---
name: vanity-tooling
description: Inspect, audit, export, or test a Vanity (@mszr/vanity) design system with tools instead of by reading CSS — `ds.explain()`, `ds.introspect()`, `ds.audit()`, the `vanity` CLI (inspect, explain, diff, prepare), the build manifest and dev page at `/__vanity/`, agent-context generation, DTCG design-token export/import (Figma Tokens, Style Dictionary), and the testing kit (`@mszr/vanity/testing`) for asserting emitted CSS, token folding, rendered values, and editor DX. Use this when you need to know why a token has a value, what a change affects, compare two builds, document the system, exchange tokens with another tool, or write tests for a design system or Vanity plugin.
---

# Inspecting and integrating a Vanity system

Every projection here reads the same semantic record the compiler uses, so answers match what ships.

## Ask the system directly (in Node: scripts, tests, config)

```ts
import { ds } from './design/system.ts'

ds.explain(ds.t.color.onAccent)
// { type: 'color', expression, dependencies, preview: { val: 'white', environment: {…} },
//   declarations (base + per mode), reference/emit/mutable traits, fold decision, source, … }

ds.introspect()   // the whole system as versioned JSON: tokens, axes, conditions, layers, plugins, policies
ds.audit()        // { findings, unevaluated } — system-level audits (overlapping axes, stale derivations, …)
```

`explain` also takes recipes, anatomies, ports, axes (`ds.axes.scheme`), and conditions. It's the fastest way to answer "why is this color X in dark mode?" without opening devtools.

## The manifest and CLI

Each successful build writes `.vanity/manifest.json` (next to the Vite/Nuxt source root; in Nuxt 4 that's usually `app/.vanity/manifest.json`). During `dev`, the same data is served at `/__vanity/manifest.json` and browsable at `/__vanity/`. It adds module-level facts the system alone can't know: recipes, ports, escapes, token usage counts.

```sh
npx vanity inspect app/.vanity/manifest.json          # summary
npx vanity explain color.accent app/.vanity/manifest.json --json
npx vanity diff old-manifest.json app/.vanity/manifest.json   # categorized: compatibility / css / runtime / docs
npx vanity prepare --config ./vanity.config.ts        # generate auto-import declarations without a build
```

`--json` output is the stable contract for scripts and agents. Keep a manifest from `main` to diff a branch's design impact.

## Agent context

```ts
import { readManifest } from '@mszr/vanity/cli'
import { generateAgentContext } from '@mszr/vanity/vite'

const manifest = await readManifest('app/.vanity/manifest.json')
const markdown = generateAgentContext(manifest)   // axes, conditions, the full token vocabulary, components, cautions
```

Useful to give an agent a full orientation of a large system. For a focused question, prefer `explain` on the one subject.

## Design tokens (DTCG)

```ts
import { exportDesignTokens, importDesignTokens } from '@mszr/vanity'

const document = exportDesignTokens(ds)                  // W3C DTCG resolved values
const lossy = exportDesignTokens(ds, { strict: false })  // skip values with no standard representation

const imported = importDesignTokens(json)                // a token module to add to an open system
const open = createSystem().addTokens(imported)
```

Strict export (the default) fails on tokens without a standard DTCG form, including raw-string tokens whose type is unknown (`space: { md: '1rem' }`); author them with typed constructors (`length.rem(1)`) or export with `strict: false`.

## Testing a design system

`@mszr/vanity/testing` (Node/test only):

```ts
import { emitOf, foldOf } from '@mszr/vanity/testing'
import { expect, it } from 'vitest'
import { ds } from '../design/system.ts'

it('the card compiles to the expected CSS', () => {
  const css = emitOf(() => ds.class({ padding: ds.t.space.md, background: ds.t.color.surface }, 'card'))
  expect(css).toContain('padding: var(--app-space-md)')
})

it('the spacing scale resolves at build time', () => {
  expect(foldOf(ds.t.space.md)).toBe('1rem')   // undefined when the value stays live CSS (e.g. light-dark colors)
})
```

- `emitOf(() => …)` / `captureEmission(() => …)` run style authoring in an isolated capture and return the CSS (and the produced handle).
- `foldOf(token)` / `foldResultOf(token)` report whether a token folded at build time and why.
- `renderOf(selector, props)` / `rendersLike(selector, expected)` read computed styles from a mounted DOM fixture (browser tests).
- `createVanityProjectConfig()` configures `@mszr/selenita` to assert completions, hovers, and diagnostics at a real cursor — for plugin and design-system authors who care about editor experience.
