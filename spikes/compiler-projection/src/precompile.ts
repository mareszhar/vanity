import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'vite'
import { readContract } from './worker-client.ts'

export interface PrecompileOptions {
  entry: string
  outputDirectory: string
}

export async function precompilePackage(options: PrecompileOptions): Promise<{
  entry: string
  artifact: string
}> {
  const outputDirectory = resolve(options.outputDirectory)
  await mkdir(outputDirectory, { recursive: true })

  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      emptyOutDir: true,
      minify: false,
      ssr: resolve(options.entry),
      rolldownOptions: {
        output: {
          entryFileNames: 'system.js',
        },
      },
      outDir: outputDirectory,
    },
  })

  const artifact = await readContract(resolve(options.entry))
  const artifactFile = resolve(outputDirectory, 'contract.json')
  await writeFile(artifactFile, `${JSON.stringify(artifact, null, 2)}\n`)

  const packageFile = resolve(outputDirectory, 'package.json')
  await writeFile(packageFile, `${JSON.stringify({ type: 'module', exports: './system.js' }, null, 2)}\n`)

  return {
    entry: resolve(outputDirectory, 'system.js'),
    artifact: artifactFile,
  }
}
