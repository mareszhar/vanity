/**
 * Adapter-only coordination between the Nuxt wrapper and the Vite compiler.
 * This stays out of the public options so host-owned declaration generation
 * cannot make the user-facing style-import union less ergonomic.
 */
export const vanityViteHost = Symbol.for('@mszr/vanity/vite-host')

export function withVanityViteHost<T extends object>(options: T, host: 'nuxt'): T {
  return Object.assign(options, { [vanityViteHost]: host })
}
