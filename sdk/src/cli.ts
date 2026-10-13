#!/usr/bin/env node

import type { VanityManifest } from './introspect/manifest'
import { realpathSync } from 'node:fs'
import { readFile as readFileAsync, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { argv, cwd, exitCode } from 'node:process'
import { pathToFileURL } from 'node:url'
import { VanityError } from './diagnostics'
import { diffManifests, formatManifestDiff } from './introspect/diff'
import { assertManifestShape } from './introspect/manifestValidation'
import { formatManifestQuery, queryManifest } from './introspect/queries'
import { formatExplanation } from './introspect/semantic'

export { checkProject } from './check'
export type { VanityCheckOptions, VanityCheckReport, VanityCheckResult } from './check'

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
  if (rawPath.includes('#')) {
    const value = queryManifest(manifest, 'explain', rawPath)
    return json ? JSON.stringify(value, null, 2) : formatManifestQuery('explain', value)
  }
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
  if (!value) {
    throw new VanityError({
      code: 'VANITY_CLI_INVALID_USAGE',
      message: `no semantic entry matches '${rawPath}'`,
      path: ['path'],
      fix: 'pass a token, axis, condition, recipe, anatomy, port, or semantic path present in the manifest',
    })
  }
  return json ? JSON.stringify(value, null, 2) : formatExplanation(value as Readonly<Record<string, unknown>>)
}

/** Validate unknown JSON as Manifest v5: `assertManifest(JSON.parse(source))`. */
export function assertManifest(value: unknown): asserts value is VanityManifest {
  assertManifestShape(value)
}

/** Run the published CLI entrypoint from a launcher or directly. */
export async function runVanityCli(args: readonly string[] = argv.slice(2)): Promise<void> {
  const [command = 'inspect', ...rest] = args
  if (command === '--help' || command === '-h') {
    printUsage()
    return
  }

  if (rest.includes('--help') || rest.includes('-h')) {
    if (command === 'check') {
      printCheckUsage()
      return
    }
    if (command === 'prepare') {
      printPrepareUsage()
      return
    }
    throw new VanityError({
      code: 'VANITY_CLI_INVALID_USAGE',
      message: `${command} does not accept --help`,
      path: ['arguments'],
      fix: 'use --help with the top-level command or prepare command',
    })
  }

  if (command === 'check') {
    const options = parseCheckOptions(rest)
    const { checkProject, formatCheckReport } = await import('./check')
    const { report } = await checkProject(options)
    console.log(options.json ? JSON.stringify(report, null, 2) : formatCheckReport(report, options))
    // eslint-disable-next-line node/prefer-global/process
    process.exitCode = report.exitCode
    return
  }

  if (command === 'prepare') {
    const { config: configOption, root } = parsePrepareOptions(rest)
    const configPath = configOption ?? join(root, 'vanity.config.ts')
    const { loadVanityConfig, writeAutoImportDeclarations } = await import('./prepare')
    const options = await loadVanityConfig(configPath, { root })
    const result = await writeAutoImportDeclarations(options, { root })
    const changes = result.written.length + result.removed.length
    if (changes === 0) {
      console.log('[vanity] auto-import declarations are already current')
      return
    }
    console.log(
      `[vanity] prepared ${result.plan.declarations.length} module-role declaration set(s)`
      + ` (${result.written.length} written, ${result.removed.length} removed)`,
    )
    return
  }

  if (command === 'roles' || command === 'examples' || command === 'explain' || command === 'context') {
    const options = parseQueryOptions(command, rest)
    const file = resolve(options.manifest ?? '.vanity/manifest.json')
    const manifest = await readManifest(file)
    const written = await stat(file)
    const root = options.root ?? (basename(dirname(file)) === '.vanity' ? dirname(dirname(file)) : cwd())
    const warnings: string[] = []
    for (const source of Object.keys(manifest.modules).filter(source => source !== '$project')) {
      try {
        if ((await stat(resolve(root, source))).mtimeMs > written.mtimeMs)
          warnings.push(`${source} is newer than the manifest; regenerate before relying on this answer`)
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw error
      }
    }
    const result = command === 'explain' && !options.subject?.includes('#')
      ? JSON.parse(explainManifestPath(manifest, options.subject!, true))
      : queryManifest(manifest, command, options.subject)
    const report = {
      format: 'vanity.query/1',
      version: 1,
      command,
      manifest: { version: manifest.version, identities: manifest.system.identities, writtenAt: written.mtime.toISOString() },
      warnings,
      result,
    }
    console.log(options.json
      ? JSON.stringify(report, null, 2)
      : [
          `Manifest v${manifest.version}; ${manifest.system.identities.compatibility}; written ${report.manifest.writtenAt}`,
          ...warnings.map(warning => `Warning: ${warning}`),
          command === 'explain' && !options.subject?.includes('#') ? formatExplanation(result) : formatManifestQuery(command, result),
        ].join('\n'))
    return
  }

  const json = rest.includes('--json')
  const positional = rest.filter(argument => !argument.startsWith('--'))
  if (command === 'inspect') {
    console.log(inspectManifest(await readManifest(positional[0]), json))
    return
  }
  if (command === 'diff') {
    if (!positional[0] || !positional[1]) {
      throw new VanityError({
        code: 'VANITY_CLI_INVALID_USAGE',
        message: 'usage: vanity diff <before.json> <after.json> [--json]',
        path: ['arguments'],
        fix: 'provide both the before and after manifest paths',
      })
    }
    const diff = diffManifests(await readManifest(positional[0]), await readManifest(positional[1]))
    console.log(json ? JSON.stringify(diff, null, 2) : formatManifestDiff(diff))
    return
  }
  throw new VanityError({
    code: 'VANITY_CLI_INVALID_USAGE',
    message: `unknown command '${command}'; use inspect, explain, roles, examples, context, diff, prepare, or check`,
    path: ['command'],
    fix: 'use inspect, explain, roles, examples, context, diff, prepare, or check',
  })
}

