import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PRESET_PACKAGE = join('node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets')
const WEB_PRESET_PACKAGE = join('node_modules', '@deepseek-ai', 'dsh-web-app', 'presets')
const CODE_PRESET = /^\s+id:\s+code\s*$/mu

/** Display metadata for the desktop-only alias retained by persisted sessions. */
const LEGACY_CODE_METADATA = [
  'name: PTC 模式（旧会话兼容）',
  'description: 恢复使用历史 code 标识的会话；运行能力与当前 PTC 模式一致。',
  'order: 99',
  '',
].join('\n')

/**
 * Add the retired `code` id as a second declaration of the current PTC preset.
 *
 * @param {string} source Official PTC patch contents.
 * @returns {string} Patch with one desktop-only code alias.
 */
export function prepareLegacyPresetPatch(source) {
  if (source.includes('- id: preset-code')) return source
  const marker = '- insert:\n    - id: preset-ptc\n'
  const start = source.indexOf(marker)
  if (start < 0 || source.indexOf(marker, start + marker.length) >= 0) {
    throw new Error('Official PTC preset declaration is missing or ambiguous.')
  }
  const original = source.slice(start)
  if ((original.match(/^- insert:/gmu) ?? []).length !== 1 || !original.includes('\n        id: ptc\n')) {
    throw new Error('Official PTC preset patch has an unsupported layout.')
  }
  const alias = original
    .replace('- id: preset-ptc\n', '- id: preset-code\n')
    .replace('\n        id: ptc\n', '\n        id: code\n')
    .replace('\n        order: 2\n', '\n        order: 99\n')
  return `${source.trimEnd()}\n${alias}`
}

function hasCodePreset(directory) {
  return readdirSync(directory)
    .filter(name => name.endsWith('.patch.yml'))
    .some(name => CODE_PRESET.test(readFileSync(join(directory, name), 'utf8')))
}

/**
 * Add the desktop channel's retired `code` preset id as an alias of `ptc`.
 *
 * The alias is materialized only in the staged application. A future Harness
 * package that supplies `code` itself remains authoritative and is not
 * overwritten.
 * @param {string} stageDir Deployed Electron application directory.
 * @returns {'installed' | 'native'} Whether this build added the alias.
 */
export function installLegacyPresetAlias(stageDir) {
  const webPresets = join(stageDir, WEB_PRESET_PACKAGE)
  if (existsSync(webPresets)) {
    if (!hasCodePreset(webPresets)) {
      throw new Error(`desktop: code preset is missing from staged Web patch files at ${webPresets}`)
    }
    return CODE_PRESET.test(readFileSync(join(webPresets, 'ptc.patch.yml'), 'utf8')) ? 'installed' : 'native'
  }
  const presets = join(stageDir, PRESET_PACKAGE)
  const source = join(presets, 'ptc')
  const target = join(presets, 'code')
  if (existsSync(target)) return 'native'
  if (!existsSync(source)) {
    throw new Error(`desktop: cannot install legacy preset alias; PTC preset is missing at ${source}`)
  }
  cpSync(source, target, { errorOnExist: true, recursive: true })
  writeFileSync(join(target, 'preset.yml'), LEGACY_CODE_METADATA)
  return 'installed'
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const patchPath = process.argv[2]
  if (!patchPath) throw new Error('Usage: legacy-preset-alias.mjs <official-ptc.patch.yml>')
  if (!hasCodePreset(dirname(patchPath))) {
    writeFileSync(patchPath, prepareLegacyPresetPatch(readFileSync(patchPath, 'utf8')))
  }
}
