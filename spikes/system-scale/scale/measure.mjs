/**
 * Whole-system scale stress: generate a realistic chain per profile, typecheck
 * each in isolation, report instantiations / memory / time / any diagnostics.
 *
 * Guarded: bounded profile list, one tsc process per case, hard per-process
 * timeout so a pathological blow-up can never wedge the machine.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { genSystem, PROFILES } from './generate.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const tsc = join(here, '..', 'node_modules', '.bin', 'tsc')
const srcImport = join(here, '..', 'src', 'system').replace(/\\/g, '/')
const TIMEOUT_MS = 180_000 // hard cap per typecheck

function measure(name, profile) {
  const dir = mkdtempSync(join(tmpdir(), `system-scale-${name}-`))
  try {
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, moduleResolution: 'bundler', module: 'ESNext', target: 'ES2022', lib: ['ES2022'], skipLibCheck: true },
      include: ['chain.ts'],
    }))
    writeFileSync(join(dir, 'chain.ts'), genSystem(profile, { importPath: srcImport }))
    let out = ''
    let failed = false
    try {
      out = execFileSync(tsc, ['--noEmit', '--extendedDiagnostics', '-p', 'tsconfig.json'], { cwd: dir, timeout: TIMEOUT_MS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    }
    catch (e) {
      failed = true
      out = `${e.stdout ?? ''}${e.stderr ?? ''}${e.killed ? '\n[KILLED: exceeded timeout]' : ''}`
    }
    const codes = [...new Set(out.match(/TS\d{4,5}/g) ?? [])].join(',') || '-'
    const inst = (out.match(/Instantiations:\s+(\d+)/) ?? [])[1] ?? '?'
    const mem = (out.match(/Memory used:\s+(\d+)K/) ?? [])[1]
    const time = (out.match(/Total time:\s+([\d.]+)s/) ?? [])[1] ?? '?'
    const firstError = failed ? (out.split('\n').find(l => /error TS/.test(l)) ?? '[no error line]') : ''
    return { failed, codes, inst, mem: mem ? `${Math.round(Number(mem) / 1024)}MB` : '?', time, firstError }
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('profile  groups×fields  errors?  codes     instantiations  memory   time')
for (const [name, profile] of Object.entries(PROFILES)) {
  const r = measure(name, profile)
  console.log(`${name.padEnd(8)} ${`${profile.groups}×${profile.fields}`.padEnd(14)} ${(r.failed ? 'YES' : 'no').padEnd(8)} ${r.codes.padEnd(9)} ${String(r.inst).padEnd(15)} ${String(r.mem).padEnd(8)} ${r.time}s`)
  if (r.failed) {
    console.log(`  ↳ ${r.firstError}`)
    break // stop escalating a known blow-up
  }
}
