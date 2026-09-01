import { afterEach, describe, expect, it, vi } from 'vitest'
import { desktopWindowBridge, type DesktopWindowBridge } from '../src/client/desktop-window-bridge.ts'

const root = globalThis as { deepSeekDesktopWindow?: unknown }
const previous = root.deepSeekDesktopWindow

afterEach(() => {
  if (previous === undefined) delete root.deepSeekDesktopWindow
  else root.deepSeekDesktopWindow = previous
})

describe('desktop window browser adapter', () => {
  it('exists only when the preload installs the complete API', () => {
    delete root.deepSeekDesktopWindow
    expect(desktopWindowBridge()).toBeUndefined()
    root.deepSeekDesktopWindow = { getOpacity: vi.fn() }
    expect(desktopWindowBridge()).toBeUndefined()
    const bridge: DesktopWindowBridge = {
      getOpacity: vi.fn(async () => 1),
      setOpacity: vi.fn(async (opacity: number): Promise<number> => opacity),
    }
    root.deepSeekDesktopWindow = bridge
    expect(desktopWindowBridge()).toBe(bridge)
  })
})
