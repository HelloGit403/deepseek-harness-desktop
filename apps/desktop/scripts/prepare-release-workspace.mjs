import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const DESKTOP_BUILD_PERMISSIONS = new Map([
  ['electron', 'true'],
  ['electron-winstaller', 'false'],
])

const WORKSPACE_FILE_DRAG_PACKAGE = '@deepseek-ai/dsh-client-ui-workspace-file-drag'

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
  const withoutOfficialDesktop = source
    .replace(/^\s*\{\s*"path"\s*:\s*"\.\/apps\/desktop(?:\/tsconfig\.host\.json)?"\s*\},?\r?\n/gmu, '')
    .replace(/^\s*"apps\/web\/tests\/(?:desktop-onboarding|shortcuts-desktop)\.e2e\.ts",?\r?\n/gmu, '')
  const shortcutsHost = './packages/client/shortcuts/tsconfig.host.json'
  if (withoutOfficialDesktop.includes(`"path": "${shortcutsHost}"`)) return withoutOfficialDesktop
  const eol = withoutOfficialDesktop.includes('\r\n') ? '\r\n' : '\n'
  return withoutOfficialDesktop.replace(
    /("references"\s*:\s*\[)/u,
    `$1${eol}    { "path": "${shortcutsHost}" },`,
  )
}

/**
 * Removes the replaced upstream desktop package from the Host bundler workspace.
 *
 * @param {string} source Upstream root `tsdown.config.ts` contents.
 * @returns {string} Updated source without the replaced desktop package.
 */
export function prepareReleaseBundlerConfig(source) {
  return source.replace(/,\s*['"]apps\/desktop['"]/gu, '')
}

/**
 * Leaves the upstream Host and Client builds intact while omitting the bundle
 * command for the upstream Desktop package replaced by this release.
 *
 * @param {string} source Upstream root `package.json` contents.
 * @returns {string} Updated root manifest.
 */
export function prepareReleaseRootManifest(source) {
  const manifest = JSON.parse(source)
  const build = manifest.scripts?.['build:lib:host']
  if (typeof build !== 'string') throw new Error('The upstream root has no Host build script.')
  const desktopBundle = ' && pnpm --filter @deepseek-ai/dsh-desktop run bundle'
  if (!build.includes(desktopBundle)) return source
  manifest.scripts['build:lib:host'] = build.replace(desktopBundle, '')
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/**
 * Adds the desktop client plugin to the official Web bundle dependency graph.
 *
 * @param {string} source Upstream Web bundle `package.json` contents.
 * @returns {string} Updated manifest with a sorted workspace dependency.
 */
export function prepareReleaseWebAppManifest(source) {
  const manifest = JSON.parse(source)
  if (manifest.dependencies === null || typeof manifest.dependencies !== 'object') {
    throw new Error('The upstream Web bundle does not define dependencies.')
  }
  const current = manifest.dependencies[WORKSPACE_FILE_DRAG_PACKAGE]
  if (current !== undefined && current !== 'workspace:^') {
    throw new Error(`The upstream Web bundle configures ${WORKSPACE_FILE_DRAG_PACKAGE} as ${String(current)}.`)
  }
  manifest.dependencies[WORKSPACE_FILE_DRAG_PACKAGE] = 'workspace:^'
  manifest.dependencies = Object.fromEntries(Object.entries(manifest.dependencies).sort(([left], [right]) => left.localeCompare(right)))
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/**
 * Adds the desktop client plugin to the official Client TypeScript aggregate.
 *
 * @param {string} source Upstream root `tsconfig.client.json` contents.
 * @returns {string} Updated JSONC with the plugin project reference.
 */
export function prepareReleaseClientConfig(source) {
  const pluginPath = './packages/client/ui-workspace-file-drag'
  if (!/"references"\s*:/u.test(source)) {
    throw new Error('The upstream Client TypeScript config does not define project references.')
  }
  const withoutDesktop = source.replace(/^\s*\{\s*"path"\s*:\s*"\.\/apps\/desktop\/tsconfig\.client\.json"\s*\},?\r?\n/gmu, '')
  if (withoutDesktop.includes(`"path": "${pluginPath}"`)) return withoutDesktop
  const eol = withoutDesktop.includes('\r\n') ? '\r\n' : '\n'
  const anchor = /^(\s*)\{\s*"path"\s*:\s*"\.\/packages\/client\/ui-reference"\s*\},\s*$/mu
  const match = anchor.exec(withoutDesktop)
  if (match === null) {
    throw new Error('The upstream Client TypeScript config does not reference ui-reference.')
  }
  return withoutDesktop.replace(anchor, line => `${line}${eol}${match[1]}{ "path": "${pluginPath}" },`)
}

/**
 * Appends the desktop client plugin to the official Web Loader roster.
 *
 * @param {string} source Upstream Web bundle `cordis.patch.yml` contents.
 * @returns {string} Updated patch layer with one idempotent Loader row.
 */
export function prepareReleaseWebAppPatch(source) {
  if (/^\s*- id:\s*ui-workspace-file-drag\s*$/mu.test(source)) return source
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const trimmed = source.replace(/\s+$/u, '')
  return [
    trimmed,
    '',
    '# Desktop extension: drag workspace files into the current composer as references.',
    '- insert:',
    '    - id: ui-workspace-file-drag',
    `      name: '${WORKSPACE_FILE_DRAG_PACKAGE}'`,
    '',
  ].join(eol)
}

async function main() {
  const [
    workspacePath,
    hostConfigPath,
    bundlerConfigPath,
    webManifestPath,
    webPatchPath,
    clientConfigPath,
    rootManifestPath,
  ] = process.argv.slice(2)
  if (!workspacePath || !hostConfigPath || !bundlerConfigPath
    || !webManifestPath || !webPatchPath || !clientConfigPath || !rootManifestPath) {
    throw new Error(
      'Usage: prepare-release-workspace.mjs <pnpm-workspace.yaml> <tsconfig.host.json> <tsdown.config.ts> <web-package.json> <web-cordis.patch.yml> <tsconfig.client.json> <root-package.json>',
    )
  }
  const workspace = await readFile(workspacePath, 'utf8')
  const hostConfig = await readFile(hostConfigPath, 'utf8')
  const bundlerConfig = await readFile(bundlerConfigPath, 'utf8')
  const webManifest = await readFile(webManifestPath, 'utf8')
  const webPatch = await readFile(webPatchPath, 'utf8')
  const clientConfig = await readFile(clientConfigPath, 'utf8')
  const rootManifest = await readFile(rootManifestPath, 'utf8')
  await writeFile(workspacePath, prepareReleaseWorkspace(workspace), 'utf8')
  await writeFile(hostConfigPath, prepareReleaseHostConfig(hostConfig), 'utf8')
  await writeFile(bundlerConfigPath, prepareReleaseBundlerConfig(bundlerConfig), 'utf8')
  await writeFile(webManifestPath, prepareReleaseWebAppManifest(webManifest), 'utf8')
  await writeFile(webPatchPath, prepareReleaseWebAppPatch(webPatch), 'utf8')
  await writeFile(clientConfigPath, prepareReleaseClientConfig(clientConfig), 'utf8')
  await writeFile(rootManifestPath, prepareReleaseRootManifest(rootManifest), 'utf8')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
