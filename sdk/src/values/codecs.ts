/** DTCG codec identity and immutable storage for extension-backed values. */

import type { VanityDtcgCodec } from '../introspect/interchange'
import { throwValueError } from './error'

/** Installed authored-interchange codecs, keyed by their stable identity. */
export type DtcgCodecRegistry = readonly VanityDtcgCodec[]

/** Create an immutable codec registry from an initial set of codec definitions. */
export function createDtcgCodecRegistry(additions: readonly VanityDtcgCodec[] = []): DtcgCodecRegistry {
  return additions.length === 0
    ? Object.freeze([])
    : mergeDtcgCodecs(Object.freeze([]), additions)
}

/**
 * Add codecs to a registry while preserving stable identity and rejecting
 * malformed or duplicate registrations at the installation boundary.
 */
export function mergeDtcgCodecs(
  current: DtcgCodecRegistry,
  additions: readonly VanityDtcgCodec[] | undefined,
): DtcgCodecRegistry {
  if (additions === undefined || additions.length === 0)
    return current
  const codecs = [...current, ...additions]
  const identities = new Set<string>()
  for (const codec of codecs) {
    const identity = `${codec.id}@${codec.version}`
    if (!codec.id.trim() || !String(codec.version).trim() || !codec.extension.trim()) {
      throwValueError(
        'VANITY_VALUE_INVALID',
        'a DTCG codec needs non-empty id, version, and extension fields',
        'codec',
        'provide stable id, version, and extension fields',
      )
    }
    if (typeof codec.encode !== 'function' || typeof codec.decode !== 'function') {
      throwValueError(
        'VANITY_VALUE_INVALID',
        `DTCG codec '${identity}' needs encode() and decode() functions`,
        'codec',
        'provide callable encode() and decode() functions',
      )
    }
    if (identities.has(identity)) {
      throwValueError(
        'VANITY_VALUE_INVALID',
        `duplicate DTCG codec '${identity}'`,
        'codec',
        'register the codec identity only once',
      )
    }
    identities.add(identity)
  }
  return Object.freeze(codecs.map(codec => Object.freeze({ ...codec })))
}
