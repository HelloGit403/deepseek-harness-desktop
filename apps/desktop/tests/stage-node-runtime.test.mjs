import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { stageNodeRuntime } from '../scripts/stage-node-runtime.mjs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-node-runtime-'))
  const executable = join(root, 'host', 'node.exe')
  const stageDir = join(root, 'stage')
  mkdirSync(dirname(executable), { recursive: true })
  return { executable, root, stageDir }
}

test('stages the build Node.js executable and installed license', async (context) => {
  const paths = fixture()
  context.after(() => rmSync(paths.root, { force: true, recursive: true }))
  writeFileSync(paths.executable, 'node-binary', { encoding: 'utf8', flag: 'wx' })
  writeFileSync(join(dirname(paths.executable), 'LICENSE'), 'Node.js is licensed for use as follows:\ninstalled-license', 'utf8')

  const staged = await stageNodeRuntime({
    executable: paths.executable,
    fetchImpl: () => { throw new Error('fetch should not run') },
    stageDir: paths.stageDir,
  })

  assert.equal(readFileSync(staged.executable, 'utf8'), 'node-binary')
  assert.match(readFileSync(staged.license, 'utf8'), /installed-license/u)
})

test('uses an explicit Node.js license for installations without metadata', async (context) => {
  const paths = fixture()
  context.after(() => rmSync(paths.root, { force: true, recursive: true }))
  const licensePath = join(paths.root, 'NODE-LICENSE')
  writeFileSync(paths.executable, 'node-binary', { encoding: 'utf8', flag: 'wx' })
  writeFileSync(licensePath, 'Node.js is licensed for use as follows:\nexplicit-license', 'utf8')

  const staged = await stageNodeRuntime({
    executable: paths.executable,
    fetchImpl: () => { throw new Error('fetch should not run') },
    licensePath,
    stageDir: paths.stageDir,
  })

  assert.match(readFileSync(staged.license, 'utf8'), /explicit-license/u)
})

test('downloads the matching Node.js license when the installation omits it', async (context) => {
  const paths = fixture()
  context.after(() => rmSync(paths.root, { force: true, recursive: true }))
  writeFileSync(paths.executable, 'node-binary', { encoding: 'utf8', flag: 'wx' })
  const requestedUrls = []

  const staged = await stageNodeRuntime({
    executable: paths.executable,
    fetchImpl: async (url) => {
      requestedUrls.push(url)
      if (requestedUrls.length === 1) throw new Error('primary host unavailable')
      return new Response('Node.js is licensed for use as follows:\nlicense')
    },
    stageDir: paths.stageDir,
  })

  assert.deepEqual(requestedUrls, [
    `https://nodejs.org/dist/${process.version}/LICENSE`,
    `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`,
  ])
  assert.match(readFileSync(staged.license, 'utf8'), /^Node\.js is licensed/u)
})

test('rejects an unrecognized downloaded license', async (context) => {
  const paths = fixture()
  context.after(() => rmSync(paths.root, { force: true, recursive: true }))
  writeFileSync(paths.executable, 'node-binary', { encoding: 'utf8', flag: 'wx' })

  await assert.rejects(
    stageNodeRuntime({
      executable: paths.executable,
      fetchImpl: async () => new Response('<html>not a license</html>'),
      stageDir: paths.stageDir,
    }),
    /Unable to obtain the Node\.js/u,
  )
})
