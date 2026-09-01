import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeDesktopUpdateUrl } from '../src/updater-controller.mjs'

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

const deployArgs = [
  '--config.node-linker=hoisted',
  '--filter',
  '@deepseek-ai/dsh-desktop',
  'deploy',
  stageDir,
  '--prod',
  '--legacy',
]
if (process.env.npm_execpath !== undefined) {
  run(process.execPath, [process.env.npm_execpath, ...deployArgs])
}
else {
  run('pnpm', deployArgs, { shell: process.platform === 'win32' })
}

const stagedManifestPath = join(stageDir, 'package.json')
const stagedManifest = JSON.parse(readFileSync(stagedManifestPath, 'utf8'))
stagedManifest.build.directories.output = outputDir
const updateUrl = normalizeDesktopUpdateUrl(process.env.DSH_DESKTOP_UPDATE_URL)
if (updateUrl !== undefined) {
  stagedManifest.build.publish = [{ provider: 'generic', url: updateUrl }]
}
writeFileSync(stagedManifestPath, `${JSON.stringify(stagedManifest, undefined, 2)}\n`)

const builderCli = join(appDir, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')
run(process.execPath, [builderCli, '--projectDir', stageDir, '--win', 'nsis', '--x64', '--publish', 'never'])
removeGeneratedDirectory(stageDir)
