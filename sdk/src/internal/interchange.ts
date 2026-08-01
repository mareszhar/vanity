import type { TokenGraph } from '../tokens/graph'
import type { VanityTokenExpressionRecord } from './inspect'

export type VanityJsonValue
  = | string
    | number
    | boolean
    | null
    | readonly VanityJsonValue[]
    | { readonly [key: string]: VanityJsonValue }

/** Optional bridge for an extension whose serializer cannot lower to core IR. */
export interface VanityDtcgCodec {
  /** Stable codec identity stored in authored documents. */
  readonly id: string
  readonly version: string | number
  /** Extension identity this codec makes portable. */
  readonly extension: string
  readonly encode: (input: {
    readonly expression: VanityTokenExpressionRecord
    readonly css: string
  }) => VanityJsonValue
  readonly decode: (input: {
    readonly payload: VanityJsonValue
    readonly css: string
    readonly dependencies: readonly unknown[]
    readonly engine: object
  }) => unknown
}

export const VANITY_SYSTEM_INTERCHANGE = Symbol.for('vanity.systemInterchange')

export interface VanitySystemInterchange {
  readonly graph: TokenGraph
  readonly codecs: readonly VanityDtcgCodec[]
}

export interface VanityInterchangeSystem {
  readonly [VANITY_SYSTEM_INTERCHANGE]: VanitySystemInterchange
}
