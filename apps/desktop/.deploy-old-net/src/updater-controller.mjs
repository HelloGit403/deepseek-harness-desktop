import { EventEmitter } from 'node:events'

const INITIAL_PROGRESS = Object.freeze({ percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 })

function notesText(notes) {
  if (typeof notes === 'string') return notes.slice(0, 20_000)
  if (!Array.isArray(notes)) return ''
  return notes
    .map(note => typeof note === 'string' ? note : note?.note)
    .filter(note => typeof note === 'string')
    .join('\n\n')
    .slice(0, 20_000)
}

function releaseFields(info) {
  const fields = {}
  if (typeof info?.version === 'string') fields.availableVersion = info.version
  if (typeof info?.releaseName === 'string') fields.releaseName = info.releaseName.slice(0, 300)
  const notes = notesText(info?.releaseNotes)
  if (notes !== '') fields.releaseNotes = notes
  if (typeof info?.releaseDate === 'string') fields.publishedAt = info.releaseDate
  return fields
}

function progressFields(progress) {
  const finite = (value) => Number.isFinite(value) && value >= 0 ? value : 0
  return Object.freeze({
    percent: Math.min(100, finite(progress?.percent)),
    transferred: finite(progress?.transferred),
    total: finite(progress?.total),
    bytesPerSecond: finite(progress?.bytesPerSecond),
  })
}

/** Validate and normalize the HTTPS base URL embedded into a desktop release. */
export function normalizeDesktopUpdateUrl(value) {
  const trimmed = value?.trim()
  if (trimmed === undefined || trimmed === '') return undefined
  const url = new URL(trimmed)
  if (url.protocol !== 'https:') throw new Error('DSH_DESKTOP_UPDATE_URL must use HTTPS')
  return url.href
}

/**
 * Own the desktop update state machine independently from Electron rendering.
 * The updater implementation verifies release metadata and the downloaded
 * installer before emitting `update-downloaded`.
 */
export class DesktopUpdaterController extends EventEmitter {
  #updater
  #listeners = []
  #checkPromise
  #downloadPromise

  constructor({ currentVersion, updater }) {
    super()
    this.#updater = updater
    this.state = Object.freeze({
      status: updater === undefined ? 'unconfigured' : 'idle',
      currentVersion,
      availableVersion: null,
      releaseName: null,
      releaseNotes: '',
      publishedAt: null,
      progress: INITIAL_PROGRESS,
      failure: null,
    })
    if (updater === undefined) return

    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.allowPrerelease = true
    this.#listen('checking-for-update', () => this.#publish({ status: 'checking', failure: null }))
    this.#listen('update-available', info => this.#publish({
      status: 'available',
      ...releaseFields(info),
      progress: INITIAL_PROGRESS,
      failure: null,
    }))
    this.#listen('update-not-available', info => this.#publish({
      status: 'current',
      ...releaseFields(info),
      progress: INITIAL_PROGRESS,
      failure: null,
    }))
    this.#listen('download-progress', progress => this.#publish({
      status: 'downloading',
      progress: progressFields(progress),
      failure: null,
    }))
    this.#listen('update-downloaded', info => this.#publish({
      status: 'downloaded',
      ...releaseFields(info),
      progress: Object.freeze({ ...this.state.progress, percent: 100 }),
      failure: null,
    }))
    this.#listen('error', () => this.#publish({
      status: 'error',
      failure: this.state.status === 'downloading' ? 'download-failed' : 'check-failed',
    }))
  }

  getSnapshot = () => this.state

  subscribe = (listener) => {
    this.on('change', listener)
    return () => this.off('change', listener)
  }

  async check() {
    if (this.#updater === undefined) return this.state
    if (this.#checkPromise !== undefined) return this.#checkPromise
    this.#publish({ status: 'checking', failure: null })
    this.#checkPromise = this.#updater.checkForUpdates()
      .then(() => this.state)
      .catch(() => {
        if (this.state.status !== 'error') this.#publish({ status: 'error', failure: 'check-failed' })
        return this.state
      })
      .finally(() => { this.#checkPromise = undefined })
    return this.#checkPromise
  }

  async download() {
    if (this.#updater === undefined || this.state.status !== 'available') return this.state
    if (this.#downloadPromise !== undefined) return this.#downloadPromise
    this.#publish({ status: 'downloading', progress: INITIAL_PROGRESS, failure: null })
    this.#downloadPromise = this.#updater.downloadUpdate()
      .then(() => this.state)
      .catch(() => {
        if (this.state.status !== 'error') this.#publish({ status: 'error', failure: 'download-failed' })
        return this.state
      })
      .finally(() => { this.#downloadPromise = undefined })
    return this.#downloadPromise
  }

  install() {
    if (this.#updater === undefined || this.state.status !== 'downloaded') return false
    this.#updater.quitAndInstall(false, true)
    return true
  }

  dispose() {
    if (this.#updater !== undefined) {
      for (const [event, listener] of this.#listeners) this.#updater.off(event, listener)
    }
    this.#listeners = []
    this.removeAllListeners()
  }

  #listen(event, listener) {
    this.#updater.on(event, listener)
    this.#listeners.push([event, listener])
  }

  #publish(patch) {
    this.state = Object.freeze({ ...this.state, ...patch })
    this.emit('change', this.state)
  }
}
