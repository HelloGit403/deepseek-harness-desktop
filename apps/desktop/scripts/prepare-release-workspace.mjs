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

async function main() {
  const [workspacePath] = process.argv.slice(2)
  if (!workspacePath) throw new Error('Usage: prepare-release-workspace.mjs <pnpm-workspace.yaml>')
  const source = await readFile(workspacePath, 'utf8')
  await writeFile(workspacePath, prepareReleaseWorkspace(source), 'utf8')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
