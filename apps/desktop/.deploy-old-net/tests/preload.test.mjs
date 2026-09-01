import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

test('sandboxed CommonJS preload exposes the complete update API', async () => {
  const path = resolve(import.meta.dirname, '../src/preload.cjs')
  const source = await readFile(path, 'utf8')
  const invocations = []
  const exposed = new Map()

  runInNewContext(source, {
    require: (specifier) => {
      assert.equal(specifier, 'electron')
      return {
        contextBridge: {
          exposeInMainWorld: (name, api) => {
            exposed.set(name, api)
          },
        },
        ipcRenderer: {
          invoke: (channel) => {
            invocations.push(channel)
            return Promise.resolve(channel)
          },
          on: () => {},
          removeListener: () => {},
        },
      }
    },
  }, { filename: path })

  const update = exposed.get('deepSeekDesktopUpdate')
  const window = exposed.get('deepSeekDesktopWindow')
  assert.deepEqual(Object.keys(update).sort(), ['check', 'download', 'getState', 'install', 'onState'])
  assert.deepEqual(Object.keys(window).sort(), ['getOpacity', 'setOpacity'])
  await update.getState()
  await update.check()
  await update.download()
  await update.install()
  await window.getOpacity()
  await window.setOpacity(0.8)
  assert.deepEqual(invocations, [
    'desktop-update:get-state',
    'desktop-update:check',
    'desktop-update:download',
    'desktop-update:install',
    'desktop-window:get-opacity',
    'desktop-window:set-opacity',
  ])
})
