import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { copySkillSources } from './skill-sources'

test('skill fixture copies preserve authored sources and exclude generated directories at every depth', () => {
  const root = mkdtempSync(join(tmpdir(), 'vanity-skill-sources-'))
  try {
    const source = join(root, 'source')
    const destination = join(root, 'project')
    mkdirSync(join(source, 'app/components'), { recursive: true })
    const authored = { 'nuxt.config.ts': 'export default {}\n', 'app/components/Card.vue': '<template>Card</template>\n' }
    for (const [file, text] of Object.entries(authored))
      writeFileSync(join(source, file), text)
    for (const prefix of ['', 'app/components/']) {
      for (const directory of ['node_modules', '.nuxt', '.output', '.vanity']) {
        mkdirSync(join(source, prefix, directory), { recursive: true })
        writeFileSync(join(source, prefix, directory, 'generated.txt'), 'not authored')
      }
    }
    copySkillSources(source, destination)
    for (const [file, text] of Object.entries(authored))
      assert.equal(readFileSync(join(destination, file), 'utf8'), text)
    for (const prefix of ['', 'app/components/']) {
      for (const directory of ['node_modules', '.nuxt', '.output', '.vanity'])
        assert.equal(existsSync(join(destination, prefix, directory)), false, `${prefix}${directory} must not enter a prepared project`)
    }
    // A clean fixture has exactly the same source contract.
    const clean = join(root, 'clean')
    copySkillSources(destination, clean)
    for (const [file, text] of Object.entries(authored))
      assert.equal(readFileSync(join(clean, file), 'utf8'), text)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
