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
import {
  endFileScope,
  getAndIncrementRefCounter,
  getFileScope,
  hasFileScope,
  setFileScope,
} from '@vanilla-extract/css/fileScope'
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
let scopeTransactionId = 0

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
    // Vanilla Extract keeps both its scope stack and its identifier counter in
    // module-global state. A generated style bundle can add several scopes
    // after this function starts and can skip their generated end calls when
    // evaluation throws. Keep a private marker below the logical scope so
    // cleanup can stop at the exact boundary without popping an enclosing
    // caller-owned scope.
    const previousRefCounter = getAndIncrementRefCounter()
    const marker = `\0vanity-scope-transaction-${scopeTransactionId++}`
    const logicalScope = {
      filePath: scope.filePath,
      ...(scope.packageName === undefined
        ? (previous?.packageName === undefined ? {} : { packageName: previous.packageName })
        : { packageName: scope.packageName }),
    }
    const markerScope = {
      filePath: scope.filePath,
      packageName: marker,
    }

    setFileScope(markerScope.filePath, markerScope.packageName)
    setFileScope(logicalScope.filePath, logicalScope.packageName)
    try {
      return operation()
    }
    finally {
      // Drain scopes opened by the operation, including a source-level scope
      // whose `endFileScope()` was skipped by an exception. The marker is
      // below the logical scope and all generated dependency scopes, so the
      // prior scope stack is never guessed at or reconstructed.
      let logicalScopeRemoved = false
      while (hasFileScope()) {
        const current = getFileScope()
        if (current.filePath === markerScope.filePath && current.packageName === markerScope.packageName) {
          endFileScope()
          break
        }
        if (!logicalScopeRemoved
          && current.filePath === logicalScope.filePath
          && current.packageName === logicalScope.packageName) {
          endFileScope()
          logicalScopeRemoved = true
          continue
        }
        if (previous !== undefined
          && current.filePath === previous.filePath
          && current.packageName === previous.packageName) {
          // A malformed generated bundle may over-close its own scopes. Stop
          // at the caller's actual scope rather than popping an enclosing
          // transaction as a best-effort cleanup.
          break
        }
        endFileScope()
      }

      // `setFileScope()` and `endFileScope()` reset the backend counter. The
      // public backend exposes its current value only through the increment
      // operation, so restore the snapshot after the marker is removed. This
      // keeps identifiers deterministic for an enclosing evaluation.
      for (let index = 0; index < previousRefCounter; index++)
        getAndIncrementRefCounter()
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
