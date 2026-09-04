import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('published package contracts', () => {
  it('keeps the workspace CLI bin target available before SDK build output exists', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../sdk/package.json', import.meta.url), 'utf8')) as {
      bin?: Record<string, string>
    }
    const target = packageJson.bin?.vanity

    assert.ok(target, 'the SDK must publish a vanity CLI bin')
    assert.ok(target.startsWith('./bin/'), 'the workspace bin must use an install-time launcher')
    await access(new URL(`../sdk/${target.slice(2)}`, import.meta.url))
  })

  it('keeps the TypeScript plugin diagnostic code in the public diagnostic union', async () => {
    const plugin = await readFile(new URL('../sdk/typescript.cjs', import.meta.url), 'utf8')
    const diagnostics = await readFile(new URL('../sdk/src/diagnostics.ts', import.meta.url), 'utf8')
    const code = /const AMBIENT_SOURCE_CODE = '([^']+)'/.exec(plugin)?.[1]

    assert.ok(code, 'the TypeScript plugin must name its diagnostic code')
    assert.match(diagnostics, new RegExp(`\\|\\s*'${code.replaceAll('_', '\\_')}'`))
    assert.match(plugin, /\$\{AMBIENT_SOURCE_CODE\}:/)
  })
})
