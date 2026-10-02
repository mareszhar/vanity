import { parseLayerName } from '../../css/validation'

/** The host's root order, with configured systems following explicitly ranked roots. */
export function orderCompilerRoots(
  listedRoots: readonly string[] | undefined,
  configuredRoots: readonly string[],
): readonly string[] {
  const names: string[] = []
  const identities = new Set<string>()
  for (const name of [...(listedRoots ?? []), ...configuredRoots]) {
    const { identity } = parseLayerName(name)
    if (identities.has(identity!))
      continue
    identities.add(identity!)
    names.push(name)
  }
  return names
}

/** Render one CSS layer statement for the compiler and its host adapters. */
export function renderLayerStatement(names: readonly string[]): string {
  return names.length === 0 ? '' : `@layer ${names.join(', ')};\n`
}
