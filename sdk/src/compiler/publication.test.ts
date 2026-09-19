import type { ViteDevServer } from 'vite'
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { vanityPlugin } from '@mszr/vanity/vite'
import { createServer } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { writeFileArtifacts } from './publication'

const vanityRoot = fileURLToPath(new URL('../', import.meta.url))
const alias = {
  '@mszr/vanity/runtime': join(vanityRoot, 'runtime.ts'),
  '@mszr/vanity': join(vanityRoot, 'index.ts'),
}

async function put(root: string, file: string, contents: string): Promise<string> {
  const path = join(root, file)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, contents)
  return path
}

async function hotUpdate(server: ViteDevServer, file: string): Promise<unknown> {
  const plugin = server.config.plugins.find(entry => entry.name === 'vanity-css-ts')
  if (plugin === undefined)
    throw new Error('missing Vanity Vite plugin')
  const modules = [...server.moduleGraph.getModulesByFile(file) ?? []]
  server.moduleGraph.onFileChange(file)
  for (const environment of Object.values(server.environments))
    environment.moduleGraph.onFileChange(file)
  const hook = typeof plugin.handleHotUpdate === 'object'
    ? plugin.handleHotUpdate.handler
    : plugin.handleHotUpdate
  return (hook as (context: object) => Promise<unknown>)({
    file,
    server,
    modules,
    timestamp: Date.now(),
    read: () => readFile(file, 'utf8'),
  })
}

describe('artifact publication', () => {
  it('restores earlier files when a candidate becomes stale mid-publication', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-publication-stale-')))
    const first = join(root, 'first.json')
    const second = join(root, 'second.json')
    await writeFile(first, 'accepted-first')
    await writeFile(second, 'accepted-second')
    let checks = 0
    const commit = vi.fn()

    try {
      const published = await writeFileArtifacts([
        { file: first, contents: 'candidate-first' },
        { file: second, contents: 'candidate-second' },
      ], () => ++checks < 5, commit)

      expect(published).toBe(false)
      expect(checks).toBe(5)
      expect(commit).not.toHaveBeenCalled()
      expect(await readFile(first, 'utf8')).toBe('accepted-first')
      expect(await readFile(second, 'utf8')).toBe('accepted-second')
      expect((await readdir(root)).sort()).toEqual(['first.json', 'second.json'])
    }
    finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('keeps the complete accepted artifact set when a later write fails', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-publication-')))
    let server: ViteDevServer | undefined

    try {
      await put(root, 'package.json', '{ "name": "publication", "type": "module" }')
      await put(root, 'description.ts', 'export const description = "old"\n')
      const first = await put(root, 'first.ts', `import { createSystem } from '@mszr/vanity'
import { description } from './description'
export const ds = createSystem().addRules({ reset: { description, css: { body: { color: 'red' } } } }).consolidate({ prefix: 'first' })
`)
      const second = await put(root, 'second.ts', `import { createSystem } from '@mszr/vanity'
import { description } from './description'
export const ds = createSystem().addRules({ reset: { description, css: { body: { color: 'blue' } } } }).consolidate({ prefix: 'second' })
`)
      await put(root, 'style.css.ts', `import { ds as first } from './first'
import { ds as second } from './second'
export const one = first.class({ color: 'red' })
export const two = second.class({ color: 'blue' })
`)

      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system: [first, second] } })],
        resolve: { alias },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })
      await server.transformRequest('/style.css.ts')

      const vanityDirectory = join(root, '.vanity')
      const manifestPath = join(vanityDirectory, 'manifest.json')
      const directory = join(vanityDirectory, 'systems')
      await delay(75)
      const manifestBefore = await readFile(manifestPath, 'utf8')
      const artifacts = await Promise.all((await readdir(directory))
        .filter(file => file.endsWith('.json'))
        .map(async file => ({
          file,
          portable: JSON.parse(await readFile(join(directory, file), 'utf8')) as { prefix?: string },
        })))
      const firstArtifact = artifacts.find(artifact => artifact.portable.prefix === 'first')?.file
      const secondArtifact = artifacts.find(artifact => artifact.portable.prefix === 'second')?.file
      if (firstArtifact === undefined || secondArtifact === undefined)
        throw new Error('expected both system artifacts')

      const firstPath = join(directory, firstArtifact)
      const secondPath = join(directory, secondArtifact)
      const before = await readFile(firstPath, 'utf8')
      const beforeSecond = await readFile(secondPath, 'utf8')
      const beforePortable = JSON.parse(before) as {
        identities: { css: string }
      }
      const beforeSecondPortable = JSON.parse(beforeSecond) as {
        identities: { css: string }
      }
      await rm(secondPath)
      await mkdir(secondPath)
      await writeFile(join(root, 'description.ts'), 'export const description = "new"\n')

      await expect(hotUpdate(server, join(root, 'description.ts')))
        .rejects
        .toThrow('VANITY_ARTIFACT_TARGET_INVALID')
      // A later target failure must not leave an earlier target from the
      // rejected generation on disk, and the rejected target must remain
      // untouched so the failure is actionable.
      expect(await readFile(firstPath, 'utf8')).toBe(before)
      expect((await lstat(secondPath)).isDirectory()).toBe(true)
      expect(await readFile(manifestPath, 'utf8')).toBe(manifestBefore)

      const filesAfterFailure = [
        ...(await readdir(vanityDirectory)),
        ...(await readdir(directory)),
      ].filter(file => file.includes('.tmp-') || file.includes('.bak-'))
      expect(filesAfterFailure).toEqual([])

      const virtualId = join(
        root,
        '.vanity',
        'virtual',
        'system',
        `${beforePortable.identities.css}.vanity.css`,
      )
      const secondVirtualId = join(
        root,
        '.vanity',
        'virtual',
        'system',
        `${beforeSecondPortable.identities.css}.vanity.css`,
      )
      expect(await readFile(virtualId, 'utf8').catch(() => undefined)).toBeUndefined()
      expect((await server.transformRequest(virtualId))?.code).toContain('color: red')
      expect((await server.transformRequest(secondVirtualId))?.code).toContain('color: blue')
      const acceptedStyle = (await server.transformRequest('/style.css.ts'))?.code ?? ''
      expect(acceptedStyle).toContain(beforePortable.identities.css)
      expect(acceptedStyle).toContain(beforeSecondPortable.identities.css)

      // Repair the same target and source on the same server. The next
      // generation must publish both artifacts together and expose the new
      // documentation while keeping the CSS identity/bytes stable.
      await rm(secondPath, { recursive: true })
      await hotUpdate(server, join(root, 'description.ts'))
      await delay(75)
      const afterFirst = await readFile(firstPath, 'utf8')
      const afterSecond = await readFile(secondPath, 'utf8')
      const manifestAfter = await readFile(manifestPath, 'utf8')
      expect(afterFirst).toContain('"description": "new"')
      expect(afterSecond).toContain('"description": "new"')
      expect(manifestAfter).not.toBe(manifestBefore)
      expect(manifestAfter).toContain('"description": "new"')
      expect(JSON.parse(afterFirst).identities.css).toBe(beforePortable.identities.css)
      expect(JSON.parse(afterSecond).identities.css).toBe(beforeSecondPortable.identities.css)
      expect((await server.transformRequest(virtualId))?.code).toContain('color: red')

      const leftovers = (await readdir(directory)).filter(file =>
        file.includes('.tmp-') || file.includes('.bak-'))
      expect(leftovers).toEqual([])
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)
})
