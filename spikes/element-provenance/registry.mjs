/** Prototype of compiler-emitted development registration, not a network protocol. */
import { createHash } from 'node:crypto'

export function hashSource(contents) {
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`
}

export function emitSourceRegistration(sourceId, contents) {
  return `\nif (typeof window !== 'undefined') { (window.__vanitySources ??= Object.create(null))[${JSON.stringify(sourceId)}] = ${JSON.stringify(hashSource(contents))} }\n`
}

export function inspectSource(disk, ran) {
  return { disk, ...(ran === undefined ? {} : { ran }), loaded: ran === undefined ? 'unverified' : disk === ran }
}
