import { cursor, defineProject, mark } from '@mszr/selenita/vitest'
import { VANITY_BUILTIN_CONSTRUCTOR_NAMES, VANITY_SYSTEM_MEMBERS } from '@mszr/vanity'
import { createVanityProjectConfig } from '@mszr/vanity/testing'
import { describe, expect, it } from 'vitest'
import { renderVanityNuxtConfigTypes } from './nuxt/configTypes'
import { renderStyleAutoImportDeclarations } from './vite'

const project = defineProject(createVanityProjectConfig({
  tsconfig: './tsconfig.json',
  system: `
    import { createSystem } from '@mszr/vanity'
    export const open = createSystem()
      .addConditions({ open: '&[data-state="open"]' })
      .addTokens({ color: { brand: '#635bff' } })
    export const ds = open.consolidate()
  `,
}))

const nuxtProject = defineProject(createVanityProjectConfig({
  tsconfig: './tsconfig.json',
  files: {
    'nuxt-config.d.ts': renderVanityNuxtConfigTypes(),
  },
}))

const autoImportProject = defineProject(createVanityProjectConfig({
  tsconfig: './tsconfig.json',
  files: {
    'authoring.ts': `
      import { createSystem } from '@mszr/vanity'
      export const ds = createSystem().addTokens({ space: { md: '16px' } }).consolidate()
      export const t = ds.t
      export const style = ds.class
    `,
    'vanity-style-auto-imports.d.ts': renderStyleAutoImportDeclarations([{ from: './authoring.ts', imports: ['ds', 't', 'style'] }]),
  },
}))

const CORE_CANONICAL_VALUES = [
  ...VANITY_BUILTIN_CONSTRUCTOR_NAMES,
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
  'defineAxes',
  'defineConditions',
  'defineConstructor',
  'defineConstructors',
  'defineConsts',
  'definePolicies',
  'definePlugin',
  'defineRules',
  'defineTokens',
  'defineUtils',
  'defaultMode',
  'check',
  'scale',
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
    'restoreStyleAuthoringStub',
    'restorePort',
    'restoreRecipe',
    'restoreRuntimeControllerFactory',
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
    'vanityAppAutoImportPresets',
    'vanityVueAutoImports',
  ],
  config: ['defineVanityConfig'],
  capabilities: [
    'VANITY_CSS_CAPABILITIES',
    'VANITY_COINED_CONSTRUCTOR_NAMES',
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
    'renderStyleAutoImportDeclarations',
    'readStyleExportNames',
    'VANITY_MANIFEST_FORMAT',
    'VANITY_MANIFEST_SCHEMA',
    'VANITY_MANIFEST_VERSION',
    'vanityPlugin',
  ],
  vue: ['propsOf', 'useAnatomy', 'usePorts'],
  nuxt: ['default'],
  wxt: ['default'],
  presets: ['hail'],
  cli: ['assertManifest', 'explainManifestPath', 'inspectManifest', 'readManifest'],
  prepare: ['loadVanityConfig', 'planAutoImportDeclarations', 'writeAutoImportDeclarations'],
  testing: [
    'captureEmission',
    'createVanityProjectConfig',
    'emitOf',
    'foldOf',
    'foldResultOf',
    'renderOf',
    'rendersLike',
  ],
} as const

