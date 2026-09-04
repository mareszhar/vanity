import type { VanityAppAutoImports } from './applicationImports'
import autoImportVite from 'unplugin-auto-import/vite'
import { describe, expect, it } from 'vitest'
import { normalizeAppAutoImports } from './applicationImports'
import { autoImportDelegateHooks } from './autoImportDelegate'

describe('application auto-import normalization', () => {
  it('rejects conflicting source filters before an adapter renders them', () => {
    const value = {
      sources: [{ from: './source.ts', include: [], exclude: [] }],
    } as unknown as VanityAppAutoImports

    expect(() => normalizeAppAutoImports(value)).toThrow(
      /VANITY_AUTO_IMPORT_INVALID[\s\S]*autoImports\.app source '\.\/source\.ts' cannot use both include and exclude/,
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
