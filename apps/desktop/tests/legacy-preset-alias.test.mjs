import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { installLegacyPresetAlias } from '../scripts/legacy-preset-alias.mjs'

const PRESETS = join('node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets')

function fixture(context) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-preset-alias-'))
  context.after(() => rmSync(root, { force: true, recursive: true }))
  const presets = join(root, PRESETS)
  mkdirSync(join(presets, 'ptc'), { recursive: true })
  writeFileSync(join(presets, 'ptc', 'agent.cordis.yml'), '- id: ptc\n  name: ptc-plugin\n')
  writeFileSync(join(presets, 'ptc', 'preset.yml'), 'name: PTC\n')
  return { presets, root }
}

test('stages legacy code sessions on the current PTC composition', (context) => {
  const { presets, root } = fixture(context)

  assert.equal(installLegacyPresetAlias(root), 'installed')
  assert.equal(
    readFileSync(join(presets, 'code', 'agent.cordis.yml'), 'utf8'),
    '- id: ptc\n  name: ptc-plugin\n',
  )
  assert.match(readFileSync(join(presets, 'code', 'preset.yml'), 'utf8'), /旧会话兼容/u)
  assert.equal(readFileSync(join(presets, 'ptc', 'preset.yml'), 'utf8'), 'name: PTC\n')
})

test('keeps an official code preset when Harness supplies one', (context) => {
  const { presets, root } = fixture(context)
  mkdirSync(join(presets, 'code'))
  writeFileSync(join(presets, 'code', 'agent.cordis.yml'), 'official\n')

  assert.equal(installLegacyPresetAlias(root), 'native')
  assert.equal(readFileSync(join(presets, 'code', 'agent.cordis.yml'), 'utf8'), 'official\n')
})
