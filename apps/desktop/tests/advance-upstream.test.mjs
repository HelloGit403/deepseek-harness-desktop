import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { advanceUpstream, desktopReleaseTag, nextDesktopVersion } from '../scripts/advance-upstream.mjs'

test('desktop releases use tags electron-updater can parse as SemVer', () => {
  assert.equal(desktopReleaseTag('0.1.2-rc.5'), 'v0.1.2-rc.5')
  assert.equal(desktopReleaseTag('1.0.0'), 'v1.0.0')
  assert.throws(() => desktopReleaseTag('desktop-v0.1.2-rc.5'), /not valid SemVer/u)
})

test('desktop release candidates advance monotonically', () => {
  assert.equal(nextDesktopVersion('0.1.5-rc.5', '0.1.5-rc.1'), '0.1.5-rc.6')
  assert.equal(nextDesktopVersion('0.1.5-rc.1', '0.1.5-rc.2'), '0.1.5-rc.2')
  assert.equal(nextDesktopVersion('0.1.2-rc.15', '0.1.5-rc.1'), '0.1.5-rc.1')
  assert.equal(nextDesktopVersion('0.1.5-rc.7', '0.1.6'), '0.1.6-rc.1')
  assert.throws(() => nextDesktopVersion('0.1.2', '0.1.5-rc.1'), /not an rc version/u)
  assert.throws(() => nextDesktopVersion('0.1.5-rc.1', 'invalid'), /not valid SemVer/u)
  assert.throws(() => nextDesktopVersion('0.1.5-rc.1', '0.1.4-rc.9'), /regressed/u)
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
    officialVersion: '0.1.5-rc.1',
    upstreamPath,
  })

  assert.equal(version, '0.1.5-rc.1')
  assert.equal(JSON.parse(readFileSync(desktopPath, 'utf8')).version, version)
  assert.equal(JSON.parse(readFileSync(upstreamPath, 'utf8')).commit, '2222222222222222222222222222222222222222')
  assert.throws(() => advanceUpstream({
    commit: '2222222222222222222222222222222222222222',
    desktopPath,
    officialVersion: '0.1.5-rc.1',
    upstreamPath,
  }), /already pinned/u)
})
