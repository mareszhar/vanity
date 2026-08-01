/**
 * Extract and typecheck executable TypeScript examples from the documentation.
 * The docs are part of Vanity's public contract, so examples must stay aligned
 * with the package API instead of becoming plausible-looking stale snippets.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const docsRoot = join(root, 'docs')
const examplesRoot = join(docsRoot, 'examples')
const markdownFiles = readdirSync(docsRoot, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
  .map(entry => relative(docsRoot, join(entry.parentPath, entry.name)))
  .sort()
const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: file => file,
  getCurrentDirectory: () => root,
  getNewLine: () => '\n',
}

interface FenceFailure {
  file: string
  index: number
  diagnostics: readonly ts.Diagnostic[]
}

let fenceCount = 0
const failures: FenceFailure[] = []

for (const file of ['../README.md', ...markdownFiles]) {
  const source = readFileSync(resolve(docsRoot, file), 'utf8')
  const fences = [...source.matchAll(/^```(?:ts|TS|typescript)[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm)]

  for (const [index, fence] of fences.entries()) {
    fenceCount++
    const code = fence[1] ?? ''
    const candidates = [
      code,
      `const __vanityDocExample = ({\n${code}\n})`,
      `const __vanityDocExample = [\n${code}\n]`,
    ]
    let best: readonly ts.Diagnostic[] | undefined

    for (const candidate of candidates) {
      const result = ts.transpileModule(candidate, {
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
        },
        fileName: `${file}#${index + 1}.ts`,
        reportDiagnostics: true,
      })
      const diagnostics = (result.diagnostics ?? []).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)

      if (diagnostics.length === 0) {
        best = undefined
        break
      }

      if (best === undefined || diagnostics.length < best.length)
        best = diagnostics
    }

    if (best !== undefined)
      failures.push({ file, index: index + 1, diagnostics: best })
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`${failure.file} fence ${failure.index}`)
    console.error(ts.formatDiagnostics(failure.diagnostics, formatHost))
  }
  process.exitCode = 1
}

const configPath = join(examplesRoot, 'tsconfig.json')
if (!existsSync(configPath))
  throw new Error(`Missing canonical doc-example project: ${configPath}`)

const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
if (configFile.error)
  throw new Error(ts.formatDiagnostic(configFile.error, formatHost))

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, examplesRoot, undefined, configPath)
const program = ts.createProgram(parsed.fileNames, parsed.options)
const semanticDiagnostics = ts.getPreEmitDiagnostics(program)

if (semanticDiagnostics.length > 0) {
  console.error(ts.formatDiagnosticsWithColorAndContext(semanticDiagnostics, formatHost))
  process.exitCode = 1
}

if (process.exitCode !== 1) {
  const fixtureCount = parsed.fileNames.filter(file => !file.endsWith('ambient.d.ts')).length
  console.log(`✓ canonical docs: ${fenceCount} TypeScript fences parsed; ${fixtureCount} package-backed fixtures typechecked`)
}
