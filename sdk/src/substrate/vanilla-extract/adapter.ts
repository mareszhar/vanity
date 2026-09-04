import type { Adapter, FileScope } from '@vanilla-extract/css'
import type {
  VanityClassEmission,
  VanityCustomPropertyEmission,
  VanityFileScope,
  VanityFontFaceEmission,
  VanityFunctionSerialization,
  VanityGlobalRuleEmission,
  VanityKeyframesEmission,
  VanityLayerEmission,
  VanityPortableModuleSubstrate,
  VanityRawEmission,
  VanityStyleModuleResult,
  VanityStyleModuleTransform,
  VanitySubstrate,
  VanityVanillaExtractCapture,
  VanityVanillaExtractIdentOption,
  VanityVanillaExtractModuleLifecycle,
} from '../types'
import { createRequire } from 'node:module'
import { cwd } from 'node:process'
import {
  createGlobalVar,
  createVar,
  generateIdentifier,
  globalLayer,
  globalStyle,
  style,
} from '@vanilla-extract/css'
import { appendCss as appendCssToAdapter, removeAdapter, setAdapter } from '@vanilla-extract/css/adapter'
import { endFileScope, getFileScope, hasFileScope, setFileScope } from '@vanilla-extract/css/fileScope'
import { addFunctionSerializer } from '@vanilla-extract/css/functionSerializer'
import { transformCss } from '@vanilla-extract/css/transformCss'
import {
  addFileScope,
  getPackageInfo,
  parseFileScope,
  serializeVanillaModule,
  stringifyFileScope,
} from '@vanilla-extract/integration'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import { VanityError } from '../../diagnostics'

interface VanityRawCssBlock {
  readonly type: 'vanityRaw'
  readonly css: string
}

type VanillaCss = Parameters<typeof transformCss>[0]['cssObjs'][number]
type VanillaComposition = Parameters<Adapter['registerComposition']>[0]

let substrateRequire: ReturnType<typeof createRequire> | undefined

export function createVanillaExtractSubstrate(): VanitySubstrate {
  const css = createCssSubstrate()
  const { modules, backend } = createModuleSubstrate()
  return Object.freeze({ css, modules, backend })
}

function createCssSubstrate() {
  const emitClassRule = (input: VanityClassEmission): string => style(input.rule as never, input.debugId)

  const emitGlobalRule = (input: VanityGlobalRuleEmission): void => {
    globalStyle(input.selector, input.rule as never)
  }

  const emitRawCss = (input: VanityRawEmission): void => {
    appendCss({ type: 'vanityRaw', css: input.css } satisfies VanityRawCssBlock, convertToVanillaFileScope(input.fileScope ?? getCurrentFileScopeValue()))
  }

  const emitKeyframes = (input: VanityKeyframesEmission): string => {
    const name = generateIdentifier(input.debugId)
    emitRawCss({ css: input.render(name) })
    return name
  }

  const emitFontFace = (input: VanityFontFaceEmission): string => {
    const family = generateIdentifier(input.debugId)
    emitRawCss({ css: input.render(family) })
    return `"${family}"`
  }

  const emitLayer = (input: VanityLayerEmission): void => {
    if (input.parent === undefined)
      globalLayer(input.name)
    else
      globalLayer({ parent: input.parent }, input.name)
  }

  const createCustomProperty = (label?: string): `--${string}` => {
    const reference = createVar(label)
    return reference.slice(4, -1) as `--${string}`
  }

  const registerCustomProperty = (input: VanityCustomPropertyEmission): void => {
    createGlobalVar(input.name, input.registration as never)
  }

  return Object.freeze({
    emitClassRule,
    emitGlobalRule,
    emitRawCss,
    emitKeyframes,
    emitFontFace,
    emitLayer,
    createCustomProperty,
    registerCustomProperty,
    getStyleModuleFile,
    hasStyleModuleFile,
  })
}

