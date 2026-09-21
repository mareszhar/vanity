/** Stable virtual-CSS ownership and dependency state used by compiler HMR. */

import { isAbsolute, join, resolve } from 'node:path'
import { getRootRelativeModulePath, normalizePath } from '../core/path'

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

/**
 * Return the one canonical virtual module address for a style source.
 *
 * The address encodes the source's root-relative path as an up-level count
 * plus the remaining segments, so every source maps to exactly one address
 * under the artifact directory and the address maps back to exactly one
 * source. It is derived from the source path, never from the stylesheet's
 * content: the address must stay stable across edits so a save replaces the
 * browser's style tag instead of appending a second one.
 *
 * `sourcePath` is the file scope's path, root-relative or absolute — a bare
 * relative path is already relative to the root, while an absolute one is
 * made relative. Either spelling of one source names one address.
 */
export function getStyleCssVirtualId(
  sourcePath: string,
  root: string,
  virtualExtension: string,
): string {
  const relative = normalizePath(isAbsolute(sourcePath)
    ? getRootRelativeModulePath(sourcePath, root)
    : sourcePath)
  const segments = relative.split('/')
  let ups = 0
  while (segments[ups] === '..')
    ups += 1
  const rest = segments.slice(ups)
  if (rest.length === 0 || rest.some(segment => segment.length === 0))
    throw new TypeError(`Vanity cannot address a stylesheet for '${sourcePath}': it names no source file`)
  return normalizePath(join(
    resolve(root),
    '.vanity',
    'virtual',
    'style',
    String(ups),
    ...rest.slice(0, -1),
    `${rest[rest.length - 1]}${virtualExtension}`,
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
