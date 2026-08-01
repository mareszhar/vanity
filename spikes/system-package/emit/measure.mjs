/**
 * Package-boundary stress: per profile, build a work dir holding a `lib`
 * package (builder + generated entry) and an `app` consumer, then measure:
 *
 *   1. LIB declaration emit — time, error codes (TS7056 is the failure mode:
 *      "inferred type exceeds the maximum length the compiler will serialize"),
 *      and the emitted d.ts size;
 *   2. the d.ts's SHAPE — does it spell the raw intersection chain, does it
 *      keep `Simplify` as a type-fest alias reference (making type-fest part
 *      of the public API), or does it flatten;
 *   3. APP check — time and errors, consuming the emitted d.ts ALONE.
 *
 * Work dirs live INSIDE the spike (emit/.work/) so node_modules resolution
 * works naturally; they are recreated per run and gitignored. Guarded: bounded
 * profiles, one tsc process per step, hard per-process timeout.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { genAppProbe, genLibEntry, PROFILES } from './generate.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const root = join(here, '..')
const tsc = join(root, 'node_modules', '.bin', 'tsc')
const work = join(here, '.work')
const TIMEOUT_MS = 180_000

function run(args, cwd) {
  let out = ''
  let failed = false
  try {
    out = execFileSync(tsc, args, { cwd, timeout: TIMEOUT_MS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  }
  catch (e) {
    failed = true
    out = `${e.stdout ?? ''}${e.stderr ?? ''}${e.killed ? '\n[KILLED: exceeded timeout]' : ''}`
  }
  return {
    failed,
    codes: [...new Set(out.match(/TS\d{4,5}/g) ?? [])].join(',') || '-',
    time: (out.match(/Total time:\s+([\d.]+)s/) ?? [])[1] ?? '?',
    firstError: failed ? (out.split('\n').find(l => /error TS/.test(l)) ?? '[no error line]') : '',
  }
}

function measure(name, profile) {
  const dir = join(work, name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'lib', 'src'), { recursive: true })
  mkdirSync(join(dir, 'app', 'src'), { recursive: true })

  for (const f of ['patterns.ts', 'system.ts'])
    cpSync(join(root, 'lib', 'src', f), join(dir, 'lib', 'src', f))
  writeFileSync(join(dir, 'lib', 'src', 'index.ts'), genLibEntry(profile))
  writeFileSync(join(dir, 'lib', 'tsconfig.json'), readFileSync(join(root, 'lib', 'tsconfig.json'), 'utf8'))
  writeFileSync(join(dir, 'app', 'src', 'consume.ts'), genAppProbe(profile, '../../lib/dist/index'))
  writeFileSync(join(dir, 'app', 'tsconfig.json'), readFileSync(join(root, 'app', 'tsconfig.json'), 'utf8'))

  const lib = run(['-p', 'lib/tsconfig.json', '--extendedDiagnostics'], dir)
  let dts = { kb: '?', simplifyRefs: '?', intersections: '?' }
  if (!lib.failed) {
    const text = readFileSync(join(dir, 'lib', 'dist', 'index.d.ts'), 'utf8')
    dts = {
      kb: (statSync(join(dir, 'lib', 'dist', 'index.d.ts')).size / 1024).toFixed(1),
      simplifyRefs: /type-fest|Simplify/.test(text) ? 'YES' : 'no',
      intersections: String((text.match(/& Record</g) ?? []).length),
    }
  }
  const app = lib.failed ? { failed: true, codes: '(skipped)', time: '-', firstError: '' } : run(['-p', 'app/tsconfig.json', '--extendedDiagnostics'], dir)
  return { lib, dts, app }
}

console.log('profile  lib-emit           d.ts     Simplify-refs  raw-&Record<  app-check')
console.log('         time    codes     size KB  in d.ts?       occurrences   time    codes')
for (const [name, profile] of Object.entries(PROFILES)) {
  const { lib, dts, app } = measure(name, profile)
  console.log(`${name.padEnd(8)} ${`${lib.time}s`.padEnd(7)} ${lib.codes.padEnd(9)} ${String(dts.kb).padEnd(8)} ${String(dts.simplifyRefs).padEnd(14)} ${String(dts.intersections).padEnd(13)} ${`${app.time}s`.padEnd(7)} ${app.codes}`)
  for (const step of [lib, app]) {
    if (step.failed && step.firstError)
      console.log(`  ↳ ${step.firstError}`)
  }
  if (lib.failed)
    break // stop escalating a known blow-up
}
rmSync(work, { recursive: true, force: true }) // leave no stray sources for linters to trip on
