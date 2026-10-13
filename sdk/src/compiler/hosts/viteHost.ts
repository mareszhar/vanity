/**
 * Adapter-only coordination between the Nuxt wrapper and the Vite compiler.
 * This stays out of the public options so host-owned declaration generation
 * cannot make the user-facing style-import union less ergonomic.
 */
export const vanityViteHost = Symbol.for('@mszr/vanity/vite-host')

/** Host-owned project coordinates, independent of a framework's Vite application root. */
export interface VanityViteHostOptions {
  name: 'nuxt'
  root: string
}

export function configureVanityViteHost<T extends object>(options: T, host: 'nuxt', root: string): T {
  return Object.assign(options, { [vanityViteHost]: { name: host, root } satisfies VanityViteHostOptions })
}
