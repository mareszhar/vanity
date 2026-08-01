#!/usr/bin/env node

import type { VanityManifest } from './introspect/manifest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { argv, cwd, exitCode } from 'node:process'
import { diffManifests, formatManifestDiff } from './introspect/diff'
import { VANITY_MANIFEST_FORMAT } from './introspect/manifest'
import { formatExplanation } from './introspect/semantic'

/** Read and validate a manifest file: `await readManifest('.vanity/manifest.json')`. */
export async function readManifest(path = '.vanity/manifest.json'): Promise<VanityManifest> {
  const parsed = JSON.parse(await readFile(resolve(cwd(), path), 'utf8')) as unknown
  assertManifest(parsed)
  return parsed
}

/** Format a manifest's system summary or JSON projection: `inspectManifest(manifest)`. */
export function inspectManifest(manifest: VanityManifest, json = false): string {
  if (json)
    return JSON.stringify(manifest.system, null, 2)
  const modules = Object.values(manifest.modules)
  return [
    `vanity ${manifest.system.identities.compatibility}`,
    `${Object.keys(manifest.system.tokens).length} tokens · ${Object.keys(manifest.system.axes).length} axes · ${Object.keys(manifest.system.conditions).length} conditions`,
    `${modules.reduce((count, module) => count + Object.keys(module.styles).length, 0)} styles · ${modules.reduce((count, module) => count + Object.keys(module.recipes).length, 0)} recipes/anatomies · ${modules.reduce((count, module) => count + Object.keys(module.ports).length, 0)} ports`,
    `root ${manifest.system.root}; layers ${manifest.system.layers.map(layer => layer.name).join(' → ')}`,
  ].join('\n')
}

/** Explain one semantic path from a manifest: `explainManifestPath(manifest, 'color.brand')`. */
export function explainManifestPath(manifest: VanityManifest, rawPath: string, json = false): string {
  const path = rawPath.replace(/^system\./, '').replace(/^tokens?\./, '')
  const systemCollections = [
    manifest.system.tokens,
    manifest.system.axes,
    manifest.system.conditions,
    manifest.system.roots,
    manifest.system.plugins,
    manifest.system.consts,
    manifest.system.constructors,
    manifest.system.utilities,
    manifest.system.audits,
  ] as readonly Readonly<Record<string, object>>[]
  let value = systemCollections.flatMap(collection => collection[path] ?? [])[0]
  if (!value) {
    for (const module of Object.values(manifest.modules)) {
      value = module.recipes[path] ?? module.ports[path] ?? module.styles[path]
      if (value)
        break
    }
  }
  if (!value)
    throw new TypeError(`[vanity] no semantic entry matches '${rawPath}'`)
  return json ? JSON.stringify(value, null, 2) : formatExplanation(value as Readonly<Record<string, unknown>>)
}

/** Validate unknown JSON as Manifest v3: `assertManifest(JSON.parse(source))`. */
export function assertManifest(value: unknown): asserts value is VanityManifest {
  if (!value || typeof value !== 'object')
    throw new TypeError('[vanity] manifest must be a JSON object')
  const candidate = value as Partial<VanityManifest>
  if (
    candidate.format !== VANITY_MANIFEST_FORMAT
    || candidate.version !== 3
    || !candidate.system
    || !candidate.modules
    || !candidate.system.identities
  ) {
    throw new TypeError(`[vanity] expected ${VANITY_MANIFEST_FORMAT}`)
  }
}

async function main(args: readonly string[]): Promise<void> {
  const [command = 'inspect', ...rest] = args
  const json = rest.includes('--json')
  const positional = rest.filter(argument => !argument.startsWith('--'))
  if (command === 'inspect') {
    console.log(inspectManifest(await readManifest(positional[0]), json))
    return
  }
  if (command === 'explain') {
    if (!positional[0])
      throw new TypeError('[vanity] usage: vanity explain <semantic-path> [manifest] [--json]')
    console.log(explainManifestPath(await readManifest(positional[1]), positional[0], json))
    return
  }
  if (command === 'diff') {
    if (!positional[0] || !positional[1])
      throw new TypeError('[vanity] usage: vanity diff <before.json> <after.json> [--json]')
    const diff = diffManifests(await readManifest(positional[0]), await readManifest(positional[1]))
    console.log(json ? JSON.stringify(diff, null, 2) : formatManifestDiff(diff))
    return
  }
  throw new TypeError(`[vanity] unknown command '${command}'; use inspect, explain, or diff`)
}

if (import.meta.url === `file://${argv[1]}`) {
  main(argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    // eslint-disable-next-line node/prefer-global/process
    process.exitCode = exitCode ?? 1
  })
}
