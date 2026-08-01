interface DuplicateContract {
  readonly instance: symbol
  readonly identities: {
    compatibility: string
    css: string
    runtime: string
    docs: string
  }
  readonly plane: string
  readonly compatibilityId: string
  readonly runtimeSchemaId: string
  ref: (name: string) => string
  style: (className: string, declarations: Record<string, string>, layer?: string) => string
  snapshot: (values?: Record<string, string>) => string
}

export const ds: DuplicateContract
