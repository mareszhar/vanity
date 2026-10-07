# The runtime: live values, settings panels, persistence

The runtime controller changes only what the system declared changeable: `mutable` tokens and activatable axis modes. It writes custom-property slots and data attributes on the root element; the browser's cascade does the rest. No CSS is generated at runtime and no design logic is recomputed in JavaScript.

## Basics

```ts
const rt = ds.runtime()                      // with autoImports.shared, `ds` needs no import in components, composables, or plugins

rt.t.color.hue.$set(140)                     // typed by the token: numbers, lengths, colors, …
rt.t.radius.seed.$set('12px')
rt.t.color.hue.$unset()                      // back to the authored value (follows source edits/HMR)

rt.axes.scheme.$switchTo('dark')
rt.axes.density.$cycle()
rt.axes.density.$current()                   // 'compact' | 'comfortable' | … | undefined

rt.transaction((tx) => {                     // validate everything first, then write once
  tx.t.color.hue.$set(30)
  tx.axes.density.$switchTo('compact')
})

const snapshot = rt.snapshot()               // JSON-safe semantic state to persist
rt.hydrate(snapshot)                         // apply a saved state
```

- Never write `--app-*` properties or `data-*` mode attributes by hand: mutable tokens use private slot names, and the runtime also keeps `color-scheme` and snapshot state in sync.
- Only tokens declared `mutable: true` expose `$set`/`$unset`; only activatable modes appear in `$switchTo`'s type.
- Create the runtime on the client (`onMounted`, a client plugin, or after hydration). It finds the system root (`:root` or the configured selector) lazily.
- `ds.runtime({ within: element })` narrows where the controller *looks* for the declared root selector: the root (e.g. an element matching the system's `root`, or a rooted module's selector) must exist inside `element`. It doesn't turn an arbitrary element into a root; a preview pane without a matching root fails. Use it to target one of several repeated widgets. `rt.bindRoot('$system', element)` pins a specific element as the root explicitly.

## A settings / tweak panel

Live tweaking is the runtime's main job: a designer drags a slider, the whole UI updates, nothing is regenerated.

1. Make each tweakable decision a **seed** token in the system: `mutable: true` (add `register: true` for numbers you want animatable/typed). Derive the rest from the seeds so one control moves a coherent set: radius scale from `radius.seed`, palette from `color.hue`, spacing from a `space.unit`.
2. Make each discrete choice an **axis** (density, contrast, skin, scheme).
3. Keep **one controller per root** and let every caller reach it. Creating a second controller for the same root supersedes the first, and the first one's later writes throw (`runtime binding was superseded`):

```ts
// composables/designRuntime.ts
let runtime: ReturnType<typeof ds.runtime> | undefined

/** The page's one runtime controller. Client-only: on the server a module-level instance would be shared between requests. */
export function useDesignRuntime(options?: Parameters<typeof ds.runtime>[0]) {
  runtime ??= ds.runtime(options)   // options apply only to the call that creates it
  return runtime
}
```

4. Write one composable that maps a settings object onto that runtime, so the live page and saved snapshots never disagree:

```ts
// composables/useDesignSettings.ts
export interface DesignSettings {
  hue: number
  radius: number
  density: 'compact' | 'comfortable'
  scheme: 'system' | 'light' | 'dark'
}

// Read authored defaults from the system instead of copying the numbers.
export const defaults: DesignSettings = {
  hue: ds.t.color.hue.$val,
  radius: 8,
  density: 'comfortable',
  scheme: 'system',
}

type Runtime = ReturnType<typeof ds.runtime>

/** Describe the settings as runtime writes. Defaults stay absent so the authored values rule. */
function apply(rt: Runtime, s: DesignSettings) {
  rt.transaction((tx) => {
    if (s.hue !== defaults.hue)
      tx.t.color.hue.$set(s.hue)
    if (s.radius !== defaults.radius)
      tx.t.radius.seed.$set(`${s.radius}px`)
    if (s.density !== defaults.density)
      tx.axes.density.$switchTo(s.density)
    if (s.scheme !== 'system')
      tx.axes.scheme.$switchTo(s.scheme)
  })
}

/** A DOM-free snapshot of the settings; hydrating it also clears anything it doesn't set. */
export function snapshotOf(s: DesignSettings) {
  return ds.snapshotFrom(draft => apply(draft, s))
}

export function useDesignSettings() {
  const settings = useCookie<DesignSettings>('design-settings', {
    default: () => ({ ...defaults }),
    maxAge: 60 * 60 * 24 * 365,      // without it the cookie ends with the browser session
  })
  let rt: Runtime | undefined

  onMounted(() => {
    rt = useDesignRuntime({ initial: snapshotOf(settings.value) })   // shared: any number of callers
  })

  watch(settings, (next) => {
    rt?.hydrate(snapshotOf(next))
  }, { deep: true })

  return { settings, reset: () => (settings.value = { ...defaults }) }
}
```

`'system'` isn't a scheme mode: it means "don't pin", so the runtime leaves the scheme to the OS. The same goes for an axis's `'&'` default: you return to it by not setting the axis.

Treat saved settings as untrusted input: clamp numbers to their designed range and fall back to the default for unknown modes before building a snapshot, so a stale cookie can't push an invalid value into the runtime.

Leaving defaults out of the snapshot keeps the authored values in charge, so editing the system file still shows up live. Hydrating a snapshot reconciles: anything the new snapshot no longer sets (a mode switched back to its default, a value reset) is removed. The default mode of an axis written as `'&'` isn't something you switch *to*; you return to it by not setting the axis.

Expose controls whose ranges are designed, not arbitrary: clamp the hue's chroma/lightness in the system so every hue stays legible; give radius a range that suits the components.

## Without SSR (`ssr: false`)

Create the shared runtime before the app mounts, in a client plugin, so the first paint already uses the saved settings. `useDesignSettings()` later receives the same controller:

```ts
// plugins/design-settings.client.ts
export default defineNuxtPlugin(() => {
  const saved = useCookie<DesignSettings>('design-settings').value
  if (saved)
    useDesignRuntime({ initial: snapshotOf(saved) })
})
```

## SSR without a flash

With SSR, apply saved settings to the server-rendered root so the first paint is already correct:

```ts
const seed = snapshotOf(settings.value)               // DOM-free, works on the server
const rootProps = ds.runtimeProps(seed).$system!     // { attributes, style }; `!` because module roots are keyed too
```

```vue
<template lang="pug">
div#app(v-bind="rootProps.attributes" :style="rootProps.style")
</template>
```

(When the system root is `:root`/`html`, set them through `useHead({ htmlAttrs: { …attributes, style } })`.) On the client, `useDesignSettings()` creates the shared runtime with the same snapshot (`initial`), so hydration validates that state without rewriting it.

## Per-instance values are not runtime values

A value that belongs to one component instance (a progress fraction, a per-tag color) is a port with `usePorts` (see `vanity-styling`). The runtime is for system-wide decisions.
