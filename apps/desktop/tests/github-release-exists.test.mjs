import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { githubReleaseExists } from '../scripts/github-release-exists.mjs'

test('scheduled sync runs every five minutes and uses the non-failing release lookup', () => {
  const workflowPath = process.env.DSH_DESKTOP_SOURCE_ROOT
    ? resolve(process.env.DSH_DESKTOP_SOURCE_ROOT, '.github/workflows/desktop-upstream-sync.yml')
    : new URL('../../../.github/workflows/desktop-upstream-sync.yml', import.meta.url)
  const workflow = readFileSync(workflowPath, 'utf8')

  assert.match(workflow, /cron: '2,7,12,17,22,27,32,37,42,47,52,57 \* \* \* \*'/u)
  assert.match(workflow, /raw\.githubusercontent\.com\/\$\(\$source\.repository\)\/\$latest\/apps\/desktop\/package\.json/u)
  assert.match(workflow, /advance-upstream\.mjs \$env:OFFICIAL_COMMIT \$env:OFFICIAL_VERSION/u)
  assert.match(workflow, /node apps\/desktop\/scripts\/github-release-exists\.mjs/u)
  assert.doesNotMatch(workflow, /gh release view/u)
})

test('reports an existing GitHub release without exposing its token', async () => {
  let request
  const exists = await githubReleaseExists({
    fetchImpl: async (...arguments_) => {
      request = arguments_
      return { status: 200 }
    },
    repository: 'HelloGit403/deepseek-harness-desktop',
    tag: 'v0.1.2-rc.9',
    token: 'test-token',
  })

  assert.equal(exists, true)
  assert.equal(request[0], 'https://api.github.com/repos/HelloGit403/deepseek-harness-desktop/releases/tags/v0.1.2-rc.9')
  assert.equal(request[1].headers.Authorization, 'Bearer test-token')
})

test('treats a missing GitHub release as a releasable state', async () => {
  const exists = await githubReleaseExists({
    fetchImpl: async () => ({ status: 404 }),
    repository: 'HelloGit403/deepseek-harness-desktop',
    tag: 'v0.1.2-rc.9',
    token: 'test-token',
  })

  assert.equal(exists, false)
})

test('rejects GitHub lookup failures and invalid inputs', async () => {
  await assert.rejects(() => githubReleaseExists({
    fetchImpl: async () => ({ status: 503 }),
    repository: 'HelloGit403/deepseek-harness-desktop',
    tag: 'v0.1.2-rc.9',
    token: 'test-token',
  }), /HTTP 503/u)
  await assert.rejects(() => githubReleaseExists({
    fetchImpl: async () => ({ status: 200 }),
    repository: 'invalid',
    tag: 'v0.1.2-rc.9',
    token: 'test-token',
  }), /owner\/name/u)
  await assert.rejects(() => githubReleaseExists({
    fetchImpl: async () => ({ status: 200 }),
    repository: 'HelloGit403/deepseek-harness-desktop',
    tag: '',
    token: 'test-token',
  }), /tag must not be empty/u)
  await assert.rejects(() => githubReleaseExists({
    fetchImpl: async () => ({ status: 200 }),
    repository: 'HelloGit403/deepseek-harness-desktop',
    tag: 'v0.1.2-rc.9',
    token: '',
  }), /GH_TOKEN/u)
})
