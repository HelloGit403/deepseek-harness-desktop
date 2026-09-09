import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeDesktopUpdateUrl } from '../src/updater-controller.mjs'
import { installLegacyPresetAlias } from './legacy-preset-alias.mjs'
import { runCommandWithRetry } from './run-command-with-retry.mjs'
import { stageNodeRuntime } from './stage-node-runtime.mjs'
import {
  assertStagedRuntimeClosure,
  loadWorkspacePackages,
  materializeStagedLinks,
  resolveRuntimeClosure,
  restoreMissingWorkspacePackages,
} from './runtime-closure.mjs'
import { smokePackagedHarness } from './packaged-smoke.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = resolve(appDir, '..', '..')
const stageDir = join(appDir, '.deploy')
const outputDir = join(appDir, 'dist')

function removeGeneratedDirectory(path) {
  const child = relative(appDir, path)
  if (child === '' || child.startsWith('..') || isAbsolute(child)) {
    throw new Error(`Refusing to remove a path outside the desktop package: ${path}`)
  }
  rmSync(path, { force: true, maxRetries: 3, recursive: true })
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
    ...options,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

removeGeneratedDirectory(stageDir)
removeGeneratedDirectory(outputDir)

const sourceManifestPath = join(appDir, 'package.json')
const sourceManifestText = readFileSync(sourceManifestPath, 'utf8')
const sourceManifest = JSON.parse(sourceManifestText)
const packages = loadWorkspacePackages(rootDir)
const runtimeRoots = [
  '@deepseek-ai/dsh',
  ...Object.keys(sourceManifest.dependencies ?? {}).filter(name => packages.has(name)),
]
const runtime = resolveRuntimeClosure(packages, runtimeRoots)
const runtimeDependencies = Object.fromEntries([
  ...[...runtime.workspace.keys()].map(name => [name, 'workspace:^']),
  ...runtime.externalPeers,
  ...Object.entries(sourceManifest.dependencies ?? {}),
].sort(([left], [right]) => left.localeCompare(right)))
writeFileSync(sourceManifestPath, `${JSON.stringify({
  ...sourceManifest,
  dependencies: runtimeDependencies,
}, undefined, 2)}\n`)

const deployArgs = [
  '--config.node-linker=hoisted',
  '--config.auto-install-peers=false',
  '--config.link-workspace-packages=true',
  '--filter',
  '@deepseek-ai/dsh-desktop',
  'deploy',
  stageDir,
  '--prod',
  '--legacy',
]
const deployEnv = { ...process.env, CI: process.env.CI ?? 'true' }
try {
  if (process.env.npm_execpath !== undefined) {
    run(process.execPath, [process.env.npm_execpath, ...deployArgs], { env: deployEnv })
  }
  else {
    run('pnpm', deployArgs, { env: deployEnv, shell: process.platform === 'win32' })
  }
}
finally {
  writeFileSync(sourceManifestPath, sourceManifestText)
}

const restored = restoreMissingWorkspacePackages(stageDir, runtime.workspace)
if (restored.length > 0) console.log(`desktop: restored legacy deploy packages: ${restored.join(', ')}`)
materializeStagedLinks(stageDir)
assertStagedRuntimeClosure(stageDir, runtime.workspace)
const legacyPreset = installLegacyPresetAlias(stageDir)
console.log(`desktop: legacy code preset alias ${legacyPreset}`)
await stageNodeRuntime({
  licensePath: process.env.DSH_DESKTOP_NODE_LICENSE,
  stageDir,
})
console.log(`desktop: staged Node.js ${process.version} runtime`)

const stagedManifestPath = join(stageDir, 'package.json')
const stagedManifest = JSON.parse(readFileSync(stagedManifestPath, 'utf8'))
stagedManifest.build.directories.output = outputDir
stagedManifest.build.afterPack = join(appDir, 'scripts', 'after-pack.cjs')
stagedManifest.build.files = [...stagedManifest.build.files, 'runtime/**/*']
const updateUrl = normalizeDesktopUpdateUrl(process.env.DSH_DESKTOP_UPDATE_URL)
if (updateUrl !== undefined) {
  stagedManifest.build.publish = [{ provider: 'generic', url: updateUrl }]
}
writeFileSync(stagedManifestPath, `${JSON.stringify(stagedManifest, undefined, 2)}\n`)

const builderCli = join(appDir, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')
const builderStatus = runCommandWithRetry(
  process.execPath,
  [builderCli, '--projectDir', stageDir, '--win', 'nsis', '--x64', '--publish', 'never'],
  {
    attempts: 3,
    beforeRetry: ({ attempt, status }) => {
      console.warn(`desktop: installer attempt ${attempt} exited with ${status}; retrying`)
      removeGeneratedDirectory(outputDir)
    },
    spawnOptions: {
      cwd: rootDir,
      env: process.env,
      stdio: 'inherit',
    },
  },
)
if (builderStatus !== 0) process.exit(builderStatus)
const unpackedDir = join(outputDir, 'win-unpacked')
await smokePackagedHarness({
  executable: join(unpackedDir, 'resources', 'app', 'runtime', 'node.exe'),
  entry: join(unpackedDir, 'resources', 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
})
console.log('desktop: packaged Harness startup smoke passed')
removeGeneratedDirectory(stageDir)
