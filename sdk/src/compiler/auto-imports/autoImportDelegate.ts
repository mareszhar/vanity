/**
 * Lifecycle hooks manually re-exposed by Vanity's lazy auto-import wrapper.
 * The wrapper is created after Vite resolves its root, so these hooks are
 * forwarded explicitly instead of registering the third-party plugin late.
 */
export const autoImportDelegateHooks = [
  'config',
  'configResolved',
  'transform',
  'transformInclude',
  'buildStart',
  'buildEnd',
  'handleHotUpdate',
] as const
