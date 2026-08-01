import { pathToFileURL } from 'node:url'

const [, , action, input] = process.argv

try {
  if (!action || !input)
    throw new Error('worker requires an action and input path')

  const module = await import(pathToFileURL(input).href)

  if (action === 'contract') {
    if (!module.ds || typeof module.ds.toPortable !== 'function')
      throw new Error(`${input} does not export a consolidatable 'ds' contract`)
    process.stdout.write(JSON.stringify(module.ds.toPortable()))
  }
  else if (action === 'style') {
    if (!module.default || module.default.format !== 1 || !module.default.contract)
      throw new Error(`${input} does not default-export a compiled style definition`)
    process.stdout.write(JSON.stringify(module.default))
  }
  else {
    throw new Error(`unknown worker action '${action}'`)
  }
}
catch (error) {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
  process.stderr.write(message)
  process.exitCode = 1
}
