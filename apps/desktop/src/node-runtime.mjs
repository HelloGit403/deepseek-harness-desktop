import { join } from 'node:path'

/**
 * Resolve the regular Node.js executable used by the local Harness service.
 *
 * @param {{ env?: NodeJS.ProcessEnv, isPackaged: boolean, resourcesPath: string }} options Runtime context.
 * @returns {string} Node.js executable path or command.
 */
export function resolveNodeRuntime(options) {
  if (options.isPackaged) return join(options.resourcesPath, 'app', 'runtime', 'node.exe')
  const env = options.env ?? process.env
  return env.DSH_DESKTOP_NODE ?? env.npm_node_execpath ?? 'node'
}
