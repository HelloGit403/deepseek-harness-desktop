import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const NODE_LICENSE_PREFIX = 'Node.js is licensed for use as follows:'

function assertNodeLicense(text, source) {
  if (!text.startsWith(NODE_LICENSE_PREFIX)) throw new Error(`The Node.js license from ${source} was not recognized`)
}

async function loadNodeLicense(executable, licensePath, fetchImpl) {
  if (licensePath !== undefined) {
    if (!existsSync(licensePath)) throw new Error(`Configured Node.js license does not exist: ${licensePath}`)
    assertNodeLicense(readFileSync(licensePath, 'utf8'), licensePath)
    return { path: licensePath }
  }
  const installedLicense = join(dirname(executable), 'LICENSE')
  if (existsSync(installedLicense)) {
    assertNodeLicense(readFileSync(installedLicense, 'utf8'), installedLicense)
    return { path: installedLicense }
  }

  const urls = [
    `https://nodejs.org/dist/${process.version}/LICENSE`,
    `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`,
  ]
  const failures = []
  for (const url of urls) {
    try {
      const response = await fetchImpl(url)
      if (!response.ok) {
        failures.push(`${url}: HTTP ${String(response.status)}`)
        continue
      }
      const text = await response.text()
      if (!text.startsWith(NODE_LICENSE_PREFIX)) {
        failures.push(`${url}: unrecognized response`)
        continue
      }
      return { text }
    }
    catch (error) {
      failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error(`Unable to obtain the Node.js ${process.version} license\n${failures.join('\n')}`)
}

/**
 * Copy the build Node.js executable and its license into the staged desktop app.
 *
 * Native packages installed by the same executable therefore use the ABI that
 * launches Harness, instead of Electron's embedded and potentially newer ABI.
 *
 * @param {{ executable?: string, fetchImpl?: typeof fetch, licensePath?: string, stageDir: string }} options Staging inputs.
 * @returns {Promise<{ executable: string, license: string }>} Staged runtime paths.
 */
export async function stageNodeRuntime(options) {
  const executable = options.executable ?? process.execPath
  if (!existsSync(executable)) throw new Error(`Node.js executable does not exist: ${executable}`)
  const runtimeDir = join(options.stageDir, 'runtime')
  const stagedExecutable = join(runtimeDir, 'node.exe')
  const stagedLicense = join(runtimeDir, 'LICENSE.node.txt')
  mkdirSync(runtimeDir, { recursive: true })
  copyFileSync(executable, stagedExecutable)
  const license = await loadNodeLicense(executable, options.licensePath, options.fetchImpl ?? fetch)
  if (license.path !== undefined) copyFileSync(license.path, stagedLicense)
  else writeFileSync(stagedLicense, license.text, 'utf8')
  return { executable: stagedExecutable, license: stagedLicense }
}
