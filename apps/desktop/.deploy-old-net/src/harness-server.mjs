/** Marker injected only by the assembled DeepSeek Harness Web UI. */
const HARNESS_MARKER = 'globalThis["__DSH_BOOT__"]'

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
 * @param {{ intervalMs?: number, timeoutMs?: number, probe?: typeof probeHarness }} [options] Polling options.
 * @returns {Promise<boolean>} Whether the server became ready.
 */
export async function waitForHarness(url, options = {}) {
  const intervalMs = options.intervalMs ?? 250
  const timeoutMs = options.timeoutMs ?? 60_000
  const probe = options.probe ?? probeHarness
  const deadline = Date.now() + timeoutMs

  do {
    if (await probe(url)) return true
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  } while (Date.now() < deadline)

  return false
}

/** Build the embedded server arguments without handing the UI to a browser. */
export function desktopServerArgs(entry, port) {
  return ['--expose-internals', entry, 'web', '--port', port, '--no-open']
}
