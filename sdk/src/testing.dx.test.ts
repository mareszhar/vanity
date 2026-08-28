import { cursor, defineVanityProject } from '@mszr/vanity/testing'
import { describe, expect, it } from 'vitest'
import { styleAutoImportDeclarations } from './vite'
import '@mszr/selenita/vitest'

const project = defineVanityProject({
  tsconfig: './tsconfig.json',
  system: `
    import { createSystem } from '@mszr/vanity'
    export const open = createSystem()
      .addConditions({ open: '&[data-state="open"]' })
      .addTokens({ color: { brand: '#635bff' } })
    export const ds = open.consolidate()
  `,
})

const autoImportProject = defineVanityProject({
  tsconfig: './tsconfig.json',
  files: {
    'authoring.ts': `
      import { createSystem } from '@mszr/vanity'
      export const ds = createSystem().addTokens({ space: { md: '16px' } }).consolidate()
      export const t = ds.t
      export const css = ds.class
    `,
    'auto-imports.d.ts': styleAutoImportDeclarations('./authoring.ts', ['ds', 't', 'css']),
  },
})

const CORE_CANONICAL_VALUES = [
  'aria',
  'axis',
  'colorSchemes',
  'condition',
  'container',
  'createCssValueSerializer',
  'createSystem',
  'data',
  'defineCssOperation',
  'defineCssSupportTarget',
  'defineCssValue',
  'definePlugin',
  'defineTokens',
  'didYouMean',
  'exportDesignTokens',
  'formatExplanation',
  'formatVanityDiagnostic',
  'fromEntries',
  'fromTokenGroup',
  'importDesignTokens',
  'mapRecord',
  'media',
  'moduleRoot',
  'normalizeDiagnostic',
  'ports',
  'propertyAliases',
  'range',
  'reportDiagnostics',
  'schemeIs',
  'scope',
  'selector',
  'supports',
  'systemRoot',
  'thisMode',
  'unsafe',
  'VANITY_BUILTIN_CONSTRUCTOR_NAMES',
  'VANITY_DEFAULT_CSS_SUPPORT',
  'VANITY_DEFAULT_LAYERS',
  'VANITY_DTCG_EXTENSION',
  'VANITY_DTCG_EXTENSION_VERSION',
  'VANITY_INTROSPECTION_FORMAT',
  'VANITY_INTROSPECTION_VERSION',
  'VANITY_SYSTEM_MEMBERS',
  'VANITY_SYSTEM_SURFACE_VERSION',
  'VanityError',
] as const

const ENTRYPOINT_VALUES = {
  runtime: [
    'bindPort',
    'ports',
    'restoreAnatomy',
    'restoreAtoms',
    'restoreBuildPlane',
    'restorePort',
    'restoreRecipe',
    'restoreRuntimeFactory',
    'restoreRuntimeProps',
    'restoreRuntimeReconciler',
    'restoreRuntimeStyle',
    'restoreSnapshotFrom',
    'restoreToken',
    'setCustomProperties',
    'setCustomProperty',
  ],
  imports: [
    'vanityCoreAutoImports',
    'vanityRuntimeAutoImportPresets',
    'vanityVueAutoImports',
  ],
  capabilities: [
    'VANITY_CSS_CAPABILITIES',
    'VANITY_CSS_NAMED_API_ROWS',
    'VANITY_CSS_PARITY_LEDGER',
    'VANITY_HELPER_MATURITY_POLICY',
  ],
  vite: [
    'default',
    'applyDebugNames',
    'audit',
    'buildAgentContext',
    'buildManifest',
    'diffManifests',
    'formatAuditFindings',
    'formatManifestDiff',
    'generateAgentContext',
    'styleAutoImportDeclarations',
    'styleExportNames',
    'VANITY_MANIFEST_FORMAT',
    'VANITY_MANIFEST_SCHEMA',
    'VANITY_MANIFEST_VERSION',
    'vanityPlugin',
  ],
  vue: ['propsOf', 'useAnatomy', 'usePorts'],
  nuxt: ['default'],
  presets: ['hail'],
  cli: ['assertManifest', 'explainManifestPath', 'inspectManifest', 'readManifest'],
  testing: [
    'captureEmission',
    'cursor',
    'defineVanityProject',
    'emitOf',
    'foldOf',
    'foldResultOf',
    'group',
    'renderOf',
    'rendersLike',
    'snippet',
  ],
} as const

const CORE_CANONICAL_TYPES = [
  'VanityAnatomy',
  'VanityAtoms',
  'VanityCondition',
  'VanityCssSupportTarget',
  'VanityCssValue',
  'VanityDiagnostic',
  'VanityDtcgDocument',
  'VanityLockedSystem',
  'VanityOpenSystem',
  'VanityPluginDefinition',
  'VanityPort',
  'VanityProps',
  'VanityRecipe',
  'VanityRuleInput',
  'VanityRuntimeFactory',
  'VanityStyleValue',
  'VanitySystemMapV1',
  'VanitySystemPlugin',
  'VanityTokenHandle',
  'VanityTokenInput',
] as const

const TESTING_CANONICAL_TYPES = [
  'VanityEmission',
  'VanityEmissionOptions',
  'VanityFoldObservation',
  'VanityFoldToken',
  'VanityProjectConfig',
  'VanityRenderedProperties',
  'VanityRenderExpectation',
  'VanityRenderElement',
  'VanityRenderTarget',
] as const

