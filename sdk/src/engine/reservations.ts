/** Versioned namespaces shared by engine extensions and finalized systems. */

/** Current reserved system namespace version: `VANITY_SYSTEM_SURFACE_VERSION === 2`. */
export const VANITY_SYSTEM_SURFACE_VERSION = 2 as const

/** Public names reserved by every locked system: `VANITY_SYSTEM_MEMBERS.includes('class')`. */
export const VANITY_SYSTEM_MEMBERS = Object.freeze([
  't',
  'class',
  'rules',
  'raw',
  'fragment',
  'omit',
  'tdec',
  'keyframes',
  'fontFace',
  'recipe',
  'anatomy',
  'port',
  'atoms',
  'inLayer',
  'tokensOf',
  'namesOf',
  'varsOf',
  'runtime',
  'snapshotFrom',
  'runtimeStyle',
  'runtimeProps',
  'reconcileRuntimeSnapshot',
  'serialize',
  'manifest',
  'explain',
  'audit',
  'conditions',
  'layers',
] as const)

export type VanitySystemMember = typeof VANITY_SYSTEM_MEMBERS[number]

/** Constructor names installed by the canonical system: `VANITY_BUILTIN_CONSTRUCTOR_NAMES.includes('oklch')`. */
export const VANITY_BUILTIN_CONSTRUCTOR_NAMES = Object.freeze([
  'alpha',
  'angle',
  'calc',
  'channel',
  'clamp',
  'color',
  'colorMix',
  'customProperty',
  'darken',
  'desaturate',
  'displayP3',
  'flex',
  'frequency',
  'fluid',
  'grid',
  'hsl',
  'hwb',
  'integer',
  'interpolate',
  'lab',
  'lch',
  'legibleOn',
  'length',
  'lightDark',
  'lighten',
  'max',
  'min',
  'mix',
  'number',
  'oklab',
  'oklch',
  'percent',
  'rawValue',
  'resolution',
  'rgb',
  'rotate',
  'saturate',
  'time',
] as const)

export type VanityBuiltinConstructorName = typeof VANITY_BUILTIN_CONSTRUCTOR_NAMES[number]

const SYSTEM_MEMBER_SET: ReadonlySet<string> = new Set(VANITY_SYSTEM_MEMBERS)
const RESERVED_INTERNAL_MEMBERS: ReadonlySet<string> = new Set([
  'css',
  'globalCss',
  'tokenOverride',
])

export function assertSystemNamespaceAvailable(names: Iterable<string>, owner: string): void {
  for (const name of names) {
    if (SYSTEM_MEMBER_SET.has(name) || RESERVED_INTERNAL_MEMBERS.has(name)) {
      throw new TypeError(
        `[vanity] ${owner} cannot define '${name}' because it is reserved by system surface v${VANITY_SYSTEM_SURFACE_VERSION}`,
      )
    }
  }
}
