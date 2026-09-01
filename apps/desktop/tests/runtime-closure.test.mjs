import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { resolveRuntimeClosure } from '../scripts/runtime-closure.mjs'

const require = createRequire(import.meta.url)
const { copyMissingPackages } = require('../scripts/after-pack.cjs')

function entry(manifest = {}) {
  return { directory: 'unused', manifest }
}

test('runtime closure follows dependencies, optional dependencies, and required peers', () => {
  const packages = new Map([
    ['app', entry({
      dependencies: { dependency: 'workspace:^' },
      optionalDependencies: { optional: 'workspace:^', unsupported: 'workspace:^' },
      peerDependencies: { external: '^1.0.0', peer: 'workspace:^', skipped: 'workspace:^' },
      peerDependenciesMeta: { skipped: { optional: true } },
    })],
    ['dependency', entry()],
    ['optional', entry()],
    ['unsupported', entry({ os: ['darwin'] })],
    ['peer', entry()],
    ['skipped', entry()],
  ])

  const runtime = resolveRuntimeClosure(packages, ['app'], { arch: 'x64', platform: 'win32' })

  assert.deepEqual([...runtime.workspace.keys()].sort(), ['app', 'dependency', 'optional', 'peer'])
  assert.deepEqual([...runtime.externalPeers], [['external', '^1.0.0']])
})

test('runtime closure rejects an incompatible root package', () => {
  const packages = new Map([['app', entry({ cpu: ['!x64'] })]])
  const runtime = resolveRuntimeClosure(packages, ['app'], { arch: 'x64', platform: 'win32' })
  assert.equal(runtime.workspace.size, 0)
})

test('after-pack restores peer-only packages without replacing packaged dependencies', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-after-pack-'))
  context.after(() => rmSync(root, { force: true, recursive: true }))
  const source = join(root, 'source')
  const destination = join(root, 'destination')
  mkdirSync(join(source, '@deepseek-ai', 'peer-only'), { recursive: true })
  mkdirSync(join(source, 'existing'), { recursive: true })
  mkdirSync(join(destination, 'existing'), { recursive: true })
  writeFileSync(join(source, '@deepseek-ai', 'peer-only', 'package.json'), '{}')
  writeFileSync(join(source, 'existing', 'value.txt'), 'source')
  writeFileSync(join(destination, 'existing', 'value.txt'), 'packaged')

  copyMissingPackages(source, destination)

  assert.equal(readFileSync(join(destination, '@deepseek-ai', 'peer-only', 'package.json'), 'utf8'), '{}')
  assert.equal(readFileSync(join(destination, 'existing', 'value.txt'), 'utf8'), 'packaged')
})
