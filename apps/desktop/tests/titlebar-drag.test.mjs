import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const theme = readFileSync(new URL('../src/cyber-theme.css', import.meta.url), 'utf8')

test('desktop title bar exposes a drag region without covering window controls', () => {
  const dragRegion = theme.match(/body::after\s*\{(?<rules>[^}]+)\}/u)?.groups?.rules

  assert.ok(dragRegion)
  assert.match(dragRegion, /inset:\s*0 138px auto 0;/u)
  assert.match(dragRegion, /height:\s*36px;/u)
  assert.match(dragRegion, /-webkit-app-region:\s*drag;/u)
})
