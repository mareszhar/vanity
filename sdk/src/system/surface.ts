import { VanityError } from '../diagnostics'

/** Versioned namespaces shared by system extensions and finalized systems. */

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
  'explain',
  'audit',
  'conditions',
  'layers',
  'axes',
  'consts',
  'policies',
  'introspect',
] as const)

/** Names owned by every locked system surface and unavailable to extensions. */
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

/** Names of constructors installed on every canonical system. */
export type VanityBuiltinConstructorName = typeof VANITY_BUILTIN_CONSTRUCTOR_NAMES[number]

const SYSTEM_MEMBER_SET: ReadonlySet<string> = new Set(VANITY_SYSTEM_MEMBERS)
const OBJECT_PROTOTYPE_MEMBER_SET: ReadonlySet<string> = new Set(Object.getOwnPropertyNames(Object.prototype))

export function assertSystemNamespaceAvailable(names: Iterable<string>, owner: string): void {
  for (const name of names) {
    if (SYSTEM_MEMBER_SET.has(name) || OBJECT_PROTOTYPE_MEMBER_SET.has(name)) {
      const reason = SYSTEM_MEMBER_SET.has(name)
        ? `reserved by system surface v${VANITY_SYSTEM_SURFACE_VERSION}`
        : 'reserved because it shadows an Object.prototype member'
      throw new VanityError({
        code: 'VANITY_SYSTEM_COLLISION',
        message: `${owner} cannot define '${name}' because it is ${reason}`,
        path: name,
        fix: 'choose a name outside the locked system surface and Object.prototype; system members cannot be extended or replaced',
      })
    }
  }
}
