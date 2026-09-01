import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { advanceUpstream, nextDesktopVersion } from '../scripts/advance-upstream.mjs'

test('desktop release candidates advance monotonically', () => {
  assert.equal(nextDesktopVersion('0.1.2-rc.5'), '0.1.2-rc.6')
  assert.throws(() => nextDesktopVersion('0.1.2'), /not an rc version/u)
})

test('upstream advancement records one revision and one release version', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-upstream-'))
  context.after(() => rmSync(root, { force: true, recursive: true }))
  mkdirSync(root, { recursive: true })
  const desktopPath = join(root, 'package.json')
  const upstreamPath = join(root, 'desktop-upstream.json')
  writeFileSync(desktopPath, '{"version":"0.1.2-rc.5","private":true}\n')
  writeFileSync(upstreamPath, '{"repository":"deepseek-ai/deepseek-harness","branch":"master","commit":"1111111111111111111111111111111111111111"}\n')

  const version = advanceUpstream({
    commit: '2222222222222222222222222222222222222222',
    desktopPath,
    upstreamPath,
  })

  assert.equal(version, '0.1.2-rc.6')
  assert.equal(JSON.parse(readFileSync(desktopPath, 'utf8')).version, version)
  assert.equal(JSON.parse(readFileSync(upstreamPath, 'utf8')).commit, '2222222222222222222222222222222222222222')
  assert.throws(() => advanceUpstream({
    commit: '2222222222222222222222222222222222222222',
    desktopPath,
    upstreamPath,
  }), /already pinned/u)
})
