/**
 * Render the Nuxt schema augmentation that documents the `vanity` config key.
 * The generated file is included in Nuxt's type graph after module discovery,
 * so its property documentation is available at the actual config cursor.
 */
export function renderVanityNuxtConfigTypes(): string {
  return `
export {}

type VanityNuxtConfigValue = Partial<import('@mszr/vanity/nuxt').VanityNuxtOptions> | false

declare module '@nuxt/schema' {
  interface NuxtConfig {
    /**
     * Vanity's Nuxt adapter configuration. \`compiler\` configures Vanity's
     * compiler and \`autoImports\` routes sources into module roles.
     */
    vanity?: VanityNuxtConfigValue
  }
}

declare module 'nuxt/schema' {
  interface NuxtConfig {
    /**
     * Vanity's Nuxt adapter configuration. \`compiler\` configures Vanity's
     * compiler and \`autoImports\` routes sources into module roles.
     */
    vanity?: VanityNuxtConfigValue
  }
}
`
}
