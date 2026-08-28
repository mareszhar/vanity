import type { VanityRuntimeAutoImports } from './runtimeAutoImports'
import autoImportVite from 'unplugin-auto-import/vite'
import { describe, expect, it } from 'vitest'
import { autoImportDelegateHooks } from './autoImportDelegate'
import { normalizeRuntimeAutoImports } from './runtimeAutoImports'

describe('runtime auto-import normalization', () => {
  it('rejects conflicting source filters before an adapter renders them', () => {
    const value = {
      sources: [{ from: './source.ts', include: [], exclude: [] }],
    } as unknown as VanityRuntimeAutoImports

    expect(() => normalizeRuntimeAutoImports(value)).toThrow(
      `[vanity] app.runtimeAutoImports source './source.ts' cannot use both include and exclude`,
    )
  })

  it('keeps the lazy Vite delegate hook allowlist current', () => {
    const forwardedHooks = new Set<string>(autoImportDelegateHooks)
    const delegate = autoImportVite({
      imports: [{ from: '@mszr/vanity/runtime', imports: ['ports'] }],
    }) as unknown as Record<string, unknown>
    const delegateHooks = Object.entries(delegate)
      .filter(([, value]) => isPluginHook(value))
      .map(([name]) => name)

    expect(delegateHooks).toEqual(expect.arrayContaining([...forwardedHooks]))
    expect(delegateHooks.filter(name => !forwardedHooks.has(name))).toEqual([])
  })
})

function isPluginHook(value: unknown): boolean {
  if (typeof value === 'function')
    return true

  return typeof value === 'object'
    && value !== null
    && 'handler' in value
    && typeof (value as { handler?: unknown }).handler === 'function'
}
