/** Stable virtual-CSS ownership and dependency state used by compiler HMR. */

import type { VanityPortableSystem } from '../../system/contract'
import { join, resolve } from 'node:path'
import { normalizePath } from '../core/path'
import { isSameAuthoredFile } from '../core/systems'

/** Return the one canonical virtual module address for a system CSS identity. */
export function getSystemCssVirtualId(
  cssIdentity: string,
  root: string,
  virtualExtension: string,
): string {
  return normalizePath(join(
    resolve(root),
    '.vanity',
    'virtual',
    'system',
    `${cssIdentity}${virtualExtension}`,
  ))
}

/** CSS owners are keyed by kind so a style path and system entry never alias accidentally. */
export type CssOwnerKey = `style:${string}` | `system:${string}`

/**
 * Replace one entry's virtual stylesheet set and remove no-longer-used CSS.
 *
 * `owners` is shared by style and system entries. Keeping it separate from
 * either entry map is what lets a system generation move from one CSS id to
 * another while an already-transformed style still owns the old id.
 */
export function replaceEntryVirtualIds(
  entry: string,
  next: Set<string>,
  byEntry: Map<string, Set<string>>,
  css: Map<string, string>,
  owners?: Map<string, Set<string>>,
  ownerKey: CssOwnerKey | string = entry,
  rememberPendingCssResponse?: (id: string, contents: string) => void,
): Set<string> {
  const previous = byEntry.get(entry) ?? new Set<string>()
  const retired = new Set<string>()
  byEntry.set(entry, new Set(next))

  for (const added of next) {
    if (owners === undefined)
      continue
    const entries = owners.get(added) ?? new Set<string>()
    entries.add(ownerKey)
    owners.set(added, entries)
  }

  for (const removed of previous) {
    if (next.has(removed))
      continue

    if (owners !== undefined) {
      const entries = owners.get(removed)
      entries?.delete(ownerKey)
      if (entries?.size === 0)
        owners.delete(removed)
    }

    const stillUsed = owners !== undefined
      ? owners.has(removed)
      : [...byEntry.entries()].some(([other, ids]) =>
          other !== entry && ids.has(removed))
    if (!stillUsed) {
      const contents = css.get(removed)
      if (contents !== undefined)
        rememberPendingCssResponse?.(removed, contents)
      css.delete(removed)
      retired.add(removed)
    }
  }

  return retired
}

/** Resolve a requested authored stylesheet path to its semantic system id. */
export function resolveCssVirtualAlias(
  requested: string,
  root: string,
  virtualExtension: string,
  css: ReadonlyMap<string, string>,
  namespaces: ReadonlyMap<string, ReadonlyMap<string, VanityPortableSystem>>,
): string | undefined {
  if (css.has(requested))
    return requested

  const authored = requested.slice(0, -virtualExtension.length)
  for (const owners of namespaces.values()) {
    for (const system of owners.values()) {
      if (!isSameAuthoredFile(authored, system.source, root))
        continue
      const semantic = getSystemCssVirtualId(system.identities.css, root, virtualExtension)
      if (css.has(semantic))
        return semantic
    }
  }
  return undefined
}
