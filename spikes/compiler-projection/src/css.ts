import type { CompiledStyleDefinition, PortableContract } from './types.ts'

function declarationBlock(declarations: Record<string, string>): string {
  return Object.entries(declarations).map(([property, value]) => `  ${property}: ${value};`).join('\n')
}

export function renderSystemCss(contract: PortableContract): string {
  const declarations = Object.fromEntries([
    ...contract.tokens.map(token => [`--${contract.prefix}-${token.name}`, token.value] as const),
    ['--projection-system-artifact', `"${contract.identities.css}"`],
  ])

  return [
    `@layer ${contract.layerRoot};`,
    `@layer ${contract.layerRoot}.tokens, ${contract.layerRoot}.components, ${contract.layerRoot}.utilities;`,
    `@layer ${contract.layerRoot}.tokens {`,
    ' :root {',
    declarationBlock(declarations),
    ' }',
    '}',
    '',
  ].join('\n')
}

export function renderStyleCss(style: CompiledStyleDefinition): string {
  return [
    `@layer ${style.contract.layerRoot}.${style.layer} {`,
    ` .${style.className} {`,
    declarationBlock({
      ...style.declarations,
      '--projection-style-artifact': `"${style.className}"`,
    }),
    ' }',
    '}',
    '',
  ].join('\n')
}

export function renderCascadePrelude(cascade: readonly string[]): string {
  return `@layer ${cascade.join(', ')};\n`
}
