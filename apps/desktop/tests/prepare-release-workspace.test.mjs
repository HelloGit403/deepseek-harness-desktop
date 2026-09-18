import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import {
  prepareReleaseBundlerConfig,
  prepareReleaseClientConfig,
  prepareReleaseHostConfig,
  prepareReleaseWebAppManifest,
  prepareReleaseWebAppPatch,
  prepareReleaseWorkspace,
} from '../scripts/prepare-release-workspace.mjs'

test('desktop release preserves upstream workspace configuration', () => {
  const workflowPath = process.env.DSH_DESKTOP_SOURCE_ROOT
    ? resolve(process.env.DSH_DESKTOP_SOURCE_ROOT, '.github/workflows/desktop-release.yml')
    : new URL('../../../.github/workflows/desktop-release.yml', import.meta.url)
  const workflow = readFileSync(workflowPath, 'utf8')

  const preserveUpstreamScripts = workflow.indexOf(
    "Copy-Item official/apps/desktop/scripts $upstreamDesktopScripts -Recurse -Force",
  )
  const removeUpstreamDesktop = workflow.indexOf(
    'Remove-Item official/apps/desktop -Recurse -Force',
  )
  const restoreUpstreamScripts = workflow.indexOf(
    'Copy-Item "$upstreamDesktopScripts/*" official/apps/desktop/scripts -Recurse -Force',
  )
  const overlayDesktopAdaptation = workflow.indexOf(
    'Copy-Item desktop-source/apps/desktop/* official/apps/desktop -Recurse -Force',
  )

  assert.ok(preserveUpstreamScripts >= 0)
  assert.ok(preserveUpstreamScripts < removeUpstreamDesktop)
  assert.ok(removeUpstreamDesktop < restoreUpstreamScripts)
  assert.ok(restoreUpstreamScripts < overlayDesktopAdaptation)

  assert.match(
    workflow,
    /Copy-Item "desktop-source\/\$plugin" "official\/\$plugin" -Recurse/u,
  )
  assert.match(
    workflow,
    /prepare-release-workspace\.mjs official\/pnpm-workspace\.yaml official\/tsconfig\.host\.json official\/tsdown\.config\.ts official\/packages\/bundle\/web-app\/package\.json official\/packages\/bundle\/web-app\/cordis\.patch\.yml official\/tsconfig\.client\.json/u,
  )
  assert.doesNotMatch(workflow, /git -C official apply/u)
  assert.match(workflow, /verify-workspace-file-drag-host\.mjs official/u)
  assert.match(workflow, /vitest run packages\/client\/ui-workspace-file-drag\/tests/u)
  assert.doesNotMatch(workflow, /Copy-Item desktop-source\/pnpm-workspace\.yaml/u)
})

test('registers the workspace-file drag package through official Web plugin surfaces', () => {
  const manifest = prepareReleaseWebAppManifest('{"dependencies":{"z":"1","a":"2"}}\n')
  assert.deepEqual(Object.keys(JSON.parse(manifest).dependencies), [
    '@deepseek-ai/dsh-client-ui-workspace-file-drag', 'a', 'z',
  ])
  assert.equal(
    JSON.parse(manifest).dependencies['@deepseek-ai/dsh-client-ui-workspace-file-drag'],
    'workspace:^',
  )
  assert.throws(
    () => prepareReleaseWebAppManifest('{"dependencies":{"@deepseek-ai/dsh-client-ui-workspace-file-drag":"1.0.0"}}'),
    /configures @deepseek-ai\/dsh-client-ui-workspace-file-drag/u,
  )
  assert.throws(() => prepareReleaseWebAppManifest('{"name":"web"}'), /does not define dependencies/u)

  const client = prepareReleaseClientConfig([
    '{',
    '  "references": [',
    '    { "path": "./packages/client/ui-reference" },',
    '    { "path": "./apps/web" }',
    '  ]',
    '}',
    '',
  ].join('\n'))
  assert.match(client, /packages\/client\/ui-workspace-file-drag/u)
  assert.equal(prepareReleaseClientConfig(client), client)
  assert.throws(() => prepareReleaseClientConfig('{}\n'), /does not define project references/u)
  assert.throws(
    () => prepareReleaseClientConfig('{"references":[]}\n'),
    /does not reference ui-reference/u,
  )

  const webPatch = prepareReleaseWebAppPatch('- insert:\n    - id: ui-reference\n      name: reference\n')
  assert.match(webPatch, /- id: ui-workspace-file-drag/u)
  assert.match(webPatch, /@deepseek-ai\/dsh-client-ui-workspace-file-drag/u)
  assert.equal(prepareReleaseWebAppPatch(webPatch), webPatch)
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
