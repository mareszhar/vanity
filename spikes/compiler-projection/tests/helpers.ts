import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const spikeRoot = resolve(import.meta.dirname, '..')
export const appRoot = join(spikeRoot, 'fixtures/app')
export const mainSystem = join(appRoot, 'system.ts')
export const duplicateSystemA = join(appRoot, 'duplicates/a/system.js')
export const duplicateSystemB = join(appRoot, 'duplicates/b/system.js')

export async function temporaryDirectory(label: string): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), `compiler-projection-${label}-`)))
}

export async function readTree(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>()

  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name)
      if (entry.isDirectory())
        await visit(file)
      else
        files.set(relative(root, file), await readFile(file, 'utf8'))
    }
  }

  await visit(root)
  return files
}

export function joinedByExtension(files: Map<string, string>, extension: string): string {
  return [...files.entries()]
    .filter(([file]) => extname(file) === extension)
    .map(([, contents]) => contents)
    .join('\n')
}

export function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

export function fileContaining(files: Map<string, string>, needle: string): [string, string] {
  const found = [...files.entries()].find(([, contents]) => contents.includes(needle))
  if (!found)
    throw new Error(`No output file contains ${JSON.stringify(needle)}`)
  return found
}

export async function runNode(file: string): Promise<string> {
  const { stdout } = await execFileAsync(process.execPath, [file], {
    cwd: dirname(file),
    timeout: 8_000,
    maxBuffer: 1_000_000,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  })
  return stdout
}

export async function importFresh<T>(file: string): Promise<T> {
  return import(`${pathToFileURL(file).href}?test=${Date.now()}-${Math.random()}`) as Promise<T>
}

export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  description: string,
  timeoutMs = 5_000,
): Promise<void> {
  const started = Date.now()
  while (!(await predicate())) {
    if (Date.now() - started > timeoutMs)
      throw new Error(`Timed out waiting for ${description}`)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

export async function copyMutableFixture(): Promise<{
  root: string
  app: string
  system: string
  palette: string
  metadata: string
}> {
  const root = await temporaryDirectory('hmr')
  const app = join(root, 'fixtures/app')
  await mkdir(join(root, 'fixtures'), { recursive: true })
  await cp(appRoot, app, { recursive: true })
  await cp(join(spikeRoot, 'src'), join(root, 'src'), { recursive: true })

  return {
    root,
    app,
    system: join(app, 'system.ts'),
    palette: join(app, 'palette.ts'),
    metadata: join(app, 'metadata.ts'),
  }
}

export async function writeConsumer(root: string, systemEntry: string): Promise<void> {
  await mkdir(root, { recursive: true })
  const specifier = JSON.stringify(systemEntry)
  await writeFile(join(root, 'entry.ts'), [
    `import { ds } from ${specifier};`,
    `import className from './library.css.ts';`,
    `globalThis.__precompiledProbe = { plane: ds.plane, compatibilityId: ds.compatibilityId, className };`,
    '',
  ].join('\n'))
  await writeFile(join(root, 'library.css.ts'), [
    `import { ds } from ${specifier};`,
    `export default ds.style('from-library', { color: ds.ref('brand') });`,
    '',
  ].join('\n'))
}

export function outputBasename(file: string): string {
  return basename(file)
}
