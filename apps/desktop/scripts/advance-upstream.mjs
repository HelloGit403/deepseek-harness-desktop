import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const COMMIT_PATTERN = /^[0-9a-f]{40}$/u
const RELEASE_CANDIDATE_PATTERN = /^(\d+\.\d+\.\d+)-rc\.(\d+)$/u
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u

/**
 * Returns the SemVer-compatible tag consumed by electron-updater.
 *
 * @param {string} version Desktop release version.
 * @returns {string} GitHub release tag.
 */
export function desktopReleaseTag(version) {
  if (!VERSION_PATTERN.test(version)) throw new Error(`Desktop version is not valid SemVer: ${version}`)
  return `v${version}`
}

function versionCore(version, label) {
  if (!VERSION_PATTERN.test(version)) throw new Error(`${label} is not valid SemVer: ${version}`)
  return version.split(/[+-]/u, 1)[0].split('.').map(Number)
}

/**
 * Returns the next desktop release-candidate version aligned with the official version core.
 *
 * @param {string} version Current desktop release-candidate version.
 * @param {string} officialVersion Official desktop package version.
 * @returns {string} The next desktop release-candidate version.
 */
export function nextDesktopVersion(version, officialVersion) {
  const match = RELEASE_CANDIDATE_PATTERN.exec(version)
  if (match === null) throw new Error(`Desktop version is not an rc version: ${version}`)
  const desktopCore = versionCore(version, 'Desktop version')
  const officialCore = versionCore(officialVersion, 'Official desktop version')
  const coreComparison = officialCore.findIndex((value, index) => value !== desktopCore[index])
  if (coreComparison !== -1 && officialCore[coreComparison] < desktopCore[coreComparison]) {
    throw new Error(`Official desktop version core regressed from ${match[1]} to ${officialCore.join('.')}`)
  }
  const officialMatch = RELEASE_CANDIDATE_PATTERN.exec(officialVersion)
  const officialCandidate = officialMatch === null ? 1 : Number(officialMatch[2])
  if (coreComparison !== -1) return `${officialCore.join('.')}-rc.${officialCandidate}`
  return `${match[1]}-rc.${Math.max(Number(match[2]) + 1, officialCandidate)}`
}

/**
 * Advances the pinned official revision and desktop release version together.
 *
 * @param {object} options Advance inputs.
 * @param {string} options.commit Official source commit.
 * @param {string} options.desktopPath Desktop package manifest path.
 * @param {string} options.officialVersion Official desktop package version.
 * @param {string} options.upstreamPath Pinned official revision file path.
 * @returns {string} Updated desktop release version.
 */
export function advanceUpstream(options) {
  if (!COMMIT_PATTERN.test(options.commit)) {
    throw new Error(`Official revision is not a 40-character lowercase commit: ${options.commit}`)
  }
  const upstream = JSON.parse(readFileSync(options.upstreamPath, 'utf8'))
  if (upstream.commit === options.commit) {
    throw new Error(`Official revision is already pinned: ${options.commit}`)
  }
  const desktop = JSON.parse(readFileSync(options.desktopPath, 'utf8'))
  const version = nextDesktopVersion(desktop.version, options.officialVersion)
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
    const officialVersion = process.argv[3]
    if (commit === undefined || officialVersion === undefined) {
      throw new Error('Usage: node advance-upstream.mjs <official-commit> <official-desktop-version>')
    }
    const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    console.log(advanceUpstream({
      commit,
      desktopPath: resolve(appDir, 'package.json'),
      officialVersion,
      upstreamPath: resolve(appDir, '..', '..', '.github', 'desktop-upstream.json'),
    }))
  }
}
