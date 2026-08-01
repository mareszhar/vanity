import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function writeIfChanged(file: string, contents: string): Promise<boolean> {
  let current: string | undefined
  try {
    current = await readFile(file, 'utf8')
  }
  catch {
    // Missing is the expected first-write case.
  }

  if (current === contents)
    return false

  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, contents)
  return true
}
