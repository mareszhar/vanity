#!/usr/bin/env node

import type { VanityManifest } from './introspect/manifest'
import { realpathSync } from 'node:fs'
import { readFile as readFileAsync } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { argv, cwd, exitCode } from 'node:process'
import { pathToFileURL } from 'node:url'
import { diffManifests, formatManifestDiff } from './introspect/diff'
import { VANITY_MANIFEST_FORMAT } from './introspect/manifest'
import { formatExplanation } from './introspect/semantic'

/** Read and validate a manifest file: `await readManifest('.vanity/manifest.json')`. */
export async function readManifest(path = '.vanity/manifest.json'): Promise<VanityManifest> {
  const parsed = JSON.parse(await readFileAsync(resolve(cwd(), path), 'utf8')) as unknown
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
  if (command === '--help' || command === '-h') {
    printUsage()
    return
  }

  if (rest.includes('--help') || rest.includes('-h')) {
    if (command === 'prepare') {
      printPrepareUsage()
      return
    }
    throw new TypeError(`[vanity] ${command} does not accept --help`)
  }

  if (command === 'prepare') {
    const { config: configOption, root } = parsePrepareOptions(rest)
    const configPath = resolve(cwd(), configOption ?? join(root, 'vanity.config.ts'))
    const { loadVanityConfig, writeAutoImportDeclarations } = await import('./prepare')
    const options = await loadVanityConfig(configPath)
    const result = await writeAutoImportDeclarations(options, { root })
    const changes = result.written.length + result.removed.length
    if (changes === 0) {
      console.log('[vanity] auto-import declarations are already current')
      return
    }
    console.log(
      `[vanity] prepared ${result.plan.declarations.length} declaration lane(s)`
      + ` (${result.written.length} written, ${result.removed.length} removed)`,
    )
    return
  }

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
  throw new TypeError(`[vanity] unknown command '${command}'; use inspect, explain, diff, or prepare`)
}

function printUsage(): void {
  console.log([
    'usage: vanity <command>',
    '',
    'commands:',
    '  inspect [manifest] [--json]',
    '  explain <semantic-path> [manifest] [--json]',
    '  diff <old-manifest> <new-manifest> [--json]',
    '  prepare [--config <path>] [--root <path>]',
  ].join('\n'))
}

function printPrepareUsage(): void {
  console.log('usage: vanity prepare [--config <path>] [--root <path>]')
}

function parsePrepareOptions(args: readonly string[]): { config?: string, root: string } {
  let config: string | undefined
  let root: string | undefined

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    const inline = argument.match(/^--(config|root)=(.+)$/)
    if (inline) {
      if (inline[1] === 'config')
        config = inline[2]
      else
        root = inline[2]
      continue
    }

    if (argument !== '--config' && argument !== '--root')
      throw new TypeError(`[vanity] unknown prepare option '${argument}'`)

    const value = args[++index]
    if (value === undefined || value.startsWith('-'))
      throw new TypeError(`[vanity] ${argument} requires a path`)

    if (argument === '--config')
      config = value
    else
      root = value
  }

  return { config, root: resolve(cwd(), root ?? '.') }
}

if (argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(argv[1])).href) {
  main(argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    // eslint-disable-next-line node/prefer-global/process
    process.exitCode = exitCode ?? 1
  })
}
