import type { Jsonify } from 'type-fest'

export interface TokenDefinition {
  name: string
  value: string
  mutable?: boolean
  description?: string
  provenance?: string
}

export interface BuildExtension {
  id: string
  version: string
  options?: Record<string, string | number | boolean>
  utility: (value: string) => string
}

export interface ContractDefinition {
  name: string
  prefix: string
  layerRoot: string
  policies: Record<string, string | number | boolean>
  extensions: BuildExtension[]
  tokens: TokenDefinition[]
  runtimePorts: string[]
}

export interface ContractIdentities {
  compatibility: string
  css: string
  runtime: string
  docs: string
}

export interface PortableContractShape {
  format: 1
  name: string
  prefix: string
  layerRoot: string
  policies: Record<string, string | number | boolean>
  extensions: Array<{
    id: string
    version: string
    options: Record<string, string | number | boolean>
  }>
  tokens: TokenDefinition[]
  runtimePorts: string[]
  identities: ContractIdentities
}

export type PortableContract = Jsonify<PortableContractShape>

export interface CompiledStyleDefinition {
  format: 1
  className: string
  declarations: Record<string, string>
  layer: string
  contract: PortableContract
}
