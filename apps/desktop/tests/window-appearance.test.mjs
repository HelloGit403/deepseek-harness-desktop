import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createWindowAppearanceController,
  DEFAULT_WINDOW_OPACITY,
  MIN_WINDOW_OPACITY,
  normalizeWindowOpacity,
  readWindowOpacity,
} from '../src/window-appearance.mjs'

test('window opacity rejects invalid input and clamps into the visible range', () => {
  assert.throws(() => normalizeWindowOpacity(Number.NaN), /finite number/)
  assert.equal(normalizeWindowOpacity(0.1), MIN_WINDOW_OPACITY)
  assert.equal(normalizeWindowOpacity(0.837), 0.84)
  assert.equal(normalizeWindowOpacity(2), DEFAULT_WINDOW_OPACITY)
})

test('window opacity uses the opaque default for missing or invalid preferences', () => {
  assert.equal(readWindowOpacity('missing', () => { throw new Error('ENOENT') }), DEFAULT_WINDOW_OPACITY)
  assert.equal(readWindowOpacity('invalid', () => '{'), DEFAULT_WINDOW_OPACITY)
  assert.equal(readWindowOpacity('valid', () => '{"opacity":0.78}'), 0.78)
})

test('window appearance applies, persists, and returns the whole-window opacity', () => {
  const applied = []
  const writes = []
  const directories = []
  const controller = createWindowAppearanceController({
    window: { setOpacity: value => { applied.push(value) } },
    preferencesPath: 'C:\\profile\\window-appearance.json',
    read: () => '{"opacity":0.88}',
    write: (path, data, encoding) => { writes.push([path, data, encoding]) },
    mkdir: (path, options) => { directories.push([path, options]) },
  })
  assert.equal(controller.getOpacity(), 0.88)
  assert.equal(controller.setOpacity(0.73), 0.73)
  assert.deepEqual(applied, [0.88, 0.73])
  assert.deepEqual(directories, [['C:\\profile', { recursive: true }]])
  assert.deepEqual(writes, [['C:\\profile\\window-appearance.json', '{"opacity":0.73}\n', 'utf8']])
})
