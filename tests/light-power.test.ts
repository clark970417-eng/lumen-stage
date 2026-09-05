import test from 'node:test'
import assert from 'node:assert/strict'
import { minimumWatts, wattsToPercent } from '../src/lightPower.ts'

test('every one-watt keyboard step round-trips without snapping to the previous percent', () => {
  for (const rated of [261, 300, 600, 1200, 3200]) {
    for (let watts = minimumWatts(rated); watts <= rated; watts++) {
      assert.equal(Math.round(wattsToPercent(watts, rated) / 100 * rated), watts)
    }
  }
})