describe('public Phase 11 editor contract', () => {
  it('prewires a real Vanity system without fixture boilerplate', () => {
    const result = project.query`
      import { ds } from '#vanity/system'
      void ds.${cursor}
    `

    expect(result.completions).toContainCompletions([
      't',
      'class',
      'recipe',
      'anatomy',
      'runtime',
      'introspect',
    ])
  })

  it('gives every canonical root value a purpose at completion', () => {
    const result = project.query`
      import * as vanity from '@mszr/vanity'
      vanity.${cursor}
    `

    for (const name of CORE_CANONICAL_VALUES) {
      const item = result.completionItem(name)
      expect(item, name).toBeDefined()
      expect(item!.documentation, name).not.toBe('')
    }
  })

  it('gives every named value on every public entrypoint a purpose at completion', () => {
    const result = project.query`
      import * as runtime from '@mszr/vanity/runtime'
      import * as imports from '@mszr/vanity/imports'
      import * as capabilities from '@mszr/vanity/capabilities'
      import * as vite from '@mszr/vanity/vite'
      import * as vue from '@mszr/vanity/vue'
      import * as nuxt from '@mszr/vanity/nuxt'
      import * as presets from '@mszr/vanity/presets'
      import * as cli from '@mszr/vanity/cli'
      import * as testing from '@mszr/vanity/testing'
      void runtime.${cursor('runtime')}
      void imports.${cursor('imports')}
      void capabilities.${cursor('capabilities')}
      void vite.${cursor('vite')}
      void vue.${cursor('vue')}
      void nuxt.${cursor('nuxt')}
      void presets.${cursor('presets')}
      void cli.${cursor('cli')}
      void testing.${cursor('testing')}
    `

    for (const [entrypoint, names] of Object.entries(ENTRYPOINT_VALUES)) {
      const at = result.at(entrypoint)
      for (const name of names) {
        const item = at.completionItem(name)
        expect(item, `${entrypoint}:${name}`).toBeDefined()
        expect(item!.documentation, `${entrypoint}:${name}`).not.toBe('')
      }
    }
  })

  it('keeps canonical authoring and testing type carriers documented', () => {
    const result = project.query`
      import type { ${cursor('core')} } from '@mszr/vanity'
      import type { ${cursor('testing')} } from '@mszr/vanity/testing'
    `

    for (const [cursorName, names] of [
      ['core', CORE_CANONICAL_TYPES],
      ['testing', TESTING_CANONICAL_TYPES],
    ] as const) {
      const at = result.at(cursorName)
      for (const name of names) {
        const item = at.completionItem(name)
        expect(item, `${cursorName}:${name}`).toBeDefined()
        expect(item!.documentation, `${cursorName}:${name}`).not.toBe('')
      }
    }
  })

  it('visibly distinguishes tdef from tdec', () => {
    const result = project.query`
      import { open, ds } from '#vanity/system'
      void open.td${cursor('tdef')}ef
      void ds.td${cursor('tdec')}ec
    `

    expect(result.at('tdef').hover).toContain('Define advanced token traits')
    expect(result.at('tdec').hover).toContain('Produce CSS declaration data')
    expect(result.at('tdec').hover).not.toContain('Define advanced token traits')
  })

  it('documents every accepted tokenOrProperty form at the setter argument', () => {
    const result = project.query`
      import { setCustomProperty } from '@mszr/vanity/runtime'
      declare const element: HTMLElement
      setCustomProperty(element, ${cursor})
    `
    const signature = result.signatureHelp

    expect(signature?.activeParameter).toBe(1)
    expect(signature?.signatures[0]?.parameters[1]?.documentation)
      .toContain('`\'--name\'`, `{ name }`, `{ $name }`, or token handle')
  })

  it('brands conditions and part conditions differently from CSS properties', () => {
    const result = project.query`
      import { ds } from '#vanity/system'
      ds.class({
        op${cursor('condition')}en: { color: 'red' },
        col${cursor('property')}or: 'red',
      })
      ds.anatomy({
        parts: ['root', 'content'],
        base: {
          content: {
            'root:op${cursor('part')}en': { color: 'red' },
          },
        },
      })
    `

    expect(result.at('condition').hover).toContain('(condition) open:')
    expect(result.at('condition').hover).toContain('&[data-state=\\"open\\"]')
    expect(result.at('property').hover).toContain('(property) color')
    expect(result.at('property').hover).not.toContain('(condition)')
    expect(result.at('part').hover).toContain('(part condition) root:open:')
    expect(result.at('part').hover).toContain('&[data-state=\\"open\\"]')
  })

  it('keeps one local diagnostic for common rule and anatomy mistakes', () => {
    const { errors } = project.check`
      import { ds } from '#vanity/system'
      ds.class({ colro: 'red' })
      ds.anatomy({
        parts: ['root', 'content'],
        base: { content: { 'roto:open': { color: 'red' } } },
      })
    `

    expect(errors).toHaveErrorCount(2)
    expect(errors).toHaveError(/colro/)
    expect(errors).toHaveError(/roto:open/)
  })

  it('preserves exact generated auto-import types with no any wall', () => {
    const result = autoImportProject.query`
      void css({ padding: t.space.md })
      void ds.${cursor}class({})
    `

    expect(result.errors).toBeClean()
    expect(result.completions).toContainCompletions(['class', 'recipe', 'runtime'])
    for (const name of ['class', 'recipe', 'runtime'])
      expect(result.completionItem(name)?.type, name).not.toMatch(/\bany\b/)
  })
})
