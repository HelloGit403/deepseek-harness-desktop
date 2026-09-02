import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const COMMIT_PATTERN = /^[0-9a-f]{40}$/u
const RELEASE_CANDIDATE_PATTERN = /^(\d+\.\d+\.\d+)-rc\.(\d+)$/u
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u

/** Return the SemVer-compatible tag consumed by electron-updater. */
export function desktopReleaseTag(version) {
  if (!VERSION_PATTERN.test(version)) throw new Error(`Desktop version is not valid SemVer: ${version}`)
  return `v${version}`
}

/** Return the next desktop release-candidate version. */
export function nextDesktopVersion(version) {
  const match = RELEASE_CANDIDATE_PATTERN.exec(version)
  if (match === null) throw new Error(`Desktop version is not an rc version: ${version}`)
  return `${match[1]}-rc.${Number(match[2]) + 1}`
}

/** Advance the pinned official revision and desktop release version together. */
export function advanceUpstream(options) {
  if (!COMMIT_PATTERN.test(options.commit)) {
    throw new Error(`Official revision is not a 40-character lowercase commit: ${options.commit}`)
  }
  const upstream = JSON.parse(readFileSync(options.upstreamPath, 'utf8'))
  if (upstream.commit === options.commit) {
    throw new Error(`Official revision is already pinned: ${options.commit}`)
  }
  const desktop = JSON.parse(readFileSync(options.desktopPath, 'utf8'))
  const version = nextDesktopVersion(desktop.version)
  upstream.commit = options.commit
  desktop.version = version
  writeFileSync(options.upstreamPath, `${JSON.stringify(upstream, undefined, 2)}\n`)
  writeFileSync(options.desktopPath, `${JSON.stringify(desktop, undefined, 2)}\n`)
  return version
}

if (import.meta.main) {
  const argument = process.argv[2]
  if (argument === '--tag') {
    const version = process.argv[3]
    if (version === undefined) throw new Error('Usage: node advance-upstream.mjs --tag <version>')
    console.log(desktopReleaseTag(version))
  } else {
    const commit = argument
    if (commit === undefined) throw new Error('Usage: node advance-upstream.mjs <official-commit>')
    const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    console.log(advanceUpstream({
      commit,
      desktopPath: resolve(appDir, 'package.json'),
      upstreamPath: resolve(appDir, '..', '..', '.github', 'desktop-upstream.json'),
    }))
  }
}
