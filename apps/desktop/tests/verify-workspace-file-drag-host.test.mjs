import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  verifyWorkspaceComposerHost,
  verifyWorkspaceFileTreeHost,
} from '../scripts/verify-workspace-file-drag-host.mjs'

test('accepts the official DOM attributes used by the workspace-file drag plugin', () => {
  assert.doesNotThrow(() => verifyWorkspaceFileTreeHost(`
    <div data-files-state="tree" data-files-root={root}>
      <li data-files-entry="file" data-files-path={path} />
    </div>
  `))
  assert.doesNotThrow(() => verifyWorkspaceComposerHost('<div data-composer-input />'))
})

test('rejects an upstream file tree or composer that removed a required attribute', () => {
  assert.throws(
    () => verifyWorkspaceFileTreeHost('<div data-files-state="tree" />'),
    /missing data-files-root=/u,
  )
  assert.throws(
    () => verifyWorkspaceComposerHost('<div contentEditable />'),
    /missing data-composer-input/u,
  )
})
