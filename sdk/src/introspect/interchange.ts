import type { VanityResolvedPolicies } from '../system/policies'
import type { TokenGraph } from '../tokens/module'
import type { VanityValueKernel } from '../values/kernel'
import type { VanityTokenExpressionRecord } from './records'

export type VanityJsonValue
  = | string
    | number
    | boolean
    | null
    | readonly VanityJsonValue[]
    | { readonly [key: string]: VanityJsonValue }

/** Narrow, system-owned context supplied to authored DTCG codec hooks. */
export interface VanityDtcgDecodeContext {
  readonly values: VanityValueKernel
  readonly policies: VanityResolvedPolicies
  readonly codecs: readonly VanityDtcgCodec[]
}

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
    readonly context: VanityDtcgDecodeContext
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
