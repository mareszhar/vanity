# vanity — consumer testing kit

`@mszr/vanity/testing` productizes the evidence helpers Vanity uses on itself. Design-system and plugin authors can lock emitted CSS, token folding, browser semantics, completions, hovers, and diagnostics without rebuilding Vanity's test infrastructure.

The entrypoint is Node/test-only. It never enters application or SSR bundles.

## 1. Install

For a Vitest suite with editor-DX checks:

```sh
pnpm add -D @mszr/vanity @mszr/selenita@^0.4.1 typescript@^6.0.3 vitest@^5.0.3 @types/node
```

Use Selenita 0.4 for editor-DX evidence. It is an optional peer of Vanity because ordinary styling, runtime, compiler, Vue, and Nuxt consumers do not need it. Its Vitest integration requires Vitest 5.0.3 or later within major 5. Selenita supplies its own TypeScript 6 language service, independently of the project's compiler. Vanity's compiler and lint tooling use TypeScript 6.

If your test tsconfig restricts `lib`, include `ESNext.Disposable` for Selenita's resource ownership and `DOM` for Vitest/Vite declarations. These declarations do not create a browser test environment.

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

Captures are synchronous because build-time authoring is synchronous. Systems must still be created and consolidated in plain TypeScript, exactly as in a real project.

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

Fold evidence belongs to an in-process resolved token handle. A token restored into application code retains runtime identity and values but not compiler reasoning; `foldOf(restoredToken)` therefore throws with the fix instead of fabricating a result. Call it on a token from a system consolidated in the test process.

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

## 5. Selenita configuration

`createVanityProjectConfig()` returns reusable Selenita configuration with a virtual system module available as `#vanity/system`. Pass it to Selenita's project constructor:

```TS
import { cursor, defineProject } from '@mszr/selenita/vitest'
import { createVanityProjectConfig } from '@mszr/vanity/testing'
import { expect, it } from 'vitest'

const project = defineProject(createVanityProjectConfig({
  tsconfig: './tsconfig.json',
  system: "export { ds } from './src/system'",
}))

it('discovers the styling surface', () => {
  const result = project.query`
    import { ds } from '#vanity/system'
    void ds.${cursor}
  `
  expect(result).toSuggest(['class', 'recipe', 'runtime'], {
    requireDocumentation: true,
  })
})
```

Declare `defineProject()` at module or `describe` scope; Vitest warms and disposes it for that scope. Standalone tools and projects created inside a test use `createProject()` from Selenita's core with `using` or explicit disposal. The Vanity configuration itself owns no resource and imports no test runner.

The default virtual module exports a minimal consolidated system, useful for testing a standalone helper. A design-system or plugin suite normally supplies `system` source that re-exports its real locked system.

The preset accepts Selenita's `tsconfig`, `compilerOptions`, `preferences`, `files`, `aliases` and `plugins`, plus:

| Option | Default | Purpose |
| --- | --- | --- |
| `system` | minimal consolidated system | Source of the virtual module; `false` omits it. |
| `systemFile` | `.vanity-system.ts` | Virtual path relative to the project root. |
| `systemAlias` | `#vanity/system` | Import specifier for that module. |

Caller `files` and `aliases` win on collision. Compose further Selenita configuration layers in the project constructor or `project.extend()`.

Import fixture helpers and project constructors from Selenita. Markers work across separate installed copies of the same Selenita version.

Use observations as matcher receivers so failures include source context; use `hover.displayText` for types, `hover.documentation` for prose, and named marks with `rangeOf()` for exact diagnostic underlines. Each observation reflects native editor behavior independently of assertion order. Scoped snippets and `atEach()` compare completion surfaces without repeating fixture source. Selenita's [promise guide](https://github.com/mareszhar/selenita/blob/main/docs/guide/promises.md) covers these patterns and native rename, import and repair actions.

Standalone tools and agents can use the same configuration with core `createProject()`. Read the observations needed for the job: `errors` for code, message and range; a selected completion's documentation for discovery; `signatureHelp.activeParameter` for argument guidance; and a diagnostic's `codeFixes` for native repairs. Recheck the corrected fixture in the same project. Observations are lazy, so read the data you intend to retain before disposal and create a fresh project after changing files on disk. Fixture diagnostics cover the supplied files; run the project's strict compiler separately to check imported sources and declarations.

For semantic troubleshooting, use [`ds.explain()`, `ds.introspect()` and `ds.audit()`](./spec-introspection.md) or the built manifest and CLI. These answer ownership, dependencies, emission and audit questions that TypeScript's editor service cannot decide. An audit's `unevaluated` categories identify missing evidence rather than asserting that an unobserved behavior is sound.

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

Vanity's release gate applies that policy to every named package value, the canonical open/locked surfaces, contextual token handles and controls, conditions, part conditions, generated auto-imports, and the packed testing entrypoint.
