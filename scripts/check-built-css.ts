/**
 * Inspect production demo CSS for optimizer regressions that browser behavior
 * alone cannot reveal, including lost relative-color syntax or unexpectedly
 * duplicated Vanity output.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function cssIn(directory: string): string {
  const files = readdirSync(directory)
    .filter(file => file.endsWith('.css'))
    .sort()

  if (files.length === 0)
    throw new Error(`No built CSS found in ${directory}; run pnpm run demo:build first`)

  return files.map(file => readFileSync(join(directory, file), 'utf8')).join('\n')
}

function requirePattern(css: string, pattern: RegExp, label: string): void {
  if (!pattern.test(css))
    throw new Error(`Built CSS lost ${label}: ${pattern}`)
}

function rejectPattern(css: string, pattern: RegExp, label: string): void {
  if (pattern.test(css))
    throw new Error(`Built CSS contains ${label}: ${pattern}`)
}

function requireLayerOrder(css: string, names: readonly string[], label: string): void {
  let cursor = css.indexOf('@layer')
  let declaration: string | undefined
  while (cursor !== -1) {
    const end = css.indexOf(';', cursor)
    const block = css.indexOf('{', cursor)
    if (end !== -1 && (block === -1 || end < block)) {
      declaration = css.slice(cursor + '@layer'.length, end).trim()
      break
    }
    cursor = css.indexOf('@layer', cursor + '@layer'.length)
  }
  const layers = declaration?.split(',').map(name => name.trim())
  if (layers === undefined)
    throw new Error(`Built CSS lost ${label}: no cascade layer-order declaration`)

  let previous = -1
  for (const name of names) {
    const index = layers.indexOf(name)
    if (index === -1 || index <= previous)
      throw new Error(`Built CSS lost ${label}: expected ${names.join(' < ')}, found ${layers.join(' < ')}`)
    previous = index
  }
}

const main = cssIn(join(root, 'sandbox', 'demo-main', '.output', 'public', '_nuxt'))
const comparisonAssets = join(root, 'sandbox', 'demo-comparisons', 'dist', 'assets')
const comparison = cssIn(comparisonAssets)
const comparisonCascade = readFileSync(join(comparisonAssets, 'vanity-cascade.css'), 'utf8')

// These are capability-level checks, deliberately insensitive to valid token
// names, query syntax, and formatter choices in the demos.
requirePattern(main, /@property\s+--prism-[a-z0-9-]+/, 'a typed Prism registration')
requirePattern(main, /@container\b/, 'a container query')
requirePattern(main, /@starting-style/, 'raw @starting-style output')
requirePattern(main, /(?:oklch|oklab|rgb|hsl|hwb|lab|lch|color)\(from\s+var\(--prism-[a-z0-9-]+/, 'relative-color derivation')
requirePattern(main, /color-mix\([^;{}]*var\(--prism-/, 'modern color mixing')
requirePattern(main, /(?:light-dark\(|--lightningcss-light)/, 'native or optimizer-lowered scheme selection')
requirePattern(main, /--prism-v-[a-z0-9-]+/, 'opaque mutable slots')
requirePattern(main, /touch-action:manipulation/, 'the Hail reset')

requirePattern(comparison, /@layer compare(?:\.[a-z0-9-]+)?/, 'Vanity layers beside peer layers')
requirePattern(comparison, /@layer panda-(?:tokens|utilities)/, 'Panda layers')
requirePattern(comparison, /@layer theme/, 'Tailwind theme layer')
requirePattern(comparison, /@property\s+--compare-[a-z0-9-]+/, 'a typed comparison registration')
requirePattern(comparison, /color-mix\([^;{}]*var\(--compare-/, 'comparison color derivation')
requirePattern(comparison, /(?:light-dark\(|--lightningcss-light)/, 'native or optimizer-lowered scheme selection')
requirePattern(comparison, /--compare-v-[a-z0-9-]+/, 'comparison mutable slot')
requireLayerOrder(
  comparisonCascade,
  ['theme', 'base', 'components', 'utilities', 'panda-reset', 'panda-base', 'panda-tokens', 'panda-recipes', 'panda-utilities', 'compare'],
  'host-owned peer-to-Vanity cascade order',
)

for (const [label, css] of [['flagship', main], ['comparison', comparison]] as const) {
  rejectPattern(css, /\[object Object\]|\bundefined\b|\bNaN\b/, `${label} serialization debris`)
}

console.log('✓ built CSS: registrations, modern color, containers, raw rules, layers, and mutable slots survived every optimizer pipeline')
