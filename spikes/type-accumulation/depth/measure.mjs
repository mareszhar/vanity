/**
 * Depth stress: generate an N-link chain against both accumulation strategies,
 * typecheck each in isolation, and report instantiations / TS2589 / time.
 *
 * Guarded: bounded N list, one tsc process per case, hard per-process timeout so
 * a pathological blow-up can never wedge the machine.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const tsc = join(here, '..', 'node_modules', '.bin', 'tsc')
const NS = [20, 40, 80, 150]
const TIMEOUT_MS = 60_000 // hard cap per typecheck

function gen(kind, n) {
  const importPath = join(here, kind).replace(/\\/g, '/')
  let s = `import { ${kind} } from '${importPath}'\n\nconst built = ${kind}()\n`
  for (let i = 0; i < n; i++) s += `  .add('g${i}', { on${i}: 'x', off${i}: 'y' })\n`
  // force a read of the LAST group so accumulation must have held across depth
  s += `\nconst last = built.read()\nconst probe: keyof typeof last = 'g${n - 1}'\nvoid probe\n`
  return s
}

function measure(kind, n) {
  const dir = mkdtempSync(join(tmpdir(), `depth-${kind}-`))
  try {
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, moduleResolution: 'bundler', module: 'ESNext', target: 'ES2022', lib: ['ES2022'], skipLibCheck: true },
      include: ['chain.ts'],
    }))
    writeFileSync(join(dir, 'chain.ts'), gen(kind, n))
    let out = ''
    try {
      out = execFileSync(tsc, ['--noEmit', '--extendedDiagnostics', '-p', 'tsconfig.json'], { cwd: dir, timeout: TIMEOUT_MS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    }
    catch (e) {
      out = `${e.stdout ?? ''}${e.stderr ?? ''}${e.killed ? '\n[KILLED: exceeded timeout]' : ''}`
    }
    const deep = /TS2589/.test(out)
    const inst = (out.match(/Instantiations:\s+(\d+)/) ?? [])[1] ?? '?'
    const time = (out.match(/Total time:\s+([\d.]+)s/) ?? [])[1] ?? '?'
    return { deep, inst, time }
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('kind   N    TS2589?  instantiations  time')
for (const kind of ['naive', 'lean']) {
  for (const n of NS) {
    const { deep, inst, time } = measure(kind, n)
    console.log(`${kind.padEnd(6)} ${String(n).padEnd(4)} ${(deep ? 'YES' : 'no').padEnd(8)} ${String(inst).padEnd(15)} ${time}s`)
    if (deep && kind === 'naive')
      break // stop escalating a known blow-up
  }
}
