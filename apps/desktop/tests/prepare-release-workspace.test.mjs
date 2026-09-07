import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { prepareReleaseWorkspace } from '../scripts/prepare-release-workspace.mjs'

test('desktop release preserves upstream workspace configuration', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/desktop-release.yml', import.meta.url), 'utf8')

  assert.match(workflow, /prepare-release-workspace\.mjs official\/pnpm-workspace\.yaml/u)
  assert.doesNotMatch(workflow, /Copy-Item desktop-source\/pnpm-workspace\.yaml/u)
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