const CORE_CANONICAL_TYPES = [
  'VanityAngleUnit',
  'VanityAnatomy',
  'VanityAtoms',
  'VanityCondition',
  'VanityCssSupportTarget',
  'VanityCssValue',
  'VanityDiagnostic',
  'VanityDtcgDocument',
  'VanityFlexUnit',
  'VanityFrequencyUnit',
  'VanityLengthUnit',
  'VanityLockedSystem',
  'VanityOpenSystem',
  'VanityPluginDefinition',
  'VanityPort',
  'VanityProps',
  'VanityRecipe',
  'VanityResolutionUnit',
  'VanityRuleInput',
  'VanityRuntimeControllerFactory',
  'VanityRuntimeCaseSelector',
  'VanityRuntimeMutableActions',
  'VanityStyleValue',
  'VanitySystemMap',
  'VanitySystemPlugin',
  'VanityTimeUnit',
  'VanityTokenHandle',
  'VanityTokenCaseSelector',
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

describe('public editor contract', () => {
  it('prewires a real Vanity system without fixture boilerplate', () => {
    const result = project.query`
      import { ds } from '#vanity/system'
      void ds.${cursor}
    `

    expect(result).toSuggest([...VANITY_SYSTEM_MEMBERS, ...VANITY_BUILTIN_CONSTRUCTOR_NAMES], { requireDocumentation: true })
  })

  it('gives every canonical root value a purpose at completion', () => {
    const result = project.query`
      import * as vanity from '@mszr/vanity'
      vanity.${cursor}
    `

    expect(result).toSuggest(CORE_CANONICAL_VALUES, { requireDocumentation: true })
  })

  it('gives every named value on every public entrypoint a purpose at completion', () => {
    const result = project.query`
      import * as runtime from '@mszr/vanity/runtime'
      import * as imports from '@mszr/vanity/imports'
      import * as config from '@mszr/vanity/config'
      import * as capabilities from '@mszr/vanity/capabilities'
      import * as vite from '@mszr/vanity/vite'
      import * as vue from '@mszr/vanity/vue'
      import * as nuxt from '@mszr/vanity/nuxt'
      import * as wxt from '@mszr/vanity/wxt'
      import * as presets from '@mszr/vanity/presets'
      import * as cli from '@mszr/vanity/cli'
      import * as prepare from '@mszr/vanity/prepare'
      import * as testing from '@mszr/vanity/testing'
      void runtime.${cursor('runtime')}
      void imports.${cursor('imports')}
      void config.${cursor('config')}
      void capabilities.${cursor('capabilities')}
      void vite.${cursor('vite')}
      void vue.${cursor('vue')}
      void nuxt.${cursor('nuxt')}
      void wxt.${cursor('wxt')}
      void presets.${cursor('presets')}
      void cli.${cursor('cli')}
      void prepare.${cursor('prepare')}
      void testing.${cursor('testing')}
    `

    for (const [entrypoint, names] of Object.entries(ENTRYPOINT_VALUES)) {
      expect(result.at(entrypoint as keyof typeof ENTRYPOINT_VALUES))
        .toSuggest(names, { requireDocumentation: true })
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
      expect(result.at(cursorName)).toSuggest(names, { requireDocumentation: true })
    }
  })

  it('visibly distinguishes tdef from tdec', () => {
    const result = project.query`
      import { open, ds } from '#vanity/system'
      void open.td${cursor('tdef')}ef
      void ds.td${cursor('tdec')}ec
    `

    expect(result.at('tdef').hover?.documentation).toContain('Define advanced token traits')
    expect(result.at('tdec').hover?.documentation).toContain('Produce CSS declaration data')
    expect(result.at('tdec').hover?.documentation).not.toContain('Define advanced token traits')
  })

  it('documents every accepted tokenOrProperty form at the setter argument', () => {
    const result = project.query`
      import { setCustomProperty } from '@mszr/vanity/runtime'
      declare const element: HTMLElement
      setCustomProperty(element, ${cursor})
    `
    const signature = result.signatureHelp

    expect(signature?.activeParameterIndex).toBe(1)
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

    expect(result.at('condition').hover?.displayText).toContain('(condition) open:')
    expect(result.at('condition').hover?.displayText).toContain('&[data-state=\\"open\\"]')
    expect(result.at('property').hover?.displayText).toContain('(property) color')
    expect(result.at('property').hover?.displayText).not.toContain('(condition)')
    expect(result.at('part').hover?.displayText).toContain('(part condition) root:open:')
    expect(result.at('part').hover?.displayText).toContain('&[data-state=\\"open\\"]')
  })

  it('keeps one local diagnostic for common rule and anatomy mistakes', () => {
    const result = project.check`
      import { ds } from '#vanity/system'
      ds.class({ ${mark('property')`colro`}: 'red' })
      ds.anatomy({
        parts: ['root', 'content'],
        base: { content: { ${mark('condition')`'roto:open'`}: { color: 'red' } } },
      })
    `

    expect(result).toHaveErrorCount(2)
    expect(result).toHaveError(/colro/, { on: result.rangeOf('property') })
    expect(result).toHaveError(/roto:open/, { on: result.rangeOf('condition') })
  })

  it('preserves exact generated auto-import types with no any wall', () => {
    const result = autoImportProject.query`
      void style({ padding: t.space.md })
      void ds.${cursor}class({})
    `

    expect(result.errors).toBeClean()
    expect(result).toSuggest(['class', 'recipe', 'runtime'])
    for (const name of ['class', 'recipe', 'runtime'])
      expect(result.findCompletion(name)?.displayText, name).not.toMatch(/\bany\b/)
  })

  it('documents shared config keys at object-literal completion sites', () => {
    const result = project.query`
      import { defineVanityConfig } from '@mszr/vanity/config'
      import { vanityPlugin } from '@mszr/vanity/vite'

      defineVanityConfig({
        ${cursor('root')}
      })
      defineVanityConfig({
        compiler: {
          ${cursor('compiler')}
        },
        autoImports: {
          ${cursor('autoImports')}
        },
      })
      defineVanityConfig({
        c${cursor('configCompiler')}ompiler: {},
        a${cursor('configAutoImports')}utoImports: {},
      })
      vanityPlugin({
        compiler: {
          ${cursor('viteCompiler')}
        },
        autoImports: {
          ${cursor('viteAutoImports')}
        },
      })
      vanityPlugin({
        c${cursor('viteConfigCompiler')}ompiler: {},
        a${cursor('viteConfigAutoImports')}utoImports: {},
      })
      vanityPlugin({
        compiler: {
          s${cursor('viteSystem')}ystem: './src/system.ts',
        },
        autoImports: {
          st${cursor('viteStyle')}yle: '$system',
          a${cursor('viteApp')}pp: ['core'],
        },
      })
      defineVanityConfig({
        compiler: {
          s${cursor('system')}ystem: './src/system.ts',
        },
        autoImports: {
          st${cursor('style')}yle: '$system',
          a${cursor('app')}pp: ['core'],
        },
      })
      defineVanityConfig({
        autoImports: {
          style: {
            ${cursor('styleOptions')}
          },
          app: {
            ${cursor('appOptions')}
          },
        },
        compiler: {
          system: {
            ${cursor('systemOptions')}
          },
        },
      })
    `

    const expectDocumented = (at: Parameters<typeof result.at>[0], names: readonly string[]) => {
      expect(result.at(at)).toSuggest(names, { requireDocumentation: true })
    }

    expect(result.at('root').findCompletion('compiler')?.documentation).toContain('Compiler')
    expect(result.at('root').findCompletion('autoImports')?.documentation).toContain('module roles')
    expectDocumented('compiler', [
      'identifiers',
      'unstableMode',
      'system',
      'layerOrder',
      'artifactDirectory',
      'diagnostics',
    ])
    expectDocumented('autoImports', ['shared', 'style', 'app'])
    expectDocumented('viteCompiler', ['system'])
    expectDocumented('viteAutoImports', ['shared', 'style', 'app'])
    expectDocumented('styleOptions', ['from', 'include'])
    expectDocumented('systemOptions', ['entry', 'artifact', 'packageName', 'exportName'])
    expectDocumented('appOptions', ['presets', 'sources'])
    expect(result.at('configCompiler').hover?.documentation).toContain('Compiler')
    expect(result.at('configAutoImports').hover?.documentation).toContain('module roles')
    expect(result.at('viteConfigCompiler').hover?.documentation).toContain('Compiler')
    expect(result.at('viteConfigAutoImports').hover?.documentation).toContain('module roles')
    expect(result.at('viteSystem').hover?.documentation).toContain('Plain consolidated system')
    expect(result.at('viteStyle').hover?.documentation).toContain('style modules')
    expect(result.at('viteApp').hover?.documentation).toContain('application')
    expect(result.at('system').hover?.documentation).toContain('Plain consolidated system')
    expect(result.at('style').hover?.displayText).toContain('$system')
    expect(result.at('app').hover?.displayText).toContain('core')
  })

  it('documents the shared config shape through Nuxt module options', () => {
    const completionResult = nuxtProject.query`
      import type { NuxtConfig } from 'nuxt/schema'

      const config: NuxtConfig = {
        va${cursor('nuxtRootCompletion')}nity: {},
      }
    `
    const result = nuxtProject.query`
      import type { NuxtConfig } from 'nuxt/schema'

      const config: NuxtConfig = {
        va${cursor('nuxtRoot')}nity: {
          c${cursor('nuxtCompiler')}ompiler: {
            ${cursor('nuxtCompilerOptions')}
          },
          a${cursor('nuxtAutoImports')}utoImports: {
            ${cursor('nuxtAutoImportOptions')}
          },
        },
      }
    `

    expect(completionResult.at('nuxtRootCompletion').findCompletion('vanity')?.documentation).toContain('Vanity\'s Nuxt adapter configuration')
    expect(result.at('nuxtRoot').hover?.documentation).toContain('Vanity\'s Nuxt adapter configuration')
    expect(result.at('nuxtCompiler').findCompletion('compiler')?.documentation).toContain('Compiler options')
    expect(result.at('nuxtCompilerOptions').findCompletion('system')?.documentation).toMatch(/consolidated/i)
    expect(result.at('nuxtAutoImports').findCompletion('autoImports')?.documentation).toContain('module roles')
    expect(result.at('nuxtAutoImportOptions').findCompletion('app')?.documentation).toContain('application')
  })
})
