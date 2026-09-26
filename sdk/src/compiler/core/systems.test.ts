import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  clearConfiguredSystemResolutionCache,
  computeConfiguredSystemMemberChanges,
  computeConfiguredSystemMembers,
  createConfiguredSystemResolutionCache,
  getConfiguredSystemModuleFiles,
  normalizeSystemSources,
} from './systems'

async function put(root: string, file: string, contents: string): Promise<string> {
  const path = join(root, file)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, contents)
  return path
}

describe('configured system resolution facts', () => {
  it('recomputes configured member files after graph-generation invalidation', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-system-resolution-')))

    try {
      const leaf = await put(root, 'system.ts', 'import { createSystem } from \'@mszr/vanity\'\nexport const ds = createSystem()\n')
      const entry = await put(root, 'barrel.ts', 'export const unrelated = true\n')
      const [system] = normalizeSystemSources(entry, root)
      const cache = createConfiguredSystemResolutionCache()
      const authoredByFile = new Map<string, boolean>()
      const previousAuthored = await computeConfiguredSystemMembers([system!], root, cache, authoredByFile)

      const previousMembers = getConfiguredSystemModuleFiles(system!, root, cache)
      expect(previousMembers.has(leaf)).toBe(false)
      expect(previousAuthored.byFile.size).toBe(0)
      expect(cache.exportedFilesByEntry.size).toBe(1)

      await writeFile(entry, 'export { ds } from \'./system\'\n')
      // A cached member set belongs to the previous graph until the host
      // announces a new generation.
      expect(getConfiguredSystemModuleFiles(system!, root, cache)).toBe(previousMembers)
      expect(getConfiguredSystemModuleFiles(system!, root, cache).has(leaf)).toBe(false)

      clearConfiguredSystemResolutionCache(cache)
      const nextMembers = getConfiguredSystemModuleFiles(system!, root, cache)
      expect(nextMembers).not.toBe(previousMembers)
      expect(nextMembers.has(leaf)).toBe(true)
      const authored = await computeConfiguredSystemMembers(
        [system!],
        root,
        cache,
        authoredByFile,
      )
      expect([...authored.byFile.keys()]).toEqual([leaf])
      expect(authored.basenames).toEqual(new Set(['system.ts']))
      expect(computeConfiguredSystemMemberChanges(previousAuthored.byFile.keys(), authored.byFile.keys())).toEqual(new Set([leaf]))

      await writeFile(entry, 'export const unrelated = true\n')
      clearConfiguredSystemResolutionCache(cache)
      const finalMembers = getConfiguredSystemModuleFiles(system!, root, cache)
      expect(finalMembers.has(leaf)).toBe(false)
      const finalAuthored = await computeConfiguredSystemMembers([system!], root, cache, authoredByFile)
      expect(computeConfiguredSystemMemberChanges(authored.byFile.keys(), finalAuthored.byFile.keys())).toEqual(new Set([leaf]))
    }
    finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })
})
