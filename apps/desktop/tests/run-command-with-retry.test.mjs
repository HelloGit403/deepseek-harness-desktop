import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runCommandWithRetry } from '../scripts/run-command-with-retry.mjs'

test('retries failed commands until one succeeds', () => {
  const statuses = [1, 2, 0]
  const retries = []
  const status = runCommandWithRetry('builder', ['--win'], {
    attempts: 3,
    beforeRetry: failure => retries.push(failure),
    spawn: () => ({ status: statuses.shift() }),
  })

  assert.equal(status, 0)
  assert.deepEqual(retries, [
    { attempt: 1, status: 1 },
    { attempt: 2, status: 2 },
  ])
})

test('returns the final failure and rejects invalid retry counts', () => {
  let calls = 0
  const status = runCommandWithRetry('builder', [], {
    attempts: 2,
    spawn: () => {
      calls += 1
      return { status: 7 }
    },
  })

  assert.equal(status, 7)
  assert.equal(calls, 2)
  assert.throws(() => runCommandWithRetry('builder', [], { attempts: 0 }), /positive integer/u)
})

test('does not retry process launch errors', () => {
  const failure = new Error('unable to launch builder')

  assert.throws(() => runCommandWithRetry('builder', [], {
    attempts: 3,
    spawn: () => ({ error: failure, status: null }),
  }), error => error === failure)
})
