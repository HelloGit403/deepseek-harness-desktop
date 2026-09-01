/** Update state projected by the desktop main process. */
export interface DesktopUpdateState {
  readonly status: 'starting' | 'unconfigured' | 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'error'
  readonly currentVersion: string
  readonly availableVersion: string | null
  readonly releaseName: string | null
  readonly releaseNotes: string
  readonly publishedAt: string | null
  readonly progress: {
    readonly percent: number
    readonly transferred: number
    readonly total: number
    readonly bytesPerSecond: number
  }
  readonly failure: 'check-failed' | 'download-failed' | null
}

/** Narrow preload API exposed only by the Electron desktop shell. */
export interface DesktopUpdateBridge {
  getState: () => Promise<DesktopUpdateState>
  check: () => Promise<DesktopUpdateState>
  download: () => Promise<DesktopUpdateState>
  install: () => Promise<boolean>
  onState: (listener: (state: DesktopUpdateState) => void) => () => void
}

const STARTING: DesktopUpdateState = Object.freeze({
  status: 'starting',
  currentVersion: '',
  availableVersion: null,
  releaseName: null,
  releaseNotes: '',
  publishedAt: null,
  progress: Object.freeze({ percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 }),
  failure: null,
})

function isBridge(value: unknown): value is DesktopUpdateBridge {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return ['getState', 'check', 'download', 'install', 'onState']
    .every(key => typeof candidate[key] === 'function')
}

/**
 * Return the preload update API when this browser runs inside the desktop shell.
 * @returns The desktop update API, or `undefined` in an ordinary browser.
 */
export function desktopUpdateBridge(): DesktopUpdateBridge | undefined {
  const bridge = (globalThis as { deepSeekDesktopUpdate?: unknown }).deepSeekDesktopUpdate
  return isBridge(bridge) ? bridge : undefined
}

/** Observable adapter for the desktop preload's IPC state stream. */
export class DesktopUpdateController {
  private state: DesktopUpdateState = STARTING
  private readonly listeners = new Set<() => void>()
  private readonly stop: () => void
  private readonly bridge: DesktopUpdateBridge
  private disposed = false
  private revision = 0

  constructor(bridge: DesktopUpdateBridge) {
    this.bridge = bridge
    const initialRevision = this.revision
    this.stop = bridge.onState((state) => {
      this.revision += 1
      this.publish(state)
    })
    void bridge.getState().then(
      (state) => {
        if (this.revision === initialRevision) this.publish(state)
      },
      () => {
        if (this.revision === initialRevision) this.fail('check-failed')
      },
    )
  }

  /** Return the latest immutable desktop update snapshot. */
  getSnapshot = (): DesktopUpdateState => this.state

  /** Subscribe React to desktop update state changes. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Ask the desktop main process to refresh release metadata.
   * @returns The settled state used by explicit check-result UI.
   */
  async check(): Promise<DesktopUpdateState> {
    return this.run(() => this.bridge.check(), 'check-failed')
  }

  /** Download and verify the available desktop installer. */
  async download(): Promise<void> {
    await this.run(() => this.bridge.download(), 'download-failed')
  }

  /** Close the application and hand the verified installer to NSIS. */
  async install(): Promise<void> {
    await this.bridge.install()
  }

  /** Disconnect the preload event stream and release subscribers. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stop()
    this.listeners.clear()
  }

  private async run(operation: () => Promise<DesktopUpdateState>, failure: NonNullable<DesktopUpdateState['failure']>): Promise<DesktopUpdateState> {
    try {
      this.publish(await operation())
    }
    catch {
      this.fail(failure)
    }
    return this.state
  }

  private fail(failure: NonNullable<DesktopUpdateState['failure']>): void {
    this.publish({ ...this.state, status: 'error', failure })
  }

  private publish(state: DesktopUpdateState): void {
    if (this.disposed || Object.is(this.state, state)) return
    this.state = state
    for (const listener of this.listeners) listener()
  }
}
