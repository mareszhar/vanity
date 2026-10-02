import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { transform } from 'lightningcss'

function parse(name) {
  const rawRules = []
  const rules = []
  try {
    transform({
      filename: 'identifier.css',
      code: Buffer.from(`@probe ${name};`),
      errorRecovery: false,
      visitor: {
        Rule: (r) => {
          rawRules.push(r)
        },
      },
    })
    transform({
      filename: 'identifier.css',
      code: Buffer.from(`@layer parent.${name}.suffix;.sentinel{color:red}`),
      errorRecovery: false,
      visitor: { Rule: (r) => { rules.push(r) } },
    })
  }
  catch {
    return undefined
  }
  const raw = rawRules[0]
  const [layer, sentinel] = rules
  const token = raw?.value.prelude?.[0]
  const identity
    = token?.type === 'dashed-ident'
      ? token.value
      : token?.type === 'token' && token.value.type === 'ident'
        ? token.value.value
        : undefined
  if (
    rawRules.length !== 1
    || rules.length !== 2
    || raw.type !== 'unknown'
    || raw.value.name !== 'probe'
    || raw.value.block !== null
    || raw.value.prelude.length !== 1
    || identity === undefined
    || identity.includes('\uFFFD')
    || identity.includes('.')
    || layer.type !== 'layer-statement'
    || JSON.stringify(layer.value.names)
    !== JSON.stringify([['parent', identity, 'suffix']])
    || sentinel.type !== 'style'
    || sentinel.value.selectors[0][0].name !== 'sentinel'
  ) {
    return undefined
  }
  return identity
}
const invalid = [
  '',
  'my layer',
  '1st',
  'a.b',
  String.raw`a\2e b`,
  'a/**/',
  'a/*',
  'a;/*',
  'a\\',
  'a;',
  'a;@layer b',
  'a; .x{}',
  'a;@layer parent.a.suffix;.sentinel{color:red}/*',
  'a\0b',
  '\uFFFD',
  String.raw`\0`,
  ' a',
  'a ',
]
const valid = new Map([
  ['app', 'app'],
  [String.raw`\61 pp`, 'app'],
  [String.raw`\61 `, 'a'],
  [String.raw`\31 st`, '1st'],
  ['unset', 'unset'],
  ['-x', '-x'],
  ['--x', '--x'],
  ['é', 'é'],
  [String.raw`a\20 b`, 'a b'],
  [String.raw`a\;b`, 'a;b'],
])
for (const name of invalid)
  assert.equal(parse(name), undefined, JSON.stringify(name))
for (const [name, identity] of valid)
  assert.equal(parse(name), identity, JSON.stringify(name))
console.log(
  `PASS: ${invalid.length} invalid and ${valid.size} valid spellings; full token, decoded identity, parent/suffix and sentinel preservation`,
)
