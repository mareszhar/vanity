import type { VanityArm } from './rule'

/** Stable structural identity shared by compilation and emitted provenance. */
export function getArmKey(arm: VanityArm): string {
  return JSON.stringify([arm.media, arm.supports, arm.container, arm.selector, arm.scopes, arm.startingStyle])
}
