import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { resolveNodeRuntime } from '../src/node-runtime.mjs'

test('packaged applications use the staged regular Node.js runtime', () => {
  assert.equal(resolveNodeRuntime({
    env: {},
    isPackaged: true,
    resourcesPath: 'C:\\Program Files\\DeepSeek Harness\\resources',
  }), join('C:\\Program Files\\DeepSeek Harness\\resources', 'app', 'runtime', 'node.exe'))
})

test('development can select a regular Node.js executable', () => {
  assert.equal(resolveNodeRuntime({
    env: { DSH_DESKTOP_NODE: 'D:\\nodejs\\node.exe' },
    isPackaged: false,
    resourcesPath: 'unused',
  }), 'D:\\nodejs\\node.exe')
  assert.equal(resolveNodeRuntime({
    env: { npm_node_execpath: 'C:\\tools\\node.exe' },
    isPackaged: false,
    resourcesPath: 'unused',
  }), 'C:\\tools\\node.exe')
  assert.equal(resolveNodeRuntime({ env: {}, isPackaged: false, resourcesPath: 'unused' }), 'node')
})
