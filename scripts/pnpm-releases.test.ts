/** Verify pnpm release-age parsing and version selection. */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseMinimumReleaseAgeMinutes,
  selectNewestEligiblePnpmVersion,
} from './pnpm-releases'

describe('pnpm release selection', () => {
  it('reads the release-age window from workspace configuration', () => {
    assert.equal(parseMinimumReleaseAgeMinutes('minimumReleaseAge: 4320\n'), 4_320)
    assert.throws(() => parseMinimumReleaseAgeMinutes('catalogMode: strict\n'), /must define minimumReleaseAge/)
  })

  it('selects the newest stable release outside the configured age window', () => {
    const now = Date.parse('2026-09-24T12:00:00.000Z')
    const metadata = {
      time: {
        '12.4.0': '2026-09-20T12:00:00.000Z',
        '12.5.0': '2026-09-24T08:00:00.000Z',
        '12.5.1': '2026-09-24T11:00:00.000Z',
        '12.6.0-rc.1': '2026-09-18T12:00:00.000Z',
      },
    }

    assert.equal(selectNewestEligiblePnpmVersion(metadata, 240, now), '12.5.0')
  })

  it('fails clearly when no stable release has cleared the age window', () => {
    assert.throws(
      () => selectNewestEligiblePnpmVersion({ time: { '12.5.1': '2026-09-24T11:00:00.000Z' } }, 4_320, Date.parse('2026-09-24T12:00:00.000Z')),
      /no stable pnpm release older than the workspace's 4320-minute release-age window/,
    )
  })
})
