import { cpSync } from 'node:fs'
import { relative, sep } from 'node:path'

/** Copy authored skill sources without carrying fixture build artifacts. */
export function copySkillSources(source: string, destination: string): void {
  const generatedDirectories = new Set(['node_modules', '.nuxt', '.output', '.vanity'])
  cpSync(source, destination, {
    recursive: true,
    filter: file => !relative(source, file).split(sep).some(segment => generatedDirectories.has(segment)),
  })
}
