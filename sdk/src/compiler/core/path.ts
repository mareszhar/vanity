/** Compiler-core path normalization; no host or CSS backend dependency. */
export function normalizePath(path: string): string {
  return path.replaceAll('\\', '/')
}
