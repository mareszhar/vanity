import { Buffer } from 'node:buffer'
// This worker isolates native parser aborts; run through run.mjs.
import { readFileSync } from 'node:fs'
import { transform } from 'lightningcss'

const rows = JSON.parse(readFileSync(0, 'utf8'))
const results = []
for (const row of rows) {
  console.log(JSON.stringify({ current: row }))
  try {
    let substrate = 'typed'
    transform({ filename: 'probe.css', code: Buffer.from(`.probe{${row.property}:${row.value}}`), visitor: {
      Declaration(declaration) { substrate = declaration.property },
    } })
    results.push({ substrate })
  }
  catch (error) { results.push({ substrate: 'error', reason: error.message }) }
}
console.log(JSON.stringify({ results }))
