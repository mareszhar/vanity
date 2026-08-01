import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer } from 'vite'
import { describe, expect, it } from 'vitest'
import { compilerProjection } from '../src/plugin.ts'
import { copyMutableFixture, waitFor } from './helpers.ts'

describe('dev-server invalidation lifecycle', () => {
  it('recovers from contract changes and an introduced-then-fixed dependency error', async () => {
    const fixture = await copyMutableFixture()
    const harness = compilerProjection({
      contracts: [fixture.system],
      target: 'browser',
      cascade: ['vendor', 'neutral'],
      artifactDirectory: join(fixture.root, 'artifacts'),
    })
    const server = await createServer({
      root: fixture.app,
      configFile: false,
      logLevel: 'silent',
      plugins: [harness.plugin],
      server: {
        middlewareMode: true,
        watch: { usePolling: true, interval: 20 },
      },
    })

    try {
      const initial = await server.transformRequest('/one.css.ts')
      expect(initial?.code).toContain('compiler-projection:system-css:')
      const initialSystemImport = initial!.code.match(/system-css:([a-f0-9]+)\.css/)?.[1]
      expect(initialSystemImport).toBeTruthy()
      const manifestBeforeValue = JSON.parse(await readFile(harness.snapshot().manifestFile, 'utf8')) as {
        systems: Array<{ identities: Record<string, string> }>
      }

      const revisionBeforeValueChange = harness.snapshot().revision
      await writeFile(fixture.palette, [
        `export const BRAND = '#2563eb'`,
        `export const SPACE = '8px'`,
        '',
      ].join('\n'))
      await waitFor(
        () => harness.snapshot().revision > revisionBeforeValueChange,
        'the contract value HMR refresh',
      )

      const afterValueChange = await server.transformRequest('/one.css.ts')
      const changedSystemImport = afterValueChange!.code.match(/system-css:([a-f0-9]+)\.css/)?.[1]
      expect(changedSystemImport).toBeTruthy()
      expect(changedSystemImport).not.toBe(initialSystemImport)
      const manifestAfterValue = JSON.parse(await readFile(harness.snapshot().manifestFile, 'utf8')) as {
        systems: Array<{ identities: Record<string, string> }>
      }
      expect(manifestAfterValue.systems[0]!.identities.css)
        .not
        .toBe(manifestBeforeValue.systems[0]!.identities.css)
      expect(manifestAfterValue.systems[0]!.identities.compatibility)
        .toBe(manifestBeforeValue.systems[0]!.identities.compatibility)
      expect(manifestAfterValue.systems[0]!.identities.runtime)
        .toBe(manifestBeforeValue.systems[0]!.identities.runtime)
      expect(manifestAfterValue.systems[0]!.identities.docs)
        .toBe(manifestBeforeValue.systems[0]!.identities.docs)

      const revisionBeforeError = harness.snapshot().revision
      await writeFile(fixture.palette, [
        `export const BRAND = ''`,
        `export const SPACE = '8px'`,
        '',
      ].join('\n'))
      await waitFor(
        () => harness.snapshot().revision > revisionBeforeError,
        'the introduced dependency error',
      )
      await expect(server.transformRequest('/one.css.ts')).rejects.toThrow(
        `token 'brand' has an empty value`,
      )

      const revisionBeforeFix = harness.snapshot().revision
      await writeFile(fixture.palette, [
        `export const BRAND = '#16a34a'`,
        `export const SPACE = '8px'`,
        '',
      ].join('\n'))
      await waitFor(
        () => harness.snapshot().revision > revisionBeforeFix,
        'the fixed dependency refresh',
      )

      const recovered = await server.transformRequest('/one.css.ts')
      expect(recovered?.code).toContain('compiler-projection:style-css:')
      expect(recovered?.code).toContain('compiler-projection:system-css:')
      expect(harness.snapshot().errors).toEqual([])
    }
    finally {
      await server.close()
    }
  })

  it('a documentation-only change rewrites the manifest without touching system CSS', async () => {
    const fixture = await copyMutableFixture()
    const harness = compilerProjection({
      contracts: [fixture.system],
      target: 'browser',
      cascade: ['vendor', 'neutral'],
      artifactDirectory: join(fixture.root, 'artifacts'),
    })
    const server = await createServer({
      root: fixture.app,
      configFile: false,
      logLevel: 'silent',
      plugins: [harness.plugin],
      server: {
        middlewareMode: true,
        watch: { usePolling: true, interval: 20 },
      },
    })

    try {
      await server.transformRequest('/one.css.ts')
      const before = harness.snapshot()
      const cssFile = before.systemCssFiles[0]!
      const cssContents = await readFile(cssFile, 'utf8')
      const cssStat = await stat(cssFile)
      const manifestBefore = JSON.parse(await readFile(before.manifestFile, 'utf8')) as {
        systems: Array<{ identities: Record<string, string> }>
      }

      await new Promise(resolve => setTimeout(resolve, 25))
      const revisionBeforeDocs = before.revision
      await writeFile(fixture.metadata, `export const BRAND_DESCRIPTION = 'Updated documentation only.'\n`)
      await waitFor(
        () => harness.snapshot().revision > revisionBeforeDocs,
        'the documentation manifest refresh',
      )

      const after = harness.snapshot()
      const manifestAfter = JSON.parse(await readFile(after.manifestFile, 'utf8')) as {
        systems: Array<{ identities: Record<string, string> }>
      }
      const cssStatAfter = await stat(cssFile)

      expect(manifestAfter.systems[0]!.identities.docs)
        .not
        .toBe(manifestBefore.systems[0]!.identities.docs)
      expect(manifestAfter.systems[0]!.identities.compatibility)
        .toBe(manifestBefore.systems[0]!.identities.compatibility)
      expect(manifestAfter.systems[0]!.identities.css)
        .toBe(manifestBefore.systems[0]!.identities.css)
      expect(manifestAfter.systems[0]!.identities.runtime)
        .toBe(manifestBefore.systems[0]!.identities.runtime)
      expect(after.cssWrites).toBe(before.cssWrites)
      expect(after.manifestWrites).toBe(before.manifestWrites + 1)
      expect(await readFile(cssFile, 'utf8')).toBe(cssContents)
      expect(cssStatAfter.mtimeMs).toBe(cssStat.mtimeMs)
    }
    finally {
      await server.close()
    }
  })
})
