import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const GENERAL_IMPORT = "import { GeneralSection } from './GeneralSection.tsx'\n"
const SETTINGS_EXPORT = "export { SettingsDocumentStore } from './settings-document-store.ts'\n"
const GENERAL_REGISTRATION_END = '  }, GeneralSection))\n}'
const ADAPTATION_IMPORT = "import { DesktopUpdateSection } from './DesktopUpdateSection.tsx'"

const imports = [
  "import { DesktopUpdateSection } from './DesktopUpdateSection.tsx'",
  "import { DesktopWindowOpacityRow } from './DesktopWindowOpacityRow.tsx'",
  "import { DesktopUpdateController, desktopUpdateBridge } from './desktop-update-store.ts'",
  "import { desktopWindowBridge } from './desktop-window-bridge.ts'",
].join('\n')

const exports = [
  "export { DesktopUpdateController, desktopUpdateBridge } from './desktop-update-store.ts'",
  "export { desktopWindowBridge } from './desktop-window-bridge.ts'",
].join('\n')

const registrations = `

  const updateBridge = desktopUpdateBridge()
  if (updateBridge !== undefined) {
    const controller = new DesktopUpdateController(updateBridge)
    ctx.effect(() => () => { controller.dispose() }, 'ui-settings-general: desktop update controller')
    ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'desktop-update',
      order: 90,
      label: () => t('update.nav'),
      locale: NS,
      inject: () => ({
        hooks: { desktopUpdate: controller },
        check: () => controller.check(),
        download: () => controller.download(),
        install: () => controller.install(),
      }),
    }, DesktopUpdateSection))
  }

  const windowBridge = desktopWindowBridge()
  if (windowBridge !== undefined) {
    ctx.slots.inject('settings.general.item', () => ctx.slots.register({
      name: 'settings.general.item',
      id: 'desktop-window-opacity',
      order: 90,
      locale: NS,
      inject: () => ({
        getOpacity: () => windowBridge.getOpacity(),
        setOpacity: opacity => windowBridge.setOpacity(opacity),
      }),
    }, DesktopWindowOpacityRow))
  }
}`

function replaceOnce(source, anchor, replacement, description) {
  const first = source.indexOf(anchor)
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(`Official settings ${description} is missing or ambiguous.`)
  }
  return source.replace(anchor, replacement)
}

/**
 * Adds desktop-only registrations while retaining the official settings shell.
 *
 * @param {string} source Official settings client entry contents.
 * @returns {string} Entry contents with the desktop registrations.
 */
export function prepareSettingsIndex(source) {
  if (source.includes(ADAPTATION_IMPORT)) return source
  let updated = replaceOnce(source, GENERAL_IMPORT, `${GENERAL_IMPORT}${imports}\n`, 'import anchor')
  updated = replaceOnce(updated, SETTINGS_EXPORT, `${SETTINGS_EXPORT}${exports}\n`, 'export anchor')
  return replaceOnce(
    updated,
    GENERAL_REGISTRATION_END,
    `  }, GeneralSection))${registrations}`,
    'General-section registration',
  )
}

function dictionaryEntries(source, locale) {
  const start = `export const ${locale} = {\n`
  const startIndex = source.indexOf(start)
  if (startIndex < 0 || source.indexOf(start, startIndex + start.length) >= 0) {
    throw new Error(`Settings ${locale} dictionary is missing or ambiguous.`)
  }
  const endIndex = source.indexOf('} satisfies Record<', startIndex + start.length)
  if (endIndex < 0) throw new Error(`Settings ${locale} dictionary has no typed terminator.`)
  const body = source.slice(startIndex + start.length, endIndex)
  const entries = new Map()
  for (const line of body.split(/\r?\n/u)) {
    const match = /^  '([^']+)':/u.exec(line)
    if (match !== null) entries.set(match[1], line)
  }
  return { entries, start }
}

/**
 * Merges adaptation-owned copy into the official typed dictionaries without
 * replacing official keys or wording.
 *
 * @param {string} official Official settings locale module.
 * @param {string} adaptation Desktop adaptation locale module.
 * @returns {string} Official module containing any missing adaptation keys.
 */
export function mergeSettingsLocales(official, adaptation) {
  let updated = official
  for (const locale of ['zh', 'en']) {
    const target = dictionaryEntries(updated, locale)
    const additions = [...dictionaryEntries(adaptation, locale).entries]
      .filter(([key]) => !target.entries.has(key))
      .map(([, line]) => line)
    if (additions.length > 0) {
      updated = replaceOnce(
        updated,
        target.start,
        `${target.start}${additions.join('\n')}\n`,
        `${locale} dictionary opener`,
      )
    }
  }
  return updated
}

async function main() {
  const [indexPath, officialLocalesPath, adaptationLocalesPath] = process.argv.slice(2)
  if (!indexPath || !officialLocalesPath || !adaptationLocalesPath) {
    throw new Error(
      'Usage: prepare-settings-desktop-adaptation.mjs <index.ts> <official-locales.ts> <adaptation-locales.ts>',
    )
  }
  const [index, officialLocales, adaptationLocales] = await Promise.all([
    readFile(indexPath, 'utf8'),
    readFile(officialLocalesPath, 'utf8'),
    readFile(adaptationLocalesPath, 'utf8'),
  ])
  await Promise.all([
    writeFile(indexPath, prepareSettingsIndex(index), 'utf8'),
    writeFile(officialLocalesPath, mergeSettingsLocales(officialLocales, adaptationLocales), 'utf8'),
  ])
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
