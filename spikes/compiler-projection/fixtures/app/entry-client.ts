import one from './one.css.ts'
import { ds } from './system.ts'
import two from './two.css.ts'

const probe = globalThis as typeof globalThis & {
  __projectionProbe: {
    plane: string
    compatibilityId: string
    runtimeSchemaId: string
    classes: string[]
    duplicateInstancesCollapsed: boolean
  }
  __loadProjectionLazy: () => Promise<typeof import('./lazy.ts')>
}

probe.__projectionProbe = {
  plane: ds.plane,
  compatibilityId: ds.compatibilityId,
  runtimeSchemaId: ds.runtimeSchemaId,
  classes: [one, two],
  duplicateInstancesCollapsed: false,
}

probe.__loadProjectionLazy = () => import('./lazy.ts')
