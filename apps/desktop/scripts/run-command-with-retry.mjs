import { spawnSync } from 'node:child_process'

/**
 * Runs a synchronous command and retries non-zero exits.
 *
 * @param {string} command Executable to launch.
 * @param {readonly string[]} args Command arguments.
 * @param {object} options Retry and process options.
 * @param {number} [options.attempts] Maximum number of attempts.
 * @param {Function} [options.beforeRetry] Callback before each retry.
 * @param {Function} [options.spawn] Test seam for the process launcher.
 * @param {object} [options.spawnOptions] Options passed to the process launcher.
 * @returns {number} The successful or final exit status.
 */
export function runCommandWithRetry(command, args, options = {}) {
  const attempts = options.attempts ?? 1
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error(`Command attempts must be a positive integer: ${attempts}`)
  }
  const spawn = options.spawn ?? spawnSync

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = spawn(command, args, options.spawnOptions)
    if (result.error !== undefined) throw result.error
    const status = result.status ?? 1
    if (status === 0 || attempt === attempts) return status
    options.beforeRetry?.({ attempt, status })
  }

  throw new Error('Command retry loop completed without a result.')
}
