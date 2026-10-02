import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'vite'

function htmlInputs(config) {
  const input = config.build.rollupOptions.input
  return input === undefined
    ? [resolve(config.root, 'index.html')]
    : [
        ...(typeof input === 'string'
          ? [input]
          : Array.isArray(input)
            ? input
            : Object.values(input)),
      ].map(file => resolve(config.root, file))
}
const roots = []
const groups = new Map()
const observations = []
const plugin = {
  name: 'observe-host',
  configResolved(config) {
    groups.set(config, { active: false, closed: false })
  },
  buildStart() {
    const config = this.environment.getTopLevelConfig()
    groups.get(config).active = true
  },
  transformIndexHtml(html, context) {
    const candidates = [...groups].filter(
      ([config, state]) =>
        state.active
        && !config.build.ssr
        && htmlInputs(config).includes(context.filename),
    )
    observations.push({
      filename: context.filename,
      environment: !!this?.environment,
      candidates: candidates.length,
    })
    assert.equal(candidates.length, 1)
    return html
  },
  closeBundle() {
    if (!this.meta.watchMode) {
      const config = this.environment.getTopLevelConfig()
      groups.get(config).active = false
      groups.get(config).closed = true
    }
  },
  closeWatcher() {
    const config = this.environment.getTopLevelConfig()
    groups.get(config).active = false
    groups.get(config).closed = true
  },
}
try {
  for (let i = 0; i < 2; i++) {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), 'html-host-spike-')),
    )
    roots.push(root)
    await writeFile(
      join(root, 'index.html'),
      '<script type="module" src="/main.js"></script>',
    )
    await writeFile(join(root, 'main.js'), 'export const x=1')
  }
  const config = (root, extra = {}) => ({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [plugin],
    build: { write: false, ...extra },
  })
  await build(config(roots[0]))
  await build(config(roots[0]))
  await Promise.all([
    build(config(roots[0])),
    build(config(roots[0], { ssr: join(roots[0], 'main.js') })),
  ])
  await Promise.all(roots.map(root => build(config(root))))
  await writeFile(
    join(roots[0], 'about.html'),
    '<script type="module" src="/main.js"></script>',
  )
  await build(
    config(roots[0], {
      rollupOptions: {
        input: {
          index: join(roots[0], 'index.html'),
          about: join(roots[0], 'about.html'),
        },
      },
    }),
  )
  assert.equal(observations.length, 7)
  const watcher = await build(config(roots[0], { watch: {} }))
  await new Promise((resolve, reject) =>
    watcher.on('event', (event) => {
      if (event.code === 'END')
        resolve()
      if (event.code === 'ERROR')
        reject(event.error)
    }),
  )
  assert.ok([...groups.values()].some(state => state.active))
  await watcher.close()
  assert.ok([...groups.values()].every(state => !state.active))
  assert.ok(
    [...groups.values()].every(state => !state.active && state.closed),
  )
  console.log(JSON.stringify({ observations, allCompletedHostsClosed: true }))
}
finally {
  for (const root of roots) await rm(root, { recursive: true, force: true })
}
