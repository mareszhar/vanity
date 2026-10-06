/** Editor projects resolve package imports through the SDK tsconfig's source aliases. */
import type { Plugin, Project, ProjectConfig } from '@mszr/selenita'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineProject } from '@mszr/selenita/vitest'

/** Declare at collection time; the Vitest scope owns warm-up and disposal. */
export function vanityProject(...configs: ProjectConfig[]): Project {
  return defineProject({ tsconfig: './tsconfig.json' }, ...configs)
}

/** The shipped plugin runs against Selenita's native language service. */
export const vanityTypeScriptPlugin = createRequire(import.meta.url)(
  fileURLToPath(new URL('../../typescript.cjs', import.meta.url)),
) as Plugin
