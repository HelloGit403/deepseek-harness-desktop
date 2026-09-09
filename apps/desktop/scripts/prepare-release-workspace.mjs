import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const DESKTOP_BUILD_PERMISSIONS = new Map([
  ['electron', 'true'],
  ['electron-winstaller', 'false'],
])

/**
 * Adds the desktop-only dependency build permissions to an upstream pnpm workspace file.
 *
 * @param {string} source Upstream `pnpm-workspace.yaml` contents.
 * @returns {string} Updated contents that preserve upstream-owned settings.
 */
export function prepareReleaseWorkspace(source) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source.split(/\r?\n/u)
  const allowBuildsStart = lines.findIndex(line => /^allowBuilds:\s*(?:#.*)?$/u.test(line))
  if (allowBuildsStart === -1) {
    throw new Error('The upstream pnpm workspace does not define allowBuilds.')
  }

  let allowBuildsEnd = lines.length
  for (let index = allowBuildsStart + 1; index < lines.length; index += 1) {
    if (/^\S/u.test(lines[index])) {
      allowBuildsEnd = index
      break
    }
  }

  const additions = []
  for (const [dependency, expected] of DESKTOP_BUILD_PERMISSIONS) {
    const escapedDependency = dependency.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    const entryPattern = new RegExp(`^  ['"]?${escapedDependency}['"]?:\\s*(true|false)\\s*(?:#.*)?$`, 'u')
    const existing = lines.slice(allowBuildsStart + 1, allowBuildsEnd)
      .find(line => entryPattern.test(line))
    if (existing === undefined) {
      additions.push(`  '${dependency}': ${expected}`)
      continue
    }
    const value = entryPattern.exec(existing)?.[1]
    if (value !== expected) {
      throw new Error(`Upstream allowBuilds configures ${dependency} as ${value}; expected ${expected}.`)
    }
  }

  if (additions.length === 0) return source
  lines.splice(allowBuildsEnd, 0, ...additions)
  return lines.join(eol)
}

/**
 * Removes the upstream desktop TypeScript project after the release replaces that package.
 *
 * @param {string} source Upstream `tsconfig.host.json` contents.
 * @returns {string} Updated JSON without the replaced desktop project reference.
 */
export function prepareReleaseHostConfig(source) {
  if (!/"references"\s*:/u.test(source)) {
    throw new Error('The upstream host TypeScript config does not define project references.')
  }
  const desktopReference = /,\s*\{\s*"path"\s*:\s*"\.\/apps\/desktop"\s*\}/u
  if (!desktopReference.test(source)) {
    throw new Error('The upstream host TypeScript config does not reference ./apps/desktop.')
  }
  const updated = source.replace(desktopReference, '')
  if (desktopReference.test(updated)) {
    throw new Error('The upstream host TypeScript config references ./apps/desktop more than once.')
  }
  return updated
}

/**
 * Removes the replaced upstream desktop package from the Host bundler workspace.
 *
 * @param {string} source Upstream root `tsdown.config.ts` contents.
 * @returns {string} Updated source without the replaced desktop package.
 */
export function prepareReleaseBundlerConfig(source) {
  const desktopWorkspace = /,\s*['"]apps\/desktop['"]/u
  if (!desktopWorkspace.test(source)) {
    throw new Error('The upstream bundler config does not include apps/desktop.')
  }
  const updated = source.replace(desktopWorkspace, '')
  if (desktopWorkspace.test(updated)) {
    throw new Error('The upstream bundler config includes apps/desktop more than once.')
  }
  return updated
}

async function main() {
  const [workspacePath, hostConfigPath, bundlerConfigPath] = process.argv.slice(2)
  if (!workspacePath || !hostConfigPath || !bundlerConfigPath) {
    throw new Error(
      'Usage: prepare-release-workspace.mjs <pnpm-workspace.yaml> <tsconfig.host.json> <tsdown.config.ts>',
    )
  }
  const workspace = await readFile(workspacePath, 'utf8')
  const hostConfig = await readFile(hostConfigPath, 'utf8')
  const bundlerConfig = await readFile(bundlerConfigPath, 'utf8')
  await writeFile(workspacePath, prepareReleaseWorkspace(workspace), 'utf8')
  await writeFile(hostConfigPath, prepareReleaseHostConfig(hostConfig), 'utf8')
  await writeFile(bundlerConfigPath, prepareReleaseBundlerConfig(bundlerConfig), 'utf8')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