function parseQueryOptions(command: string, args: readonly string[]): { json: boolean, subject?: string, manifest?: string, root?: string } {
  const options: { json: boolean, subject?: string, manifest?: string, root?: string } = { json: false }
  const positional: string[] = []
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!
    if (argument === '--json') {
      options.json = true
      continue
    }
    if (argument === '--root' || (argument === '--for' && command === 'roles') || (argument === '--focus' && command === 'context')) {
      const value = args[++index]
      if (!value || value.startsWith('--'))
        throw new VanityError({ code: 'VANITY_CLI_INVALID_USAGE', message: `${argument} needs a value`, fix: 'provide the flag value' })
      if (argument === '--root')
        options.root = resolve(value)
      else
        options.subject = value
      continue
    }
    if (argument.startsWith('--'))
      throw new VanityError({ code: 'VANITY_CLI_INVALID_USAGE', message: `unknown ${command} flag '${argument}'`, fix: 'use the documented query flags' })
    positional.push(argument)
  }
  if (command === 'explain' || command === 'examples')
    options.subject = positional.shift()
  options.manifest = positional.shift()
  if (positional.length || ((command === 'roles' || command === 'explain' || command === 'examples') && !options.subject))
    throw new VanityError({ code: 'VANITY_CLI_INVALID_USAGE', message: `invalid ${command} arguments`, fix: 'provide the subject and at most one manifest path' })
  return options
}

function printUsage(): void {
  console.log([
    'usage: vanity <command>',
    '',
    'commands:',
    '  inspect [manifest] [--json]',
    '  explain <semantic-path|module#export[.part]> [manifest] [--json]',
    '  roles --for <intent> [manifest] [--json]',
    '  examples <token-path> [manifest] [--json]',
    '  context [--focus <token-group|module>] [manifest] [--json]',
    '  diff <old-manifest> <new-manifest> [--json]',
    '  prepare [--config <path>] [--root <path>]',
    '  check [--json] [--against <manifest>] [--write-baseline] [--unresolved] [--exceptions] [--derivations] [--roles] [--config <path>] [--root <path>]',
  ].join('\n'))
}

function printCheckUsage(): void {
  console.log('usage: vanity check [--json] [--against <manifest>] [--write-baseline] [--unresolved] [--exceptions] [--derivations] [--roles] [--config <path>] [--root <path>]')
}

function parseCheckOptions(args: readonly string[]) {
  const options: import('./check').VanityCheckOptions & { json?: boolean, unresolved?: boolean, exceptions?: boolean, derivations?: boolean, roles?: boolean } = {}
  const flags = new Map<string, 'json' | 'writeBaseline' | 'unresolved' | 'exceptions' | 'derivations' | 'roles'>([
    ['--json', 'json'],
    ['--write-baseline', 'writeBaseline'],
    ['--unresolved', 'unresolved'],
    ['--exceptions', 'exceptions'],
    ['--derivations', 'derivations'],
    ['--roles', 'roles'],
  ] as const)
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    const flag = flags.get(argument)
    if (flag !== undefined) {
      options[flag] = true
      continue
    }
    const path = argument.match(/^--(root|config|against)(?:=(.*))?$/)
    if (!path)
      throw new VanityError({ code: 'VANITY_CLI_INVALID_USAGE', message: `unknown check option '${argument}'`, fix: 'use vanity check --help for supported options' })
    const value = path[2] ?? args[++index]
    if (!value || value.startsWith('-'))
      throw new VanityError({ code: 'VANITY_CLI_INVALID_USAGE', message: `${argument} requires a path`, fix: `provide a path after --${path[1]}` })
    options[path[1] as 'root' | 'config' | 'against'] = value
  }
  options.root = resolve(cwd(), options.root ?? '.')
  return options
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

    if (argument !== '--config' && argument !== '--root') {
      throw new VanityError({
        code: 'VANITY_CLI_INVALID_USAGE',
        message: `unknown prepare option '${argument}'`,
        path: ['prepare', 'options'],
        fix: 'use --config <path> or --root <path>',
      })
    }

    const value = args[++index]
    if (value === undefined || value.startsWith('-')) {
      throw new VanityError({
        code: 'VANITY_CLI_INVALID_USAGE',
        message: `${argument} requires a path`,
        path: ['prepare', argument.slice(2)],
        fix: `provide a path after ${argument}`,
      })
    }

    if (argument === '--config')
      config = value
    else
      root = value
  }

  return { config, root: resolve(cwd(), root ?? '.') }
}

if (argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(argv[1])).href) {
  runVanityCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    // eslint-disable-next-line node/prefer-global/process
    process.exitCode = exitCode ?? 1
  })
}
