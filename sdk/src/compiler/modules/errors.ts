/** Shared authored build diagnostics for application hosts and check. */
import { isAbsolute, join, posix } from 'node:path'
import { VanityError } from '../../diagnostics'
import { normalizePath } from '../core/path'

/** Files named by an esbuild failure, including note locations. */
export function buildFailureFiles(error: unknown, root: string): string[] {
  return buildFailureLocations(error, root).map(location => location.file)
}

interface BuildFailureLocation {
  file: string
  line?: number
  column?: number
  text?: string
}

function buildFailureLocations(error: unknown, root: string): BuildFailureLocation[] {
  if (error === null || typeof error !== 'object' || !('errors' in error) || !Array.isArray(error.errors))
    return []

  const locations = new Map<string, BuildFailureLocation>()
  const visit = (entry: unknown): void => {
    if (entry === null || typeof entry !== 'object')
      return

    if ('location' in entry && entry.location !== null && typeof entry.location === 'object'
      && 'file' in entry.location && typeof entry.location.file === 'string' && entry.location.file.length > 0) {
      const file = entry.location.file
      const normalized = normalizePath(isAbsolute(file) ? file : join(root, file))
      const line = 'line' in entry.location && typeof entry.location.line === 'number' ? entry.location.line : undefined
      const column = 'column' in entry.location && typeof entry.location.column === 'number' ? entry.location.column + 1 : undefined
      const text = 'text' in entry && typeof entry.text === 'string' ? entry.text : undefined
      locations.set(`${normalized}:${line ?? ''}:${column ?? ''}`, {
        file: normalized,
        ...(line === undefined ? {} : { line }),
        ...(column === undefined ? {} : { column }),
        ...(text === undefined ? {} : { text }),
      })
    }

    if ('notes' in entry && Array.isArray(entry.notes))
      entry.notes.forEach(visit)
  }

  error.errors.forEach(visit)
  return [...locations.values()]
}

export function createStyleBuildError(error: unknown, entry: string, root: string, hasLastGoodCss = false): unknown {
  const cssDetail = 'Last successful CSS is retained; it does not include this failed edit.'
  if (error instanceof VanityError
    || (error !== null && typeof error === 'object' && 'name' in error
      && error.name === 'VanityError' && 'diagnostics' in error)) {
    if (!hasLastGoodCss || (error as VanityError).diagnostics.every(diagnostic => diagnostic.detail?.includes(cssDetail)))
      return error
    return new VanityError((error as VanityError).diagnostics.map(diagnostic => ({
      ...diagnostic,
      detail: [...diagnostic.detail ?? [], cssDetail],
    })), { cause: error })
  }

  const [primary] = buildFailureLocations(error, root)
  const entryFile = getAuthoredFile(entry, root)
  const primaryFile = primary === undefined ? entryFile : getAuthoredFile(primary.file, root)
  const reason = primary?.text
    ?? (error instanceof Error && error.message.trim().length > 0 ? error.message.split('\n')[0] : 'the authored module could not be evaluated')
  const related = primary !== undefined && normalizePath(primary.file) !== normalizePath(entry)
    ? [{ message: 'style entry that imports this source', file: entryFile }]
    : undefined

  return new VanityError({
    code: 'VANITY_VITE_BUILD_FAILED',
    message: `${primaryFile} could not be compiled: ${reason}`,
    file: primaryFile,
    ...(hasLastGoodCss ? { detail: [cssDetail] } : {}),
    ...(primary?.line === undefined ? {} : { line: primary.line }),
    ...(primary?.column === undefined ? {} : { column: primary.column }),
    ...(related === undefined ? {} : { related }),
    fix: 'repair the authored TypeScript, import, or style expression; the same dev server will retry it on the next change',
  }, { cause: error })
}

function getAuthoredFile(file: string, root: string): string {
  const relative = normalizePath(posix.relative(normalizePath(root), normalizePath(file)))
  return relative.startsWith('..') ? normalizePath(file) : relative
}
