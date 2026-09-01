import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  desktopServerArgs,
  harnessReadyUrlFromOutput,
  probeHarness,
  waitForHarness,
} from '../src/harness-server.mjs'

test('desktop server stays inside the Electron window', () => {
  assert.deepEqual(
    desktopServerArgs('C:\\app\\dsh\\bin.js', '3080'),
    ['--expose-internals', 'C:\\app\\dsh\\bin.js', 'web', '--port', '3080', '--no-open'],
  )
})

test('desktop accepts the authenticated URL announced by its own server', () => {
  const output = 'booting\ndsh web: http://127.0.0.1:3080/?token=desktop-secret\n'
  assert.equal(
    harnessReadyUrlFromOutput(output, 'http://127.0.0.1:3080'),
    'http://127.0.0.1:3080/?token=desktop-secret',
  )
})

test('desktop waits for a complete authenticated startup announcement', () => {
  assert.equal(
    harnessReadyUrlFromOutput('dsh web: http://127.0.0.1:3080/?token=partial', 'http://127.0.0.1:3080'),
    undefined,
  )
})

test('desktop rejects startup announcements from another origin', () => {
  const output = 'dsh web: http://127.0.0.1:9999/?token=desktop-secret\n'
  assert.equal(harnessReadyUrlFromOutput(output, 'http://127.0.0.1:3080'), undefined)
})

test('probeHarness accepts the assembled application marker', async () => {
  const fetchImpl = async () => new Response('<script>globalThis["__DSH_BOOT__"] = {}</script>')
  assert.equal(await probeHarness('http://127.0.0.1:3080/', { fetchImpl }), true)
})

test('probeHarness rejects another service on the same port', async () => {
  const fetchImpl = async () => new Response('<title>Another application</title>')
  assert.equal(await probeHarness('http://127.0.0.1:3080/', { fetchImpl }), false)
})

test('waitForHarness returns after the server becomes ready', async () => {
  let attempts = 0
  const probe = async () => ++attempts === 3
  assert.equal(await waitForHarness('http://127.0.0.1:3080/', {
    intervalMs: 1,
    timeoutMs: 100,
    probe,
  }), true)
  assert.equal(attempts, 3)
})

test('waitForHarness stops immediately when startup is aborted', async () => {
  const controller = new AbortController()
  const waiting = waitForHarness('http://127.0.0.1:3080/', {
    intervalMs: 60_000,
    probe: async () => false,
    signal: controller.signal,
  })
  controller.abort()
  assert.equal(await waiting, false)
})
