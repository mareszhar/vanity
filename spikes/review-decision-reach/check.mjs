// Run: pnpm --filter spike-review-decision-reach check
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'

for (const file of await readdir(new URL('.', import.meta.url))) {
  if (file.endsWith('.mjs')) {
    const path = new URL(file, import.meta.url)
    const source = await readFile(path, 'utf8')
    assert(!/from\s+['"][^'"]*(?:@mszr\/vanity|sdk\/src)/.test(source), `${file}: independent model`)
    const result = spawnSync(process.execPath, ['--check', path.pathname], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
}
console.log('Independent modules parse; no SDK implementation imports.')
