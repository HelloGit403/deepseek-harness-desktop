import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  mergeSettingsLocales,
  prepareSettingsIndex,
} from '../scripts/prepare-settings-desktop-adaptation.mjs'

const officialIndex = [
  "import { GeneralSection } from './GeneralSection.tsx'",
  "export { SettingsDocumentStore } from './settings-document-store.ts'",
  'export function apply(ctx) {',
  "  const t = ctx.locale.bind('settings')",
  "  ctx.slots.inject('settings.section', () => ctx.slots.register({",
  "    name: 'settings.section',",
  "    id: 'general',",
  "    children: { 'settings.general.item': { kind: 'list', scope: 'root' } },",
  '  }, GeneralSection))',
  '}',
  '',
].join('\n')

const officialLocales = [
  'export const zh = {',
  "  'trigger': '官方设置',",
  "  'desktop.update.available': '新版本',",
  '} satisfies Record<string, string>',
  'export type SettingsKey = keyof typeof zh',
  'export const en = {',
  "  'trigger': 'Official settings',",
  "  'desktop.update.available': 'Update',",
  '} satisfies Record<SettingsKey, string>',
  '',
].join('\n')

const adaptationLocales = [
  'export const zh = {',
  "  'trigger': '设置',",
  "  'update.nav': '软件更新',",
  "  'windowOpacity.title': '窗口透明度',",
  '} satisfies Record<string, string>',
  'export const en = {',
  "  'trigger': 'Settings',",
  "  'update.nav': 'Software Update',",
  "  'windowOpacity.title': 'Window opacity',",
  '} satisfies Record<string, string>',
  '',
].join('\n')

test('desktop settings adaptation retains the official shell and adds registrations', () => {
  const result = prepareSettingsIndex(officialIndex)

  assert.match(result, /DesktopUpdateSection/u)
  assert.match(result, /desktop-window-opacity/u)
  assert.match(result, /GeneralSection/u)
  assert.equal(prepareSettingsIndex(result), result)
})

test('desktop settings adaptation merges only missing locale keys', () => {
  const result = mergeSettingsLocales(officialLocales, adaptationLocales)

  assert.match(result, /'trigger': '官方设置'/u)
  assert.match(result, /'trigger': 'Official settings'/u)
  assert.match(result, /'desktop\.update\.available': '新版本'/u)
  assert.match(result, /'update\.nav': '软件更新'/u)
  assert.match(result, /'windowOpacity\.title': 'Window opacity'/u)
  assert.equal(mergeSettingsLocales(result, adaptationLocales), result)
})

test('desktop settings adaptation rejects an unknown official entry layout', () => {
  assert.throws(() => prepareSettingsIndex('export function apply() {}\n'), /import anchor/u)
  assert.throws(() => mergeSettingsLocales('', adaptationLocales), /zh dictionary/u)
})
