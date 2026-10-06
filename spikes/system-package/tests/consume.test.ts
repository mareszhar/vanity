/**
 * Consumer-side DX from the emitted d.ts ALONE (run `pnpm emit` first; the
 * package.json pretest does). The app project resolves `#lib/index` to
 * lib/dist/index.d.ts — no library source in sight, exactly like a published
 * package.
 *
 *   PB1  reads across the full surface typecheck from the d.ts alone
 *   PB2  completions work from the emitted types — first group, last group,
 *        plugin-provided groups; deep branched reads complete their branches
 *   PB3  the portable surface reads identically
 */
import { cursor, defineProject } from '@mszr/selenita/vitest'
import { describe, expect, it } from 'vitest'

const project = defineProject({
  tsconfig: './app/tsconfig.json',
  aliases: { '#lib/*': '../lib/dist/*' },
})

describe('pb1 — the emitted d.ts carries the whole surface', () => {
  it('reads across groups, branches, helpers, and plugin groups typecheck', () => {
    const { errors } = project.check`
      import { ds } from '#lib/index'
      const first: string = ds.t.g0.f0
      const branch: string = ds.t.g29.f2.dark
      const helper: number = ds.helpers.h1_9(1)
      const plugin: number = ds.t.ctl7.a7
      void [first, branch, helper, plugin]
    `
    expect(errors.length).toBe(0)
  })
})

describe('pb2 — completions from the emitted types', () => {
  it('the token tree completes first, last, and plugin-provided groups', () => {
    const observation = project.query`
      import { ds } from '#lib/index'
      ds.t.${cursor}
    `
    expect(observation).toSuggest('g0')
    expect(observation).toSuggest('g29')
    expect(observation).toSuggest('ctl7')
  })

  it('a deep branched field completes its branches', () => {
    const observation = project.query`
      import { ds } from '#lib/index'
      ds.t.g29.f2.${cursor}
    `
    expect(observation).toSuggest('light')
    expect(observation).toSuggest('dark')
  })
})

describe('pb3 — the portable surface reads identically', () => {
  it('portable deep reads complete and typecheck', () => {
    const observation = project.query`
      import { dsPortable } from '#lib/index'
      dsPortable.t.g29.f2.${cursor}
    `
    expect(observation).toSuggest('light')
    expect(observation).toSuggest('dark')
  })
})
