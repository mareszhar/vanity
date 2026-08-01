/** Temporarily attribute generated CSS to its semantic owner module. */

import { endFileScope, getFileScope, hasFileScope, setFileScope } from '@vanilla-extract/css/fileScope'

export function withEmissionFileScope<T>(file: string, run: () => T): T {
  const previous = hasFileScope() ? getFileScope() : undefined

  if (previous?.filePath === file)
    return run()

  if (previous)
    endFileScope()
  setFileScope(file, previous?.packageName)
  try {
    return run()
  }
  finally {
    endFileScope()
    if (previous)
      setFileScope(previous.filePath, previous.packageName)
  }
}
