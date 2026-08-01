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

function requireCount(css: string, pattern: RegExp, count: number, label: string): void {
  const actual = css.match(pattern)?.length ?? 0
  if (actual !== count)
    throw new Error(`Built CSS emitted ${label} ${actual} times; expected ${count}`)
}

const main = cssIn(join(root, 'sandbox', 'demo-main', '.output', 'public', '_nuxt'))
const comparisonAssets = join(root, 'sandbox', 'demo-comparisons', 'dist', 'assets')
const comparison = cssIn(comparisonAssets)
const comparisonCascade = readFileSync(join(comparisonAssets, 'vanity-cascade.css'), 'utf8')

// The palette's one runtime-addressable input is the hue channel; brand and every
// surface derive from it, so the typed registration lives on the channel.
requirePattern(main, /@property --prism-color-hue/, 'the typed hue-channel registration')
requirePattern(main, /@container specimen\s*\((?:min-width:\s*26rem|width\s*>=\s*26rem)\)/, 'the named specimen container query')
requirePattern(main, /@starting-style/, 'raw @starting-style output')
requirePattern(main, /oklch\(from var\(--prism-color-/, 'relative-color derivation')
requirePattern(main, /color-mix\(in oklab,/, 'modern color mixing')
requirePattern(main, /(?:light-dark\(|--lightningcss-light)/, 'native or optimizer-lowered scheme selection')
requirePattern(main, /--prism-v-[a-z0-9-]+/, 'opaque mutable slots')
requireCount(main, /touch-action:manipulation/g, 1, 'the Hail reset')

requirePattern(comparison, /@layer compare\.tokens\.base/, 'vanity token layers beside peer layers')
requirePattern(comparison, /@layer panda-(?:tokens|utilities)/, 'Panda layers')
requirePattern(comparison, /@layer theme/, 'Tailwind theme layer')
requirePattern(comparison, /--compare-color-hue/, 'the comparison lane\'s live hue channel')
requirePattern(comparison, /color-mix\(in oklab/, 'comparison color derivation')
requirePattern(comparison, /(?:light-dark\(|--lightningcss-light)/, 'native or optimizer-lowered scheme selection')
requirePattern(comparison, /--compare-v-[a-z0-9-]+/, 'comparison mutable slot')
requirePattern(
  comparisonCascade,
  /@layer properties,\s*theme,\s*base,\s*components,\s*utilities,\s*panda-reset,\s*panda-base,\s*panda-tokens,\s*panda-recipes,\s*panda-utilities,\s*compare/,
  'host-owned peer-to-Vanity cascade order',
)

for (const [label, css] of [['flagship', main], ['comparison', comparison]] as const) {
  rejectPattern(css, /\[object Object\]|\bundefined\b|\bNaN\b/, `${label} serialization debris`)
}

console.log('✓ built CSS: registrations, modern color, containers, raw rules, layers, and mutable slots survived every optimizer pipeline')
