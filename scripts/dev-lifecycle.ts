/**
 * Prove the flagship Nuxt dev server starts and stops cleanly on a real port.
 * This catches leaked middleware/watch processes without assuming Nuxt's
 * internal HMR topology, which moved to one Vite environment server in 4.5.
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

const host = '127.0.0.1'
const demos = ['demo-main'] as const

async function main(): Promise<void> {
  const httpPort = await openPort()
  await assertPortFree(httpPort)

  for (const demo of demos) {
    const child = spawn(
      'pnpm',
      ['--dir', `sandbox/${demo}`, 'run', 'dev', '--host', host, '--port', String(httpPort), '--no-fork'],
      {
        cwd: new URL('..', import.meta.url),
        detached: process.platform !== 'win32',
        env: {
          ...process.env,
          CHOKIDAR_USEPOLLING: 'true',
          CHOKIDAR_INTERVAL: '100',
          NO_COLOR: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let output = ''
    child.stdout?.on('data', chunk => output += String(chunk))
    child.stderr?.on('data', chunk => output += String(chunk))
    try {
      await waitForHttp(`http://${host}:${httpPort}`, child, () => output)
      if (/context method emitFile\(\) is not supported in serve mode/.test(output))
        throw new Error(`Vanity attempted build-only asset emission in serve mode\n${output}`)
      await assertPortBusy(httpPort)
    }
    finally {
      await stopProcessTree(child.pid)
    }

    await waitForPortFree(httpPort, output)
    process.stdout.write(`[vanity] ${demo} dev lifecycle released its HTTP/HMR server port\n`)
  }
}

async function waitForHttp(url: string, child: ReturnType<typeof spawn>, output: () => string): Promise<void> {
  const deadline = Date.now() + 45_000

  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Nuxt dev exited before becoming ready (${child.exitCode})\n${output()}`)

    try {
      const response = await fetch(url)

      if (response.ok)
        return
    }
    catch {}

    await delay(100)
  }

  throw new Error(`Nuxt dev did not become ready\n${output()}`)
}

async function stopProcessTree(pid: number | undefined): Promise<void> {
  if (pid === undefined)
    return

  const target = process.platform === 'win32' ? pid : -pid

  try {
    process.kill(target, 'SIGTERM')
  }
  catch {
    return
  }

  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    try {
      process.kill(target, 0)
      await delay(50)
    }
    catch {
      return
    }
  }

  try {
    process.kill(target, 'SIGKILL')
  }
  catch {}
}

async function waitForPortFree(port: number, output: string, anyHost = false): Promise<void> {
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    if (await canListen(port, anyHost))
      return

    await delay(50)
  }

  throw new Error(`Port ${port} was not released after Nuxt dev stopped\n${output}`)
}

async function assertPortFree(port: number, anyHost = false): Promise<void> {
  if (!await canListen(port, anyHost))
    throw new Error(`Port ${port} is already occupied before the lifecycle test`)
}

async function assertPortBusy(port: number, anyHost = false): Promise<void> {
  if (await canListen(port, anyHost))
    throw new Error(`Expected Nuxt dev to own port ${port}`)
}

function canListen(port: number, anyHost = false): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.unref()
    server.once('error', () => resolve(false))
    const options = anyHost ? { port } : { host, port }
    server.listen(options, () => server.close(() => resolve(true)))
  })
}

async function openPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
