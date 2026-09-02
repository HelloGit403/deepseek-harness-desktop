import { cpSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PRESET_PACKAGE = join('node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets')

/** Display metadata for the desktop-only alias retained by persisted sessions. */
const LEGACY_CODE_METADATA = [
  'name: PTC 模式（旧会话兼容）',
  'description: 恢复使用历史 code 标识的会话；运行能力与当前 PTC 模式一致。',
  'order: 99',
  '',
].join('\n')

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
