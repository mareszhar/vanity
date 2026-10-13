/** What a compiler result established; unresolved is never a successful check. */
export type VanityEvidence
  = | { level: 'type' }
    | { level: 'environments', environments: readonly string[] }
    | { level: 'sampled', samples: number, parameters: Readonly<Record<string, unknown>> }
    | { level: 'unresolved', reason: string }
