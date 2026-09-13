import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const FILE_TREE_MARKERS = [
  'data-files-state="tree"',
  'data-files-root=',
  'data-files-entry="file"',
  'data-files-path=',
]

/**
 * Verify the official file-tree attributes consumed by the desktop client plugin.
 *
 * @param {string} source Official `FilesBody.tsx` source.
 */
export function verifyWorkspaceFileTreeHost(source) {
  for (const marker of FILE_TREE_MARKERS) {
    if (!source.includes(marker)) throw new Error(`Official workspace file tree is missing ${marker}.`)
  }
}

/**
 * Verify the official composer attribute consumed by the desktop client plugin.
 *
 * @param {string} source Official `ComposerContentEditable.tsx` source.
 */
export function verifyWorkspaceComposerHost(source) {
  if (!source.includes('data-composer-input')) {
    throw new Error('Official Conversation composer is missing data-composer-input.')
  }
}

async function main() {
  const [officialRoot] = process.argv.slice(2)
  if (!officialRoot) throw new Error('Usage: verify-workspace-file-drag-host.mjs <official-root>')
  const fileTree = await readFile(join(
    officialRoot,
    'packages/client/ui-sidebar-files/src/client/FilesBody.tsx',
  ), 'utf8')
  const composer = await readFile(join(
    officialRoot,
    'packages/client/ui-conversation/src/client/input/editor/ComposerContentEditable.tsx',
  ), 'utf8')
  verifyWorkspaceFileTreeHost(fileTree)
  verifyWorkspaceComposerHost(composer)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
