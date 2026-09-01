const { cpSync, existsSync, mkdirSync, readdirSync } = require('node:fs')
const { join } = require('node:path')

function copyMissingPackages(source, destination) {
  mkdirSync(destination, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.bin' || entry.name === '.pnpm') continue
    const sourcePath = join(source, entry.name)
    const destinationPath = join(destination, entry.name)
    if (entry.name.startsWith('@')) {
      copyMissingPackages(sourcePath, destinationPath)
      continue
    }
    if (!existsSync(destinationPath)) {
      cpSync(sourcePath, destinationPath, { dereference: true, recursive: true })
    }
  }
}

/** Restore deploy packages that electron-builder prunes as peer-only dependencies. */
module.exports = function afterPack(context) {
  copyMissingPackages(
    join(context.packager.info.projectDir, 'node_modules'),
    join(context.appOutDir, 'resources', 'app', 'node_modules'),
  )
}

module.exports.copyMissingPackages = copyMissingPackages
