import type { Typeface } from 'design/base.css.ts'

import { typefaces } from 'design/base.css.ts'

/**
 * The studio's live design decisions. Every field maps to one system input:
 * mutable tokens (hue, radius, typeface) or environmental axes (scheme, density,
 * motion). Nothing here redefines a color or a curve — the runtime only moves
 * the values the design system already declared.
 */
export interface StudioSettings {
  hue: number
  radius: number
  scheme: 'system' | 'light' | 'dark'
  density: 'compact' | 'cozy' | 'spacious'
  motion: 'none' | 'subtle' | 'springy'
  typeface: Typeface
}

export const schemes = ['system', 'light', 'dark'] as const
export const densities = ['compact', 'cozy', 'spacious'] as const
export const motions = ['none', 'subtle', 'springy'] as const
export const typefaceNames = ['sans', 'serif', 'mono'] as const

export const defaults: StudioSettings = {
  hue: 275,
  radius: 12,
  scheme: 'system',
  density: 'cozy',
  motion: 'subtle',
  typeface: 'sans',
}

/**
 * Fixed points in the space of possible systems — the same generator the
 *  randomizer uses, pinned where we know a distinct identity emerges.
 */
export const presets: { name: string, settings: StudioSettings }[] = [
  { name: 'Prism', settings: { ...defaults } },
  { name: 'Ember', settings: { hue: 32, radius: 6, scheme: 'light', density: 'cozy', motion: 'subtle', typeface: 'sans' } },
  { name: 'Meadow', settings: { hue: 150, radius: 20, scheme: 'light', density: 'spacious', motion: 'springy', typeface: 'serif' } },
  { name: 'Signal', settings: { hue: 12, radius: 2, scheme: 'dark', density: 'compact', motion: 'none', typeface: 'mono' } },
  { name: 'Tide', settings: { hue: 220, radius: 16, scheme: 'dark', density: 'cozy', motion: 'subtle', typeface: 'sans' } },
  { name: 'Orchid', settings: { hue: 320, radius: 24, scheme: 'light', density: 'cozy', motion: 'springy', typeface: 'serif' } },
]

type Runtime = ReturnType<typeof ds.runtime>

/**
 * One place that maps settings onto the runtime, so the seed snapshot and the
 *  live root always agree. Authored defaults are `$unset`, not re-set — editing
 *  a default in source keeps flowing through HMR.
 */
function applyTo(rt: Runtime, s: StudioSettings): void {
  rt.transaction((tx) => {
    s.hue === defaults.hue ? tx.t.color.hue.$unset() : tx.t.color.hue.$set(s.hue)
    s.radius === defaults.radius ? tx.t.radius.seed.$unset() : tx.t.radius.seed.$set(`${s.radius}px`)

    // The loaded faces carry hashed family names, so the typeface always comes
    // from the runtime rather than the token's plain fallback default.
    tx.t.font.family.$set(typefaces[s.typeface])
    tx.t.font.mono.$set(typefaces.mono)

    if (s.scheme !== 'system')
      tx.axes.scheme.$switchTo(s.scheme)
    if (s.density !== defaults.density)
      tx.axes.density.$switchTo(s.density)
    if (s.motion !== defaults.motion)
      tx.axes.motion.$switchTo(s.motion)
  })
}

/**
 * A DOM-free snapshot for SSR and live reconciliation. Automatic/default modes
 * stay absent, so hydrating the snapshot also removes a previously pinned
 * attribute when a control returns to its authored default.
 */
function buildSnapshot(s: StudioSettings) {
  return ds.snapshotFrom(runtime => applyTo(runtime, s))
}

function normalize(input: Partial<StudioSettings> | null | undefined): StudioSettings {
  const candidate = input ?? defaults
  const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
    (typeof value === 'string' && options.includes(value as T)) ? value as T : fallback
  const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

  return {
    hue: clamp(candidate.hue, 0, 360, defaults.hue),
    radius: clamp(candidate.radius, 0, 28, defaults.radius),
    scheme: oneOf(schemes, candidate.scheme, defaults.scheme),
    density: oneOf(densities, candidate.density, defaults.density),
    motion: oneOf(motions, candidate.motion, defaults.motion),
    typeface: oneOf(typefaceNames, candidate.typeface, defaults.typeface),
  }
}

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const randomOf = <T>(values: readonly T[]): T => values[Math.floor(Math.random() * values.length)]!

export type StudioContext = ReturnType<typeof useStudio>
export const studioKey = Symbol('prism-studio') as InjectionKey<StudioContext>

/** Reach the single studio instance provided by `app.vue`. */
export function useStudioContext(): StudioContext {
  const context = inject(studioKey)
  if (!context)
    throw new Error('useStudioContext must be used under the studio root')
  return context
}

export function useStudio() {
  const cookie = useCookie<StudioSettings>('prism-studio', {
    default: () => ({ ...defaults }),
    sameSite: 'lax',
  })
  const settings = ref(normalize(cookie.value))

  const seed = buildSnapshot(settings.value)
  const rootProps = shallowRef(ds.runtimeProps(seed).$system!)
  let runtime: Runtime | undefined

  function bind(el: HTMLElement): void {
    runtime = ds.runtime({ within: el, initial: seed })
  }

  watch(settings, (next) => {
    cookie.value = { ...next }
    if (runtime) {
      const snapshot = buildSnapshot(next)
      runtime.hydrate(snapshot)
      rootProps.value = ds.runtimeProps(snapshot).$system!
    }
  }, { deep: true })

  function patch(change: Partial<StudioSettings>): void {
    settings.value = { ...settings.value, ...change }
  }

  function reset(): void {
    settings.value = { ...defaults }
  }

  function surprise(): void {
    settings.value = {
      hue: randomInt(0, 359),
      radius: randomInt(0, 26),
      scheme: randomOf(['light', 'dark'] as const),
      density: randomOf(densities),
      motion: randomOf(motions),
      typeface: randomOf(typefaceNames),
    }
  }

  return { settings, rootProps, bind, patch, reset, surprise }
}
