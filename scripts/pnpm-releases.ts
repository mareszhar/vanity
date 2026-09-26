/** Select pnpm releases that satisfy the workspace release-age policy. */

interface PnpmRegistryMetadata {
  readonly time?: Record<string, string>
}

interface PnpmVersionParts {
  readonly major: number
  readonly minor: number
  readonly patch: number
}

/** Parse pnpm's release-age window from the workspace policy. */
export function parseMinimumReleaseAgeMinutes(workspaceConfig: string): number {
  const match = /^minimumReleaseAge:\s*(\d+)\s*(?:#.*)?$/m.exec(workspaceConfig)
  if (match === null)
    throw new Error('pnpm-workspace.yaml must define minimumReleaseAge as a whole number of minutes.')

  const minutes = Number(match[1])
  if (!Number.isSafeInteger(minutes))
    throw new Error('pnpm-workspace.yaml minimumReleaseAge must be a safe whole number of minutes.')
  return minutes
}

/** Choose the newest stable pnpm release that has cleared the workspace age window. */
export function selectNewestEligiblePnpmVersion(
  metadata: PnpmRegistryMetadata,
  minimumReleaseAgeMinutes: number,
  now = Date.now(),
): string {
  if (!Number.isFinite(minimumReleaseAgeMinutes) || minimumReleaseAgeMinutes < 0)
    throw new TypeError('minimumReleaseAgeMinutes must be a non-negative number.')

  const eligible = Object.entries(metadata.time ?? {})
    .flatMap(([version, publishedAt]) => {
      const parts = parseStablePnpmVersion(version)
      const publishedAtMs = Date.parse(publishedAt)
      if (parts === undefined || !Number.isFinite(publishedAtMs))
        return []
      if (publishedAtMs > now - minimumReleaseAgeMinutes * 60_000)
        return []
      return [{ version, parts }]
    })
    .sort((left, right) => compareVersions(right.parts, left.parts))

  const newest = eligible[0]
  if (newest === undefined) {
    throw new Error(
      `The npm registry has no stable pnpm release older than the workspace's ${minimumReleaseAgeMinutes}-minute release-age window.`,
    )
  }
  return newest.version
}

function parseStablePnpmVersion(version: string): PnpmVersionParts | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (match === null)
    return undefined

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

function compareVersions(left: PnpmVersionParts, right: PnpmVersionParts): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch
}
