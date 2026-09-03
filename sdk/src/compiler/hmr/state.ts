/** Stable virtual-CSS ownership and dependency state used by compiler HMR. */

import type { VanityPortableSystemV2 } from '../../system/contract'
import { join } from 'node:path'
import { isSameAuthoredFile } from '../core/systems'
import { normalizePath } from '../path'

/** Replace one entry's virtual stylesheet set and remove no-longer-used CSS. */
export function replaceEntryVirtualIds(
  entry: string,
  next: Set<string>,
  byEntry: Map<string, Set<string>>,
  css: Map<string, string>,
): void {
  const previous = byEntry.get(entry) ?? new Set<string>()
  byEntry.set(entry, next)
  for (const removed of previous) {
    if (next.has(removed))
      continue
    const stillUsed = [...byEntry.entries()].some(([other, ids]) =>
      other !== entry && ids.has(removed))
    if (!stillUsed)
      css.delete(removed)
  }
}

/** Resolve a requested authored stylesheet path to its semantic system id. */
export function resolveCssVirtualAlias(
  requested: string,
  root: string,
  virtualExtension: string,
  css: ReadonlyMap<string, string>,
  namespaces: ReadonlyMap<string, ReadonlyMap<string, VanityPortableSystemV2>>,
): string | undefined {
  if (css.has(requested))
    return requested

  const authored = requested.slice(0, -virtualExtension.length)
  for (const owners of namespaces.values()) {
    for (const system of owners.values()) {
      if (!isSameAuthoredFile(authored, system.source, root))
        continue
      const semantic = normalizePath(join(
        root,
        '.vanity',
        'virtual',
        'system',
        `${system.identities.css}${virtualExtension}`,
      ))
      if (css.has(semantic))
        return semantic
    }
  }
  return undefined
}
