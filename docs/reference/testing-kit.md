# vanity — consumer testing kit

`@mszr/vanity/testing` productizes the evidence helpers Vanity uses on itself. Design-system and plugin authors can lock emitted CSS, token folding, browser semantics, completions, hovers, and diagnostics without rebuilding Vanity's test infrastructure.

The entrypoint is Node/test-only. It never enters application or SSR bundles.

## 1. Install

Install Selenita and TypeScript only in projects that exercise editor DX:

```sh
pnpm add -D @mszr/vanity @mszr/selenita typescript vitest
```

`@mszr/selenita` is an optional peer of Vanity because ordinary styling, runtime, compiler, Vue, and Nuxt consumers do not need it. Selenita requires TypeScript 6 or newer.

## 2. Emitted CSS

Create the plain system outside the capture. Put only style-module authoring in the callback:

```TS
import { createSystem } from '@mszr/vanity'
import { captureEmission, emitOf } from '@mszr/vanity/testing'

const ds = createSystem()
  .addTokens({ color: { brand: '#635bff' } })
  .consolidate({ prefix: 'app' })

const css = emitOf(() =>
  ds.class({ color: ds.t.color.brand }, 'button'),
)

const result = captureEmission(() =>
  ds.recipe({
    base: { color: ds.t.color.brand },
    variants: { tone: { quiet: { opacity: 0.72 } } },
  }),
)

void css
void result.css
void result.value
```

`emitOf()` returns the exact transformed CSS string. `captureEmission()` also returns the class, recipe, anatomy, keyframes name, or other value produced by the callback.

The callback boundary is deliberate. CSS is emitted while a style module executes; a class string or already-created handle does not retain a private stylesheet copy. Asking for `emitOf(button)` after that event would either be impossible or require a hidden global registry. `emitOf(() => buttonAuthoring())` keeps ownership and execution explicit.

Each capture has an isolated Vanilla Extract adapter and file scope. Optional `file` and `package` names make snapshot debug IDs intentional:

```TS
const css = emitOf(
  () => ds.class({ display: 'grid' }, 'layout'),
  { file: 'src/layout.css.ts', package: '@acme/design' },
)

void css
```

Captures are synchronous because build-plane authoring is synchronous. Systems must still be created and consolidated in plain TypeScript, exactly as in a real project.

## 3. Token folding

```TS
import { foldOf, foldResultOf } from '@mszr/vanity/testing'

const folded = foldOf(ds.t.color.brand)
const decision = foldResultOf(ds.t.color.brand)

void folded
void decision.status
void decision.reason
```

`foldOf(token)` returns the folded `string | number`, or `undefined` when the expression was deliberately preserved or no preview is available. `foldResultOf(token)` returns the complete stable observation:

```TS
type FoldObservation = {
  status: 'folded' | 'preserved' | 'unavailable'
  val?: string | number
  reason?: string
}
```

Fold evidence belongs to the build plane. A token restored into application code retains runtime identity and values but not compiler reasoning; `foldOf(restoredToken)` therefore throws with the fix instead of fabricating a result. Call it on a token from a system consolidated in the test process.

## 4. Rendered CSS

```TS
import { renderOf, rendersLike } from '@mszr/vanity/testing'

const actual = renderOf('#app', ['--app-color-brand', 'color'])

const matches = rendersLike('#app', {
  '--app-color-brand': 'oklch(0.6 0.2 264)',
  color: /^rgb\(/,
})

void actual
void matches(ds)
```

`renderOf()` reads named properties from the browser's `getComputedStyle()`. `rendersLike()` returns a predicate so assertion libraries with `toSatisfy` can read naturally:

```TS
expect(ds).toSatisfy(rendersLike('#app', {
  '--app-color-brand': 'oklch(0.6 0.2 264)',
}))
```

Expected values may be exact strings or regular expressions. Values are trimmed, but never reparsed or normalized by Vanity; the browser remains the semantic authority.

These helpers inspect a mounted fixture. They do not inject captured CSS or create a DOM. A missing document, selector, or `getComputedStyle()` reports the exact missing test setup.

## 5. Selenita preset

`defineVanityProject()` wraps Selenita's `defineProject()` and injects one virtual system module, available as `#vanity/system`:

```TS
import {
  cursor,
  defineVanityProject,
} from '@mszr/vanity/testing'
import '@mszr/selenita/vitest'

const project = defineVanityProject({
  tsconfig: './tsconfig.json',
  system: "export { ds } from './src/system'",
})

const result = project.query`
  import { ds } from '#vanity/system'
  void ds.${cursor}
`

expect(result.completions).toContainCompletions([
  'class',
  'recipe',
  'runtime',
])
```

The default virtual module exports a minimal consolidated system, useful for testing a standalone helper. A design-system or plugin suite normally provides `system` source that re-exports its real locked system.

The complete configuration surface is:

```TS
const project = defineVanityProject({
  tsconfig: './tsconfig.json',
  system: "export { ds } from './src/system'",
  systemFile: '.vanity-system.ts',
  systemAlias: '#vanity/system',
  files: {},
  aliases: {},
})

void project
```

Set `system: false` to keep the wrapper's file/alias merging without injecting a system. User `files` and `aliases` win on collision.

`cursor`, `group`, and `snippet` are re-exported from Selenita so a plugin DX suite needs one ordinary import. Matchers stay an explicit `@mszr/selenita/vitest` side-effect import; Vanity does not silently choose a test runner.

## 6. Required plugin evidence

A first-class Vanity extension should prove:

| Surface | Minimum evidence |
| --- | --- |
| output | `emitOf()` snapshot or exact assertion |
| semantic folding | `foldOf()` or `foldResultOf()` |
| browser cascade | `rendersLike()` in a real browser fixture |
| discovery | completion at the real authoring cursor |
| readability | hover excludes internal machinery and unexpected `any` |
| mistakes | one local diagnostic with the valid fix in reach |
| package boundary | the same Selenita assertion against packed declarations |

Vanity's release gate applies that policy to every named package value, the canonical open/locked surfaces, token phases, conditions, part conditions, generated auto-imports, and the packed testing entrypoint.
