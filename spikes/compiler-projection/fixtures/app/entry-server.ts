import { ds } from './system.ts'

export function renderSnapshot() {
  return {
    plane: ds.plane,
    compatibilityId: ds.compatibilityId,
    snapshot: ds.snapshot({ brand: '#ffffff' }),
  }
}
