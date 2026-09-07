const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u

/**
 * Return whether a GitHub Release exists for one tag.
 *
 * @param {{ fetchImpl?: typeof fetch, repository: string, tag: string, token: string }} options Release lookup inputs.
 * @returns {Promise<boolean>} Whether GitHub returned the release.
 */
export async function githubReleaseExists(options) {
  if (!REPOSITORY_PATTERN.test(options.repository)) {
    throw new Error(`GitHub repository must use owner/name: ${options.repository}`)
  }
  if (options.tag.length === 0) throw new Error('GitHub release tag must not be empty.')
  if (options.token.length === 0) throw new Error('GH_TOKEN must not be empty.')

  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const [owner, repository] = options.repository.split('/')
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/releases/tags/${encodeURIComponent(options.tag)}`
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${options.token}`,
      'User-Agent': 'deepseek-harness-desktop-release',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (response.status === 200) return true
  if (response.status === 404) return false
  throw new Error(`GitHub release lookup failed for ${options.repository}@${options.tag}: HTTP ${response.status}.`)
}

if (import.meta.main) {
  const repository = process.argv[2]
  const tag = process.argv[3]
  if (repository === undefined || tag === undefined) {
    throw new Error('Usage: node github-release-exists.mjs <owner/name> <tag>')
  }
  console.log(await githubReleaseExists({
    repository,
    tag,
    token: process.env.GH_TOKEN ?? '',
  }))
}
