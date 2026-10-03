import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareVersions, engineFloor, olderFloor } from './versions.mjs'

test('orders versions as semver does, a prerelease before its release', () => {
  const ordered = ['4.1.0-beta.9', '4.1.0-beta.10', '4.1.0-rc.0', '4.1.0', '4.1.1', '4.2.0-beta.0']
  for (let i = 1; i < ordered.length; i++) assert.ok(compareVersions(ordered[i - 1], ordered[i]) < 0, ordered[i])
  assert.equal(compareVersions('4.1.0', '4.1.0'), 0)
})

test("counts a dependency range as drift only when its floor is older than the template's", () => {
  // As Dependabot raises it
  assert.equal(olderFloor('^26.6.3', '^26.7.0'), false)
  assert.equal(olderFloor('^26.6.3', '^26.6.3'), false)
  assert.equal(olderFloor('^26.6.3', '^26.5.0'), true)
  // Another operator, or a range that isn't a single floor, is a difference to accept
  assert.equal(olderFloor('^26.6.3', '~26.7.0'), true)
  assert.equal(olderFloor('^26.6.3', '>=26 <27'), true)
})

test('reads the oldest Node an engines range allows', () => {
  assert.equal(engineFloor('>=22.13'), '22.13')
  assert.equal(engineFloor('>= 22.13.0'), '22.13.0')
  assert.throws(() => engineFloor('^22.13.0 || >=24'), /22.13.0 \|\| >=24/)
})
