/** Marker injected only by the assembled DeepSeek Harness Web UI. */
const HARNESS_MARKER = 'globalThis["__DSH_BOOT__"]'

/**
 * Extract the authenticated Web UI URL announced by the local Harness server.
 *
 * @param {string} output Accumulated server standard output.
 * @param {string} expectedOrigin Expected loopback origin.
 * @returns {string | undefined} A validated authenticated URL when announced.
 */
export function harnessReadyUrlFromOutput(output, expectedOrigin) {
  for (const match of output.matchAll(/dsh web:\s+(http:\/\/[^\s]+)\r?\n/gu)) {
    try {
      const url = new URL(match[1])
      if (url.origin !== expectedOrigin || url.pathname !== '/' || !url.searchParams.has('token')) continue
      return url.href
    }
    catch {
      // Ignore an incomplete URL while the child-process chunk is still arriving.
    }
  }
  return undefined
}

/**
 * Check whether a URL serves the assembled DeepSeek Harness application.
 *
 * @param {string} url URL to probe.
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options] Probe dependencies and timeout.
 * @returns {Promise<boolean>} Whether the expected Web UI answered successfully.
 */
export async function probeHarness(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 2_000

  try {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return false
    return (await response.text()).includes(HARNESS_MARKER)
  }
  catch {
    return false
  }
}

/**
 * Wait until the Harness server is ready or the deadline expires.
 *
 * @param {string} url URL to probe.
 * @param {{ intervalMs?: number, timeoutMs?: number, probe?: typeof probeHarness, signal?: AbortSignal }} [options] Polling options.
 * @returns {Promise<boolean>} Whether the server became ready.
 */
export async function waitForHarness(url, options = {}) {
  const intervalMs = options.intervalMs ?? 250
  const timeoutMs = options.timeoutMs ?? 60_000
  const probe = options.probe ?? probeHarness
  const signal = options.signal
  const deadline = Date.now() + timeoutMs

  do {
    if (signal?.aborted === true) return false
    if (await probe(url)) return true
    if (signal?.aborted === true) return false
    if (!await new Promise((resolve) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve(true)
      }, intervalMs)
      const onAbort = () => {
        clearTimeout(timer)
        resolve(false)
      }
      signal?.addEventListener('abort', onAbort, { once: true })
    })) return false
  } while (Date.now() < deadline)

  return false
}

/** Build the embedded server arguments without handing the UI to a browser. */
export function desktopServerArgs(entry, port) {
  return ['--expose-internals', entry, 'web', '--port', port, '--no-open']
}
