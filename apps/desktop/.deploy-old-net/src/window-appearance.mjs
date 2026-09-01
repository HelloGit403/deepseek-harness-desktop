import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Lowest supported whole-window opacity, preserving a reliably visible control surface. */
export const MIN_WINDOW_OPACITY = 0.6
/** Fully opaque desktop window. */
export const DEFAULT_WINDOW_OPACITY = 1

/**
 * Validate and clamp an opacity request from the renderer IPC boundary.
 * @param {unknown} value requested opacity from zero to one.
 * @returns {number} opacity rounded to two decimal places and clamped to the supported range.
 */
export function normalizeWindowOpacity(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('Window opacity must be a finite number')
  }
  return Math.round(Math.min(DEFAULT_WINDOW_OPACITY, Math.max(MIN_WINDOW_OPACITY, value)) * 100) / 100
}

/**
 * Read the saved opacity, falling back when the preference file is absent or invalid.
 * @param {string} path desktop appearance preference path.
 * @param {(path: string, encoding: BufferEncoding) => string} [read] preference reader.
 * @returns {number} saved supported opacity or the fully opaque default.
 */
export function readWindowOpacity(path, read = readFileSync) {
  try {
    return normalizeWindowOpacity(JSON.parse(read(path, 'utf8')).opacity)
  }
  catch {
    return DEFAULT_WINDOW_OPACITY
  }
}

/**
 * Own one BrowserWindow's live and persisted opacity preference.
 * @param {{ window: { setOpacity(value: number): void }, preferencesPath: string, read?: (path: string, encoding: BufferEncoding) => string, write?: (path: string, data: string, encoding: BufferEncoding) => void, mkdir?: typeof mkdirSync }} options controller dependencies.
 * @returns {{ getOpacity(): number, setOpacity(value: unknown): number }} opacity controller.
 */
export function createWindowAppearanceController(options) {
  const read = options.read ?? readFileSync
  const write = options.write ?? writeFileSync
  const mkdir = options.mkdir ?? mkdirSync
  let opacity = readWindowOpacity(options.preferencesPath, read)
  options.window.setOpacity(opacity)
  return {
    getOpacity: () => opacity,
    setOpacity: (value) => {
      const next = normalizeWindowOpacity(value)
      mkdir(dirname(options.preferencesPath), { recursive: true })
      write(options.preferencesPath, `${JSON.stringify({ opacity: next })}\n`, 'utf8')
      options.window.setOpacity(next)
      opacity = next
      return opacity
    },
  }
}
