import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import {
  prepareReleaseBundlerConfig,
  prepareReleaseHostConfig,
  prepareReleaseWorkspace,
} from '../scripts/prepare-release-workspace.mjs'

test('desktop release preserves upstream workspace configuration', () => {
  const workflowPath = process.env.DSH_DESKTOP_SOURCE_ROOT
    ? resolve(process.env.DSH_DESKTOP_SOURCE_ROOT, '.github/workflows/desktop-release.yml')
    : new URL('../../../.github/workflows/desktop-release.yml', import.meta.url)
  const workflow = readFileSync(workflowPath, 'utf8')

  assert.match(
    workflow,
    /prepare-release-workspace\.mjs official\/pnpm-workspace\.yaml official\/tsconfig\.host\.json official\/tsdown\.config\.ts/u,
  )
  assert.doesNotMatch(workflow, /Copy-Item desktop-source\/pnpm-workspace\.yaml/u)
})

test('removes the replaced upstream desktop project from the bundler workspace', () => {
  const source = "workspace: ['vendor/*', 'apps/cli', 'apps/desktop', 'apps/desktop-host'],\n"
  const updated = prepareReleaseBundlerConfig(source)

  assert.equal(updated, "workspace: ['vendor/*', 'apps/cli', 'apps/desktop-host'],\n")
  assert.throws(
    () => prepareReleaseBundlerConfig("workspace: ['apps/cli'],\n"),
    /does not include apps\/desktop/u,
  )
})

test('removes the replaced upstream desktop project from the host build', () => {
  const source = [
    '{',
    '  // The release adaptation preserves upstream JSONC comments.',
    '  "references": [',
    '    { "path": "./apps/cli" },',
    '    { "path": "./apps/desktop-host" },',
    '    { "path": "./apps/desktop" }',
    '  ]',
    '}',
    '',
  ].join('\n')

  const updated = prepareReleaseHostConfig(source)

  assert.match(updated, /preserves upstream JSONC comments/u)
  assert.match(updated, /\.\/apps\/desktop-host/u)
  assert.doesNotMatch(updated, /"\.\/apps\/desktop"/u)
  assert.throws(
    () => prepareReleaseHostConfig('{"references":[]}\n'),
    /does not reference \.\/apps\/desktop/u,
  )
  assert.throws(
    () => prepareReleaseHostConfig('{}\n'),
    /does not define project references/u,
  )
})

test('adds desktop build permissions without replacing upstream permissions', () => {
  const source = [
    'packages:',
    '  - packages/*/*',
    '',
    'allowBuilds:',
    '  fs-ext: true',
    '',
    'patchedDependencies:',
    '  dependency: patches/dependency.patch',
    '',
  ].join('\n')

  const updated = prepareReleaseWorkspace(source)

  assert.match(updated, /  fs-ext: true/u)
  assert.match(updated, /  'electron': true/u)
  assert.match(updated, /  'electron-winstaller': false/u)
  assert.match(updated, /patchedDependencies:/u)
})

test('is idempotent when upstream already grants the desktop permissions', () => {
  const source = [
    'allowBuilds:',
    '  electron: true',
    "  'electron-winstaller': false",
    '',
  ].join('\r\n')

  assert.equal(prepareReleaseWorkspace(source), source)
})

test('rejects missing or conflicting upstream build policy', () => {
  assert.throws(() => prepareReleaseWorkspace('packages:\n  - packages/*/*\n'), /does not define allowBuilds/u)
  assert.throws(() => prepareReleaseWorkspace('allowBuilds:\n  electron: false\n'), /electron as false/u)
})
