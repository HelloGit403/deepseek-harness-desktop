/** Narrow whole-window appearance API exposed by the Electron preload. */
export interface DesktopWindowBridge {
  /** Read the saved opacity applied to the complete desktop window. */
  getOpacity: () => Promise<number>
  /** Apply and persist an opacity from zero to one. */
  setOpacity: (opacity: number) => Promise<number>
}

/**
 * Return the desktop window API only when the complete preload face exists.
 * @returns the Electron bridge, or undefined in an ordinary browser.
 */
export function desktopWindowBridge(): DesktopWindowBridge | undefined {
  const bridge = (globalThis as { deepSeekDesktopWindow?: unknown }).deepSeekDesktopWindow
  if (bridge === null || typeof bridge !== 'object') return undefined
  const candidate = bridge as Partial<DesktopWindowBridge>
  if (typeof candidate.getOpacity !== 'function' || typeof candidate.setOpacity !== 'function') return undefined
  return candidate as DesktopWindowBridge
}
