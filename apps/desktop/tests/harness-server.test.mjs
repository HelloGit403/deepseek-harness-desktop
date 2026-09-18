import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  desktopServerArgs,
  desktopServerEnv,
  harnessReadyUrlFromOutput,
  probeHarness,
  waitForHarness,
} from '../src/harness-server.mjs'

test('desktop server uses bundled CAs without disabling certificate verification', () => {
  const parent = {
    Path: 'C:\\Windows\\System32',
    node_options: '--trace-warnings --use-openssl-ca --use-system-ca',
    node_extra_ca_certs: 'C:\\company\\root.pem',
    node_tls_reject_unauthorized: '0',
    node_use_system_ca: '1',
    dsh_home: 'C:\\old-home',
  }

  assert.deepEqual(desktopServerEnv(parent, 'C:\\desktop-home'), {
    Path: 'C:\\Windows\\System32',
    NODE_OPTIONS: '--trace-warnings --use-bundled-ca',
    NODE_EXTRA_CA_CERTS: 'C:\\company\\root.pem',
    DSH_HOME: 'C:\\desktop-home',
  })
  assert.equal(parent.node_options, '--trace-warnings --use-openssl-ca --use-system-ca')
})

test('desktop server emits one canonical bundled CA option', () => {
  assert.deepEqual(desktopServerEnv({ NODE_OPTIONS: '--use-bundled-ca' }, 'C:\\desktop-home'), {
    NODE_OPTIONS: '--use-bundled-ca',
    DSH_HOME: 'C:\\desktop-home',
  })
})

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
