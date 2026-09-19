import { relative, resolve } from 'node:path'

/** Compiler-core path normalization; no host or CSS backend dependency. */
export function normalizePath(path: string): string {
  return path.replaceAll('\\', '/')
}

/**
 * Describe a module's location relative to the build root, for virtual IDs and
 * any other address that outlives one machine. An absolute path would bake the
 * author's directories into the module graph, sourcemaps, and bundler output,
 * and make the same commit build differently on another checkout. Modules above
 * the root keep `../` segments, which stay stable for the same reason.
 */
export function getRootRelativeModulePath(file: string, root: string): string {
  return normalizePath(relative(resolve(root), resolve(file)))
}
