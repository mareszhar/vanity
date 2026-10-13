// Independent evaluator model used by the host and package-request experiments.
import { readFile } from 'node:fs/promises'
import { createRequire, isBuiltin, SourceMap } from 'node:module'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
import { build } from 'esbuild'

export function packageName(request) {
  if (!/^(?:@[\w.-]+\/[\w.-]+|[\w.-]+)(?:\/|$)/.test(request) || request.startsWith('.'))
    return undefined
  return request.startsWith('@') ? request.split('/').slice(0, 2).join('/') : request.split('/')[0]
}
export async function packageAt(file) {
  if (!isAbsolute(file))
    return undefined
  let directory = dirname(file.replace(/[?#].*$/, ''))
  while (directory !== parse(directory).root) {
    try {
      return { directory, metadata: JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) }
    }
    catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')
        throw error
    }
    directory = dirname(directory)
  }
}
function selectedByBrowser(file, pkg) {
  const relative = `./${file.slice(pkg.directory.length + 1)}`
  const matches = target => typeof target === 'string' && new RegExp(`^${target.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(relative)
  const walk = (value, browser = false) => typeof value === 'string'
    ? browser && matches(value)
    : Array.isArray(value)
      ? value.some(item => walk(item, browser))
      : value && typeof value === 'object' ? Object.entries(value).some(([key, child]) => walk(child, browser || key === 'browser')) : false
  const field = pkg.metadata.browser
  return walk(pkg.metadata.exports) || matches(field) || (field && typeof field === 'object' && Object.values(field).some(matches))
}
function disabledByBrowser(request, file, pkg) {
  if (!pkg || pkg.metadata.name !== packageName(request))
    return false
  const browser = pkg.metadata.browser
  if (browser && typeof browser === 'object' && Object.entries(browser).some(([key, value]) => value === false && resolve(pkg.directory, key) === file))
    return true
  const subpath = request === pkg.metadata.name ? '.' : `.${request.slice(pkg.metadata.name.length)}`
  let exports = pkg.metadata.exports
  if (exports && typeof exports === 'object' && Object.keys(exports).some(key => key.startsWith('.'))) {
    const exact = exports[subpath]
    const patterns = Object.keys(exports).filter(key => key.includes('*') && subpath.startsWith(key.split('*')[0]) && subpath.endsWith(key.split('*')[1])).sort((a, b) => b.split('*')[0].length - a.split('*')[0].length || b.length - a.length)
    exports = exact === undefined ? exports[patterns[0]] : exact
  }
  const select = (value, inBrowser = false) => {
    if (value === null)
      return inBrowser
    if (Array.isArray(value))
      return value.some(child => select(child, inBrowser))
    if (!value || typeof value !== 'object')
      return false
    for (const [key, child] of Object.entries(value)) {
      if (['browser', 'import', 'default'].includes(key))
        return select(child, inBrowser || key === 'browser')
    }
    return false
  }
  return select(exports)
}
export async function compile(entry, resolver, loader, externalResolve, compilerCode, sourceLoader) {
  const requests = []
  const bypass = {}
  const result = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false, sourcemap: 'external', outfile: `${entry}.cjs`, metafile: true, logLevel: 'silent', plugins: [{
    name: 'request-resolution',
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData === bypass)
          return
        if (args.kind === 'entry-point')
          return { path: entry }
        const external = externalResolve?.(args.path)
        if (external)
          return { path: external, external: true }
        if (compilerCode?.(args.importer)) {
          const node = await builder.resolve(args.path, { kind: args.kind, resolveDir: dirname(args.importer), importer: args.importer, pluginData: bypass })
          if (node.errors.length)
            return { errors: node.errors }
          requests.push({ specifier: args.path, importer: args.importer, result: node.path, rule: 'compiler-code' })
          return { path: node.path, external: node.external }
        }
        let answer
        try {
          answer = await resolver(args.path, args.importer)
        }
        catch (error) {
          const name = !isBuiltin(args.path) && packageName(args.path)
          const node = name && await builder.resolve(args.path, { kind: args.kind, resolveDir: dirname(args.importer), importer: args.importer, pluginData: bypass })
          if (!node || node.errors.length || !disabledByBrowser(args.path, node.path, await packageAt(node.path)))
            throw new Error(`Cannot resolve ${JSON.stringify(args.path)} imported by ${args.importer}: ${error.message}`)
          answer = { id: node.path, external: node.external }
        }
        if (!answer)
          throw new Error(`Cannot resolve ${JSON.stringify(args.path)} imported by ${args.importer}: host returned no resolution`)
        // A server-only host may name a native external rather than an absolute file.
        // Bundle the request the host returned, from this importer, with Node conditions.
        if (answer.external && !isAbsolute(answer.id) && !answer.id.startsWith('\0')) {
          const node = await builder.resolve(answer.id, { kind: args.kind, resolveDir: dirname(args.importer), importer: args.importer, pluginData: bypass })
          if (node.errors.length)
            throw new Error(`Cannot resolve ${JSON.stringify(args.path)} imported by ${args.importer}: host external ${answer.id}: ${node.errors.map(error => error.text).join('; ')}`)
          requests.push({ specifier: args.path, importer: args.importer, client: answer.id, result: node.path, rule: 'host-native-external' })
          return { path: node.path, external: node.external }
        }
        const pkg = await packageAt(answer.id)
        const name = packageName(args.path)
        const disabled = answer.id.startsWith('__vite-browser-external')
        if (disabled && isBuiltin(args.path)) {
          requests.push({ specifier: args.path, importer: args.importer, client: answer.id, result: args.path, rule: 'native-builtin' })
          return { path: args.path, external: true }
        }
        if (!isBuiltin(args.path) && name && (name === pkg?.metadata.name || disabled)) {
          const node = await builder.resolve(args.path, { kind: args.kind, resolveDir: dirname(args.importer), importer: args.importer, pluginData: bypass })
          const nodePackage = disabled && !node.errors.length ? await packageAt(node.path) : undefined
          if (!node.errors.length && (!disabled || disabledByBrowser(args.path, node.path, nodePackage))) {
            requests.push({ specifier: args.path, importer: args.importer, client: answer.id, result: node.path, rule: 'package-name' })
            return { path: node.path, external: node.external }
          }
          if (!disabled)
            throw new Error(`Cannot resolve ${JSON.stringify(args.path)} imported by ${args.importer} for Node: ${node.errors.map(error => error.text).join('; ')}`)
        }
        if (disabled)
          throw new Error(`Cannot resolve ${JSON.stringify(args.path)} imported by ${args.importer}: the client resolver selected an empty browser module. Import the package by name in the style module.`)
        requests.push({ specifier: args.path, importer: args.importer, client: answer.id, result: answer.id, rule: 'client', browserFile: pkg ? selectedByBrowser(answer.id.replace(/[?#].*$/, ''), pkg) : false })
        return { path: answer.id, ...(isAbsolute(answer.id) && !/[?#]/.test(answer.id) ? {} : { namespace: 'host' }) }
      })
      builder.onLoad({ filter: /.*/, namespace: 'host' }, async (args) => {
        let loaded = await loader(args.path)
        // Vite's filesystem fallback runs outside pluginContainer.load in dev.
        // Keep the host ID; only filesystem reading uses its query-free filename.
        if (loaded == null && isAbsolute(args.path))
          loaded = await readFile(args.path.replace(/[?#].*$/, ''), 'utf8')
        if (loaded == null)
          throw new Error(`Host did not load ${args.path}`)
        return { contents: typeof loaded === 'string' ? loaded : loaded.code, loader: /\.[cm]?ts(?:[?#]|$)/.test(args.path) ? 'ts' : /\.tsx(?:[?#]|$)/.test(args.path) ? 'tsx' : 'js', resolveDir: isAbsolute(args.path) ? dirname(args.path) : undefined }
      })
      if (sourceLoader)
        builder.onLoad({ filter: /\.[cm]?[jt]sx?$/, namespace: 'file' }, args => sourceLoader(args.path))
    },
  }] })
  const inputFile = (file) => {
    const id = file.startsWith('host:') ? file.slice(5) : file
    return isAbsolute(id) ? id.replace(/[?#].*$/, '') : resolve(id).replace(/[?#].*$/, '')
  }
  const moduleInputs = new Map(Object.entries(result.metafile.inputs).map(([file, input]) => [inputFile(file), input]))
  return { moduleInputs, inputFile, source: result.outputFiles.find(file => file.path.endsWith('.cjs')).text, map: JSON.parse(result.outputFiles.find(file => file.path.endsWith('.map')).text), requests, inputs: Object.keys(result.metafile.inputs) }
}
export function evaluate(bundle, nativeRequire = createRequire(import.meta.url)) {
  const module = { exports: {} }
  try {
    // eslint-disable-next-line no-new-func -- Execute the local CommonJS bundle in its module wrapper.
    new Function('module', 'exports', 'require', bundle.source)(module, module.exports, nativeRequire)
    return module.exports
  }
  catch (error) {
    let throwingFile
    for (const location of error.stack?.matchAll(/<anonymous>:(\d+):(\d+)/g) ?? []) {
      const frame = new SourceMap(bundle.map).findEntry(Number(location[1]) - 3, Number(location[2]) - 1)
      const file = frame?.originalSource && bundle.inputFile(frame.originalSource)
      if (bundle.moduleInputs.has(file)) {
        throwingFile = file
        break
      }
    }
    const ancestors = new Set()
    const queue = throwingFile ? [throwingFile] : []
    while (queue.length) {
      const current = queue.shift()
      if (ancestors.has(current))
        continue
      ancestors.add(current)
      for (const [importer, input] of bundle.moduleInputs) {
        if (input.imports.some(edge => !edge.external && bundle.inputFile(edge.path) === current))
          queue.push(importer)
      }
    }
    const requests = bundle.requests.filter(request => request.browserFile && bundle.moduleInputs.has(bundle.inputFile(request.result)) && (!throwingFile || ancestors.has(bundle.inputFile(request.result))))
    if (requests.length) {
      const detail = requests.map(request => `${JSON.stringify(request.specifier)} imported by ${request.importer}: client resolution selected package browser file ${request.result}. Import the package by name in the style module.`).join('\n')
      throw new Error(`${error.message}\n${throwingFile ? 'Browser-selected imports in the throwing module chain' : 'Possible causes (the stack did not identify a bundled module)'}:\n${detail}`, { cause: error })
    }
    throw error
  }
}
