import { createSystem } from '../index'
import { substrate } from '../substrate'

/**
 * Small test fixture convenience over the open-system verbs.
 * Production code has no options-in-createSystem shortcut; fixtures keep the
 * setup readable while still exercising addTokens/addConditions/consolidate.
 */
export function createFixtureSystem(options: {
  readonly baseConditions?: boolean
  readonly layerOrder?: readonly string[]
  readonly prefix?: string
  readonly tokens?: object
  readonly conditions?: Record<string, unknown>
} = {}) {
  return substrate.modules.runInFileScope({
    filePath: 'src/test-support/system.ts',
    packageName: '@vanity/fixture',
  }, () => {
    let open: any = createSystem()
    if (options.tokens !== undefined)
      open = open.addTokens(options.tokens)
    if (options.conditions !== undefined)
      open = open.addConditions(options.conditions)
    return open.consolidate({
      ...(options.baseConditions === undefined ? {} : { baseConditions: options.baseConditions }),
      ...(options.layerOrder === undefined ? {} : { layerOrder: options.layerOrder }),
      ...(options.prefix === undefined ? {} : { prefix: options.prefix }),
    })
  })
}
