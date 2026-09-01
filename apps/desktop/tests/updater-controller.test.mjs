import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { DesktopUpdaterController, normalizeDesktopUpdateUrl } from '../src/updater-controller.mjs'

class FakeUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = true
  allowPrerelease = false
  checkCalls = 0
  downloadCalls = 0
  installCalls = []

  async checkForUpdates() {
    ++this.checkCalls
    this.emit('update-available', {
      version: '0.1.2-rc.1',
      releaseName: 'Desktop Update',
      releaseNotes: [{ note: 'New desktop build' }],
      releaseDate: '2026-08-21T00:00:00.000Z',
    })
  }

  async downloadUpdate() {
    ++this.downloadCalls
    this.emit('download-progress', { percent: 48.5, transferred: 485, total: 1000, bytesPerSecond: 50 })
    this.emit('update-downloaded', { version: '0.1.2-rc.1' })
  }

  quitAndInstall(...args) {
    this.installCalls.push(args)
  }
}

test('an absent release channel remains safe and explicit', async () => {
  const controller = new DesktopUpdaterController({ currentVersion: '0.1.1-rc.1' })
  assert.equal(controller.getSnapshot().status, 'unconfigured')
  assert.equal((await controller.check()).status, 'unconfigured')
  assert.equal(await controller.download(), controller.getSnapshot())
  assert.equal(controller.install(), false)
})

test('release packaging accepts HTTPS and rejects insecure update feeds', () => {
  assert.equal(normalizeDesktopUpdateUrl(undefined), undefined)
  assert.equal(normalizeDesktopUpdateUrl(' https://updates.example.com/desktop '), 'https://updates.example.com/desktop')
  assert.throws(() => normalizeDesktopUpdateUrl('http://updates.example.com/desktop'), /must use HTTPS/)
  assert.throws(() => normalizeDesktopUpdateUrl('not a URL'), /Invalid URL/)
})

test('manual update flow checks, downloads, and installs only after verification', async () => {
  const updater = new FakeUpdater()
  const controller = new DesktopUpdaterController({ currentVersion: '0.1.1-rc.1', updater })
  assert.equal(updater.autoDownload, false)
  assert.equal(updater.autoInstallOnAppQuit, false)
  assert.equal(updater.allowPrerelease, true)

  await controller.check()
  assert.equal(updater.checkCalls, 1)
  assert.deepEqual(controller.getSnapshot(), {
    status: 'available',
    currentVersion: '0.1.1-rc.1',
    availableVersion: '0.1.2-rc.1',
    releaseName: 'Desktop Update',
    releaseNotes: 'New desktop build',
    publishedAt: '2026-08-21T00:00:00.000Z',
    progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
    failure: null,
  })

  await controller.download()
  assert.equal(updater.downloadCalls, 1)
  assert.equal(controller.getSnapshot().status, 'downloaded')
  assert.equal(controller.getSnapshot().progress.percent, 100)
  assert.equal(controller.install(), true)
  assert.deepEqual(updater.installCalls, [[false, true]])
})

test('concurrent checks share one updater request and failures stay retryable', async () => {
  let release
  const updater = new FakeUpdater()
  updater.checkForUpdates = () => {
    ++updater.checkCalls
    return new Promise(resolve => { release = resolve })
  }
  const controller = new DesktopUpdaterController({ currentVersion: '0.1.1-rc.1', updater })
  const first = controller.check()
  const second = controller.check()
  assert.equal(updater.checkCalls, 1)
  release()
  await Promise.all([first, second])

  updater.checkForUpdates = async () => { throw new Error('offline') }
  await controller.check()
  assert.equal(controller.getSnapshot().status, 'error')
  assert.equal(controller.getSnapshot().failure, 'check-failed')
  controller.dispose()
})
