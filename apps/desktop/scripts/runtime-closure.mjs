import {
  cpSync,
  existsSync,
  globSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import { dirname, join, sep } from 'node:path'

const WORKSPACE_MANIFEST_GLOBS = [
  'apps/*/package.json',
  'packages/*/*/package.json',
  'vendor/*/package.json',
  'native/landlock-run/package.json',
  'native/landlock-run/packages/*/package.json',
  'website/package.json',
  'python/sdk-runtime/package.json',
]

function platformListAllows(values, current) {
  if (!Array.isArray(values) || values.length === 0) return true
  if (values.includes(`!${current}`)) return false
  const positive = values.filter(value => !value.startsWith('!'))
  return positive.length === 0 || positive.includes(current)
}

function packageSupportsHost(manifest, platform, arch) {
  return platformListAllows(manifest.os, platform) && platformListAllows(manifest.cpu, arch)
}

/**
 * Load every package that belongs to the pnpm workspace.
 *
 * @param {string} rootDir Workspace root.
 * @returns {Map<string, { directory: string, manifest: Record<string, unknown> }>} Packages by name.
 */
export function loadWorkspacePackages(rootDir) {
  const packages = new Map()
  for (const manifestPath of globSync(WORKSPACE_MANIFEST_GLOBS, { cwd: rootDir })) {
    const path = join(rootDir, manifestPath)
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof manifest.name !== 'string') continue
    packages.set(manifest.name, { directory: dirname(path), manifest })
  }
  return packages
}

/**
 * Resolve the complete workspace and required-peer graph for an installed app.
 *
 * @param {Map<string, { directory: string, manifest: Record<string, unknown> }>} packages Workspace packages.
 * @param {string[]} roots Root package names.
 * @param {{ arch?: string, platform?: string }} [options] Target host.
 * @returns {{ externalPeers: Map<string, string>, workspace: Map<string, { directory: string, manifest: Record<string, unknown> }> }} Runtime graph.
 */
export function resolveRuntimeClosure(packages, roots, options = {}) {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const workspace = new Map()
  const externalPeers = new Map()
  const queue = [...roots]

  for (let index = 0; index < queue.length; index += 1) {
    const name = queue[index]
    if (workspace.has(name)) continue
    const entry = packages.get(name)
    if (entry === undefined || !packageSupportsHost(entry.manifest, platform, arch)) continue
    workspace.set(name, entry)

    const dependencies = {
      ...entry.manifest.dependencies,
      ...entry.manifest.optionalDependencies,
    }
    for (const dependency of Object.keys(dependencies).sort()) {
      if (packages.has(dependency)) queue.push(dependency)
    }

    const peers = entry.manifest.peerDependencies ?? {}
    const peerMeta = entry.manifest.peerDependenciesMeta ?? {}
    for (const [peer, version] of Object.entries(peers)) {
      if (peerMeta[peer]?.optional === true) continue
      if (packages.has(peer)) queue.push(peer)
      else externalPeers.set(peer, version)
    }
  }

  return { externalPeers, workspace }
}

/**
 * Copy workspace roots omitted by legacy deploy into its flat runtime tree.
 *
 * @param {string} stageDir Deployment root.
 * @param {Map<string, { directory: string }>} workspace Runtime workspace packages.
 * @returns {string[]} Restored package names.
 */
export function restoreMissingWorkspacePackages(stageDir, workspace) {
  const restored = []
  for (const [name, entry] of [...workspace].sort(([left], [right]) => left.localeCompare(right))) {
    const destination = join(stageDir, 'node_modules', name)
    if (existsSync(destination)) continue
    mkdirSync(dirname(destination), { recursive: true })
    const nestedNodeModules = join(entry.directory, 'node_modules')
    cpSync(entry.directory, destination, {
      recursive: true,
      dereference: true,
      filter: path => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
    })
    restored.push(name)
  }
  return restored
}

function findSymlink(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (lstatSync(path).isSymbolicLink()) return path
    if (entry.isDirectory()) {
      const nested = findSymlink(path)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

/**
 * Replace staged package links with files so the installed tree is self-contained.
 *
 * @param {string} stageDir Deployment root.
 * @returns {void}
 */
export function materializeStagedLinks(stageDir) {
  const nodeModules = join(stageDir, 'node_modules')
  let remaining = findSymlink(nodeModules)
  while (remaining !== undefined) {
    const segments = remaining.slice(nodeModules.length + 1).split(sep)
    const binIndex = segments.lastIndexOf('.bin')
    if (binIndex >= 0) {
      rmSync(join(nodeModules, ...segments.slice(0, binIndex + 1)), { recursive: true, force: true })
      remaining = findSymlink(nodeModules)
      continue
    }
    const source = realpathSync(remaining)
    const nestedNodeModules = join(source, 'node_modules')
    rmSync(remaining, { recursive: true, force: true })
    cpSync(source, remaining, {
      recursive: true,
      dereference: true,
      filter: path => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
    })
    remaining = findSymlink(nodeModules)
  }
}

/**
 * Fail when any workspace package in the resolved runtime graph is absent.
 *
 * @param {string} stageDir Deployment root.
 * @param {Map<string, unknown>} workspace Runtime workspace packages.
 * @returns {void}
 */
export function assertStagedRuntimeClosure(stageDir, workspace) {
  const missing = [...workspace.keys()]
    .filter(name => !existsSync(join(stageDir, 'node_modules', name)))
    .sort()
  if (missing.length > 0) {
    throw new Error(`Desktop runtime is missing workspace packages: ${missing.join(', ')}`)
  }
}