function createModuleSubstrate(): {
  readonly modules: VanityPortableModuleSubstrate
  readonly backend: VanityVanillaExtractModuleLifecycle
} {
  const runInFileScope = <Result>(scope: VanityFileScope, operation: () => Result): Result => {
    const previous = hasFileScope() ? createVanityFileScope(getFileScope()) : undefined

    if (previous?.filePath === scope.filePath)
      return operation()

    if (previous)
      endFileScope()
    setFileScope(scope.filePath, scope.packageName ?? previous?.packageName)
    try {
      return operation()
    }
    finally {
      endFileScope()
      if (previous)
        setFileScope(previous.filePath, previous.packageName)
    }
  }

  const registerFunctionSerialization = (fn: (...args: unknown[]) => unknown, descriptor: VanityFunctionSerialization): void => {
    addFunctionSerializer(fn as (...args: never[]) => unknown, {
      importPath: descriptor.importPath,
      importName: descriptor.importName,
      args: descriptor.args as never,
    })
  }

  const transformStyleModule = (input: VanityStyleModuleTransform): VanityStyleModuleResult => {
    const output: string[] = []
    let ordinary: VanillaCss[] = []

    const flush = () => {
      if (ordinary.length === 0)
        return
      output.push(...transformCss({
        localClassNames: [...input.localClassNames],
        composedClassLists: input.composedClassLists as VanillaComposition[],
        cssObjs: ordinary,
      }))
      ordinary = []
    }

    for (const css of input.cssObjects) {
      if ((css as VanityRawCssBlock).type === 'vanityRaw') {
        flush()
        output.push((css as VanityRawCssBlock).css)
      }
      else {
        ordinary.push(css as VanillaCss)
      }
    }
    flush()
    return { css: output.join('\n') }
  }

  const installCapture = (capture: VanityVanillaExtractCapture): void => {
    const adapter: Adapter = {
      appendCss: (css, fileScope) => capture.appendCss(css, createVanityFileScope(fileScope)),
      registerClassName: (className, fileScope) => capture.registerClassName(className, createVanityFileScope(fileScope)),
      registerComposition: (composition, fileScope) => capture.registerComposition(composition, createVanityFileScope(fileScope)),
      markCompositionUsed: capture.markCompositionUsed,
      onEndFileScope: fileScope => capture.finishFileScope?.(createVanityFileScope(fileScope)),
      getIdentOption: capture.getIdentOption,
    }
    setAdapter(adapter)
  }

  const removeCapture = (): void => removeAdapter()
  const setCurrentFileScope = (scope: VanityFileScope): void => setFileScope(scope.filePath, scope.packageName)
  const finishCurrentFileScope = (): void => endFileScope()

  const initialize = (): void => {
    const require = substrateRequire ??= createRequire(`${cwd()}/package.json`)
    for (const entry of ['@vanilla-extract/css', '@vanilla-extract/css/adapter', '@vanilla-extract/css/fileScope', '@vanilla-extract/css/functionSerializer'])
      require(entry)
  }

  const modules: VanityPortableModuleSubstrate = Object.freeze({
    runInFileScope,
    registerFunctionSerialization,
    transformStyleModule,
  })

  const backend: VanityVanillaExtractModuleLifecycle = {
    installCapture,
    removeCapture,
    setFileScope: setCurrentFileScope,
    finishFileScope: finishCurrentFileScope,
    serializeFileScope: scope => stringifyFileScope(convertToVanillaFileScope(scope)),
    parseFileScope: serialized => createVanityFileScope(parseFileScope(serialized)),
    serializeStyleModule: (cssImports, exports, unusedCompositionRegex) => serializeVanillaModule([...cssImports], exports, unusedCompositionRegex),
    addFileScope,
    getPackageName: path => getPackageInfo(path).name,
    resolveModule: specifier => (substrateRequire ??= createRequire(`${cwd()}/package.json`)).resolve(specifier),
    initialize,
    createVitePlugins: options => vanillaExtractPlugin(options as never),
  }

  return { modules, backend: Object.freeze(backend) }
}

function getStyleModuleFile(): VanityFileScope | undefined {
  return hasFileScope() ? createVanityFileScope(getFileScope()) : undefined
}

function hasStyleModuleFile(): boolean {
  return hasFileScope()
}

function appendCss(css: VanillaCss | VanityRawCssBlock, fileScope: FileScope): void {
  appendCssToAdapter(css as never, fileScope)
}

function getCurrentFileScopeValue(): VanityFileScope {
  if (!hasFileScope()) {
    throw new VanityError({
      code: 'VANITY_SUBSTRATE_INVALID_STATE',
      message: 'CSS emission requires an active file scope',
      path: ['fileScope'],
      fix: 'run CSS emission from within an active style-module evaluation',
    })
  }
  return createVanityFileScope(getFileScope())
}

function convertToVanillaFileScope(scope: VanityFileScope): FileScope {
  return scope.packageName === undefined
    ? { filePath: scope.filePath }
    : { filePath: scope.filePath, packageName: scope.packageName }
}

function createVanityFileScope(scope: FileScope): VanityFileScope {
  return scope.packageName === undefined
    ? { filePath: scope.filePath }
    : { filePath: scope.filePath, packageName: scope.packageName }
}

export type { VanityVanillaExtractIdentOption }
