/**
 * Consumer evidence helpers: capture emitted CSS, inspect token folding,
 * assert rendered custom properties, and exercise editor DX with Selenita.
 */

import type { DefineProjectConfig } from '@mszr/selenita'
import { cursor, defineProject, group, snippet } from '@mszr/selenita'
import { removeAdapter, setAdapter } from '@vanilla-extract/css/adapter'
import { endFileScope, setFileScope } from '@vanilla-extract/css/fileScope'
import { tokenFoldOf } from './internal/foldEvidence'
import { transformVanityCss } from './internal/transformCss'

type Adapter = Parameters<typeof setAdapter>[0]
type CssObj = Parameters<Adapter['appendCss']>[0]

/** Options for one isolated build-time emission capture. */
export interface VanityEmissionOptions {
  /** Virtual style-module path used in debug names and diagnostics. */
  readonly file?: string
  /** Virtual package name used by vanilla-extract's file scope. */
  readonly package?: string
}

/** Emitted CSS together with the value returned by the author callback. */
export interface VanityEmission<T> {
  readonly css: string
  readonly value: T
}

/**
 * Run authoring code as an isolated style module and retain its result.
 *
 * @example
 * `const { css, value: button } = captureEmission(() => ds.class({ color: 'red' }))`
 */
export function captureEmission<T>(
  author: () => T,
  options: VanityEmissionOptions = {},
): VanityEmission<T> {
  if (typeof author !== 'function')
    throw new TypeError('[vanity] captureEmission() needs an author callback: () => ds.class({ ... })')

  const cssObjs: CssObj[] = []
  const localClassNames = new Set<string>()
  const adapter: Adapter = {
    appendCss: cssObj => void cssObjs.push(cssObj),
    registerClassName: className => void localClassNames.add(className),
    registerComposition: () => {},
    markCompositionUsed: () => {},
    onEndFileScope: () => {},
    getIdentOption: () => 'debug',
  }

  setAdapter(adapter)
  setFileScope(
    options.file ?? 'vanity.testing.css.ts',
    options.package ?? '@vanity/testing-fixture',
  )

  try {
    const value = author()
    const css = transformVanityCss(cssObjs as any, {
      localClassNames: [...localClassNames],
      composedClassLists: [],
    })
    return Object.freeze({ css, value })
  }
  finally {
    endFileScope()
    removeAdapter()
  }
}

/**
 * Capture the CSS emitted by one isolated authoring callback.
 *
 * @example
 * `expect(emitOf(() => ds.class({ color: 'red' }))).toMatchSnapshot()`
 */
export function emitOf(
  author: () => unknown,
  options?: VanityEmissionOptions,
): string {
  return captureEmission(author, options).css
}

/** Build-time folding evidence for a resolved token. */
export interface VanityFoldObservation {
  readonly status: 'folded' | 'preserved' | 'unavailable'
  readonly val?: string | number
  readonly reason?: string
}

/**
 * The minimal resolved-token identity needed by fold assertions.
 *
 * Concrete token handles satisfy this without widening their value type.
 */
export interface VanityFoldToken {
  readonly $name: `--${string}`
  readonly $path: string
}

/**
 * Return the complete fold decision for a token, including any refusal reason.
 *
 * @example
 * `expect(foldResultOf(ds.t.space.lg)).toEqual({ status: 'folded', val: '16px' })`
 */
export function foldResultOf(token: VanityFoldToken): VanityFoldObservation {
  return Object.freeze({ ...tokenFoldOf(token as any) })
}

/**
 * Return a token's folded value, or `undefined` when folding was preserved or unavailable.
 *
 * @example
 * `expect(foldOf(ds.t.color.onBrand)).toBe('oklch(0.98 0.02 264)')`
 */
export function foldOf(token: VanityFoldToken): string | number | undefined {
  const fold = foldResultOf(token)
  return fold.status === 'folded' ? fold.val : undefined
}

/**
 * Minimal element shape accepted by rendered-style helpers.
 *
 * Structural by design so Node-only test projects do not need the DOM type library.
 */
export interface VanityRenderElement {
  readonly ownerDocument?: {
    readonly defaultView?: unknown
  }
}

/** A selector or concrete element accepted by rendered-style helpers. */
export type VanityRenderTarget = string | VanityRenderElement

