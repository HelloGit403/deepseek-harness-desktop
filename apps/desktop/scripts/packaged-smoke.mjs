import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { probeHarness } from '../src/harness-server.mjs'

const READY_URL_PATTERN = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/u
const OUTPUT_LIMIT = 128 * 1024

function appendBounded(current, chunk) {
  return (current + chunk).slice(-OUTPUT_LIMIT)
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Packaged Harness process did not stop')), timeoutMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function authenticatedFetch() {
  let cookie
  return async (url, init) => {
    const headers = new Headers(init?.headers)
    if (cookie !== undefined) headers.set('cookie', cookie)
    let response = await fetch(url, { ...init, headers, redirect: 'manual' })
    const setCookie = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie')
    if (setCookie !== null && setCookie !== undefined) cookie = setCookie.split(';', 1)[0]
    const location = response.headers.get('location')
    if (location === null) return response
    const redirectedHeaders = new Headers(init?.headers)
    if (cookie !== undefined) redirectedHeaders.set('cookie', cookie)
    response = await fetch(new URL(location, url), { ...init, headers: redirectedHeaders })
    return response
  }
}

/**
 * Start the packaged CLI, observe its bound URL, and load the assembled Web UI.
 *
 * @param {{ entry: string, executable: string, timeoutMs?: number }} options Packaged paths and timeout.
 * @returns {Promise<void>} Completion after the Web UI answers successfully.
 */
export async function smokePackagedHarness(options) {
  const timeoutMs = options.timeoutMs ?? 90_000
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-smoke-'))
  const child = spawn(options.executable, ['--expose-internals', options.entry, 'web', '--port', '0', '--no-open'], {
    cwd: dataDir,
    env: {
      ...process.env,
      DSH_HOME: dataDir,
      DSH_TELEMETRY_DISABLED: '1',
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''

  try {
    const readyUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Packaged Harness did not become ready within ${timeoutMs}ms\n${output}`))
      }, timeoutMs)
      const onOutput = (chunk) => {
        output = appendBounded(output, chunk.toString())
        const match = READY_URL_PATTERN.exec(output)
        if (match === null) return
        clearTimeout(timer)
        resolve(match[1])
      }
      child.stdout.on('data', onOutput)
      child.stderr.on('data', onOutput)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', code => {
        clearTimeout(timer)
        reject(new Error(`Packaged Harness exited before readiness (code ${String(code)})\n${output}`))
      })
    })

    if (!await probeHarness(readyUrl, { fetchImpl: authenticatedFetch(), timeoutMs: 10_000 })) {
      throw new Error(`Packaged Harness URL did not serve the assembled Web UI\n${output}`)
    }
  }
  finally {
    if (child.exitCode === null) child.kill()
    await waitForExit(child, 10_000)
    await rm(dataDir, { force: true, maxRetries: 3, recursive: true })
  }
}
