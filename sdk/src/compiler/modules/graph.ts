/** Shared access to esbuild's recorded module graph, including host namespaces. */
import type { Metafile } from 'esbuild'
import { dirname, isAbsolute, resolve } from 'node:path'
import { normalizeModuleIdentity } from '../projection/exportNames'

export type ModuleInputs = ReadonlyMap<string, Metafile['inputs'][string]>

export function getModuleInputs(inputs: Metafile['inputs'], root: string): ModuleInputs {
  const byPath = new Map<string, Metafile['inputs'][string]>()
  for (const [file, input] of Object.entries(inputs)) {
    if (!file.startsWith('<'))
      byPath.set(normalizeInputPath(file, root), input)
  }
  return byPath
}

export function findModuleInput(imported: string, importer: string, root: string, inputs: ModuleInputs): string | undefined {
  const direct = normalizeInputPath(imported, root)
  if (inputs.has(direct))
    return direct
  const candidates = isAbsolute(imported) ? [imported] : [resolve(root, imported), resolve(dirname(importer), imported)]
  for (const candidate of candidates) {
    const normalized = normalizeInputPath(candidate, root)
    if (inputs.has(normalized))
      return normalized
  }
  return undefined
}

function normalizeInputPath(file: string, root: string): string {
  if (file.startsWith('vanity-host:')) {
    const id = file.slice('vanity-host:'.length)
    return isAbsolute(id) ? normalizeModuleIdentity(id.replace(/[?#].*$/, '')) : id
  }
  return normalizeModuleIdentity((isAbsolute(file) ? file : resolve(root, file)).replace(/[?#].*$/, ''))
}