/** Exact or pattern-based computed-style expectation. */
export type VanityRenderExpectation = string | RegExp

/** Computed CSS property values keyed by their authored CSS names. */
export type VanityRenderedProperties<Properties extends string>
  = Readonly<Record<Properties, string>>

/**
 * Read selected computed CSS properties from an element or selector.
 *
 * @example
 * `renderOf('#app', ['--brand', 'color'])`
 */
export function renderOf<const Properties extends string>(
  target: VanityRenderTarget,
  properties: readonly Properties[],
): VanityRenderedProperties<Properties> {
  const element = resolveRenderTarget(target)
  const view = element.ownerDocument?.defaultView ?? globalThis
  const getComputedStyle = (
    view as typeof globalThis & {
      getComputedStyle?: (element: VanityRenderElement) => {
        getPropertyValue: (property: string) => string
      }
    }
  ).getComputedStyle

  if (typeof getComputedStyle !== 'function') {
    throw new TypeError(
      '[vanity] renderOf() needs a DOM with getComputedStyle(); run it in a browser or DOM test environment',
    )
  }

  const style = getComputedStyle.call(view, element)
  return Object.freeze(Object.fromEntries(
    properties.map(property => [property, style.getPropertyValue(property).trim()]),
  )) as VanityRenderedProperties<Properties>
}

/**
 * Build a predicate for `expect(system).toSatisfy(...)` over computed CSS properties.
 *
 * @example
 * `expect(ds).toSatisfy(rendersLike('#app', { '--brand': 'oklch(0.6 0.2 264)' }))`
 */
export function rendersLike(
  target: VanityRenderTarget,
  expected: Readonly<Record<string, VanityRenderExpectation>>,
): (system: unknown) => boolean {
  const properties = Object.keys(expected)
  return (system: unknown): boolean => {
    void system
    const actual = renderOf(target, properties)
    return properties.every((property) => {
      const expectation = expected[property]!
      const value = actual[property]!
      return typeof expectation === 'string'
        ? value === expectation
        : expectation.test(value)
    })
  }
}

function resolveRenderTarget(target: VanityRenderTarget): VanityRenderElement {
  if (typeof target !== 'string')
    return target

  const document = (
    globalThis as typeof globalThis & {
      document?: {
        querySelector: (selector: string) => VanityRenderElement | null
      }
    }
  ).document
  if (!document) {
    throw new TypeError(
      `[vanity] rendersLike() cannot resolve selector '${target}' without a DOM document`,
    )
  }

  const element = document.querySelector(target)
  if (!element) {
    throw new TypeError(
      `[vanity] rendersLike() could not find '${target}'; mount the fixture before asserting rendered values`,
    )
  }
  return element
}

/** Configuration for a Selenita project prewired with `#vanity/system`. */
export interface VanityProjectConfig extends DefineProjectConfig {
  /**
   * Complete source for the virtual `#vanity/system` module.
   *
   * @example
   * `system: "export { ds } from './src/system'"`
   */
  readonly system?: string | false
  /** Override the virtual system file; relative paths resolve from the project root. */
  readonly systemFile?: string
  /** Override the import alias exposed to editor-DX snippets. */
  readonly systemAlias?: string
}

const DEFAULT_SYSTEM_SOURCE = `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().consolidate()
`

/**
 * Create a Selenita project with a virtual Vanity system module already aliased.
 *
 * @example
 * `const project = defineVanityProject({ system: "export { ds } from './src/system'" })`
 */
export function defineVanityProject(config: VanityProjectConfig = {}): ReturnType<typeof defineProject> {
  const {
    aliases = {},
    files = {},
    system = DEFAULT_SYSTEM_SOURCE,
    systemAlias = '#vanity/system',
    systemFile = '.vanity-system.ts',
    ...project
  } = config

  return defineProject({
    ...project,
    files: {
      ...(system === false ? {} : { [systemFile]: system }),
      ...files,
    },
    aliases: {
      ...(system === false ? {} : { [systemAlias]: `./${systemFile}` }),
      ...aliases,
    },
  })
}

/** Selenita cursor marker re-exported so plugin DX suites need one import. */
export { cursor }
/** Selenita parity-group helper re-exported so plugin DX suites need one import. */
export { group }
/** Selenita reusable-snippet helper re-exported so plugin DX suites need one import. */
export { snippet }
