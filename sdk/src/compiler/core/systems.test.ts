import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as exportNames from '../projection/exportNames'
import {
  clearConfiguredSystemResolutionCache,
  createConfiguredSystemResolutionCache,
  findConfiguredSystemInModuleGraph,
  normalizeSystemSources,
} from './systems'

async function put(root: string, file: string, contents: string): Promise<string> {
  const path = join(root, file)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, contents)
  return path
}

describe('configured system resolution facts', () => {
  it('caches multi-system graph reads across many unrelated imports', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-system-resolution-cost-')))

    try {
      const entries = await Promise.all(Array.from({ length: 3 }, async (_, index) => {
        await put(root, `system-${index}.ts`, `export const ds${index} = {}\n`)
        return put(root, `barrel-${index}.ts`, `export { ds${index} } from './system-${index}'\n`)
      }))
      const unrelated = await Promise.all(Array.from({ length: 40 }, (_, index) =>
        put(root, `imports/import-${index}.ts`, `export const value${index} = true\n`)))
      const systems = normalizeSystemSources(entries, root)
      const parseGraphs = vi.spyOn(exportNames, 'getExportModuleFilesFromFile')

      try {
        for (const file of unrelated)
          expect(findConfiguredSystemInModuleGraph(file, systems, root)).toBeUndefined()
        const uncachedGraphReads = parseGraphs.mock.calls.length

        parseGraphs.mockClear()
        const cache = createConfiguredSystemResolutionCache()
        for (const file of unrelated)
          expect(findConfiguredSystemInModuleGraph(file, systems, root, cache)).toBeUndefined()
        const cachedGraphReads = parseGraphs.mock.calls.length

        expect(uncachedGraphReads).toBe(120)
        expect(cachedGraphReads).toBe(3)
        expect(cachedGraphReads).toBeLessThan(uncachedGraphReads)

        clearConfiguredSystemResolutionCache(cache)
        expect(findConfiguredSystemInModuleGraph(unrelated[0], systems, root, cache)).toBeUndefined()
        expect(parseGraphs).toHaveBeenCalledTimes(6)
      }
      finally {
        parseGraphs.mockRestore()
      }
    }
    finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('caches graph matches and re-evaluates safe misses after invalidation', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-system-resolution-')))

    try {
      const leaf = await put(root, 'system.ts', 'export const ds = {}\n')
      const unrelated = await put(root, 'unrelated.ts', 'export const value = true\n')
      const entry = await put(root, 'barrel.ts', 'export const unrelated = true\n')
      const [system] = normalizeSystemSources(entry, root)
      const cache = createConfiguredSystemResolutionCache()

      expect(findConfiguredSystemInModuleGraph(unrelated, [], root, cache)).toBeUndefined()
      expect(cache.systemMatchesByFile.size).toBe(0)
      expect(cache.exportedFilesByEntry.size).toBe(0)

      expect(findConfiguredSystemInModuleGraph(unrelated, [system!], root, cache)).toBeUndefined()
      expect(cache.systemMatchesByFile.get(unrelated)).toBeNull()
      expect(findConfiguredSystemInModuleGraph(leaf, [system!], root, cache)).toBeUndefined()
      expect(cache.exportedFilesByEntry.size).toBe(1)
      const miss = cache.exportedFilesByEntry.get(system!.entry)
      expect(findConfiguredSystemInModuleGraph(leaf, [system!], root, cache)).toBeUndefined()
      expect(cache.exportedFilesByEntry.get(system!.entry)).toBe(miss)

      await writeFile(entry, 'export { ds } from \'./system\'\n')
      // The old safe miss remains valid until the host announces the new
      // graph generation; invalidation is the explicit ownership boundary.
      expect(findConfiguredSystemInModuleGraph(leaf, [system!], root, cache)).toBeUndefined()

      clearConfiguredSystemResolutionCache(cache)
      expect(findConfiguredSystemInModuleGraph(leaf, [system!], root, cache)).toBe(system)
      expect(cache.exportedFilesByEntry.size).toBe(1)

      await writeFile(entry, 'export const unrelated = true\n')
      clearConfiguredSystemResolutionCache(cache)
      expect(findConfiguredSystemInModuleGraph(leaf, [system!], root, cache)).toBeUndefined()
    }
    finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })
})
