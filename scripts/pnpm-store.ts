/** Keep maintainer pnpm commands on the user store and inspect install metadata. */

import { mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'

/** Return the configured user-level store override when pnpm exposes one. */
export function pnpmStoreArgs(): readonly string[] {
  const pnpmHome = process.env.PNPM_HOME
  if (pnpmHome === undefined || pnpmHome === '' || !isAbsolute(pnpmHome))
    return []

  return [`--config.store-dir=${join(pnpmHome, 'store')}`]
}

/** Read the store path recorded by pnpm in its install metadata. */
export function readStoreDirFromModules(source: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  }
  catch {
    return /^ {2}"storeDir": "([^"]+)",?$/m.exec(source)?.[1]
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return undefined

  const storeDir = (parsed as { storeDir?: unknown }).storeDir
  return typeof storeDir === 'string' && storeDir !== '' ? storeDir : undefined
}

/** Read the store path recorded by an existing node_modules tree. */
export async function linkedStoreDir(modulesState: URL): Promise<string | undefined> {
  try {
    return readStoreDirFromModules(await readFile(modulesState, 'utf8'))
  }
  catch {
    return undefined
  }
}

/** Resolve a pnpm store path relative to the workspace when necessary. */
export function absoluteStorePath(root: string, storePath: string): string {
  return isAbsolute(storePath) ? storePath : resolve(root, storePath)
}

/** Identify stores nested below the workspace's ignored fallback directory. */
export function isProjectStore(root: string, storePath: string): boolean {
  const projectStore = resolve(root, '.pnpm-store')
  const relativePath = relative(projectStore, absoluteStorePath(root, storePath))
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

/** Remove the workspace-local fallback store after a global relink succeeds. */
export async function removeProjectStore(root: string): Promise<void> {
  await rm(resolve(root, '.pnpm-store'), { force: true, recursive: true })
}

/** Rebuild node_modules on a new store while preserving it if installation fails. */
export async function relinkNodeModules(
  root: string,
  install: () => Promise<number>,
  isRelinked: () => Promise<boolean>,
): Promise<void> {
  const nodeModules = resolve(root, 'node_modules')
  const backupDirectory = await mkdtemp(join(tmpdir(), 'vanity-node-modules-'))
  const backupNodeModules = join(backupDirectory, 'node_modules')
  let moved = false

  try {
    try {
      await rename(nodeModules, backupNodeModules)
      moved = true
    }
    catch (error) {
      if ((error as { code?: unknown }).code !== 'ENOENT')
        throw error
    }

    const installExitCode = await install()
    if (installExitCode !== 0)
      throw new Error(`pnpm install failed with exit code ${installExitCode}.`)
    if (!await isRelinked())
      throw new Error('The workspace install did not relink to the user-level pnpm store.')
  }
  catch (error) {
    if (moved) {
      await rm(nodeModules, { force: true, recursive: true })
      await rename(backupNodeModules, nodeModules)
    }
    throw error
  }
  finally {
    await rm(backupDirectory, { force: true, recursive: true })
  }
}
