import copyAStyle from './duplicates/a/copy-a.css.ts'
import { ds as copyA } from './duplicates/a/system.js'
import copyBStyle from './duplicates/b/copy-b.css.ts'
import { ds as copyB } from './duplicates/b/system.js'

const probe = globalThis as typeof globalThis & {
  __duplicateProjectionProbe: {
    classes: string[]
    duplicateInstancesCollapsed: boolean
    compatibilityId: string
  }
}

probe.__duplicateProjectionProbe = {
  classes: [copyAStyle, copyBStyle],
  duplicateInstancesCollapsed: copyA === copyB,
  compatibilityId: copyA.compatibilityId,
}
