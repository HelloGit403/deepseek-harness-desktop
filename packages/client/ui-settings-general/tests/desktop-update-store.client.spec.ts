import { describe, expect, it, vi } from 'vitest'
import {
  DesktopUpdateController,
  desktopUpdateBridge,
  type DesktopUpdateBridge,
  type DesktopUpdateState,
} from '../src/client/desktop-update-store.ts'

const state = (status: DesktopUpdateState['status']): DesktopUpdateState => ({
  status,
  currentVersion: '0.1.1-rc.1',
  availableVersion: status === 'available' ? '0.1.2-rc.1' : null,
  releaseName: null,
  releaseNotes: '',
  publishedAt: null,
  progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
  failure: null,
})

function bridge(initial = state('idle')) {
  let listener: ((next: DesktopUpdateState) => void) | undefined
  const value: DesktopUpdateBridge = {
    getState: vi.fn(async () => initial),
    check: vi.fn(async () => state('current')),
    download: vi.fn(async () => state('downloaded')),
    install: vi.fn(async () => true),
    onState: vi.fn((next: (state: DesktopUpdateState) => void) => {
      listener = next
      return () => { listener = undefined }
    }),
  }
  return { value, emit: (next: DesktopUpdateState) => { listener?.(next) } }
}

describe('desktop update browser adapter', () => {
  it('exists only when the preload installs the complete API', () => {
    const root = globalThis as { deepSeekDesktopUpdate?: unknown }
    const previous = root.deepSeekDesktopUpdate
    delete root.deepSeekDesktopUpdate
    expect(desktopUpdateBridge()).toBeUndefined()
    root.deepSeekDesktopUpdate = { check: () => {} }
    expect(desktopUpdateBridge()).toBeUndefined()
    const b = bridge()
    root.deepSeekDesktopUpdate = b.value
    expect(desktopUpdateBridge()).toBe(b.value)
    if (previous === undefined) delete root.deepSeekDesktopUpdate
    else root.deepSeekDesktopUpdate = previous
  })

  it('publishes initial, pushed, and action-result states and disposes the listener', async () => {
    const b = bridge()
    const controller = new DesktopUpdateController(b.value)
    const changed = vi.fn()
    const off = controller.subscribe(changed)
    await vi.waitFor(() => { expect(controller.getSnapshot().status).toBe('idle') })
    expect((await controller.check()).status).toBe('current')
    b.emit(state('available'))
    expect(controller.getSnapshot().status).toBe('available')
    await controller.download()
    expect(controller.getSnapshot().status).toBe('downloaded')
    await controller.install()
    expect(b.value.install).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenCalled()
    off()
    controller.dispose()
    b.emit(state('error'))
    expect(controller.getSnapshot().status).toBe('downloaded')
  })

  it('converts rejected bridge operations into stable user-facing failure codes', async () => {
    const b = bridge()
    b.value.check = vi.fn(async () => { throw new Error('wire detail') })
    const controller = new DesktopUpdateController(b.value)
    await controller.check()
    expect(controller.getSnapshot().status).toBe('error')
    expect(controller.getSnapshot().failure).toBe('check-failed')
    controller.dispose()
  })

  it('keeps a pushed state when the initial state request resolves later', async () => {
    let resolveInitial!: (value: DesktopUpdateState) => void
    const b = bridge()
    b.value.getState = vi.fn(() => new Promise<DesktopUpdateState>((resolve) => { resolveInitial = resolve }))
    const controller = new DesktopUpdateController(b.value)
    b.emit(state('available'))
    resolveInitial(state('idle'))
    await Promise.resolve()
    expect(controller.getSnapshot().status).toBe('available')
    controller.dispose()
  })
})
