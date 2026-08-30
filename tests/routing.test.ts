import test from 'node:test'
import assert from 'node:assert/strict'
import { routeFromLocation, studioHref } from '../src/routing.ts'

test('public routes resolve without a router dependency', () => {
  assert.equal(routeFromLocation('/', '', ''), 'home')
  assert.equal(routeFromLocation('/privacy/', '', ''), 'privacy')
  assert.equal(routeFromLocation('/studio', '', ''), 'studio')
  assert.equal(routeFromLocation('/lumen-stage/', '?route=support', ''), 'support')
  assert.equal(routeFromLocation('/lumen-stage/studio', '', ''), 'studio')
})

test('legacy shared links and ui mode links still open the studio', () => {
  assert.equal(routeFromLocation('/', '', '#scene=abc'), 'studio')
  assert.equal(routeFromLocation('/', '?ui=mobile', ''), 'studio')
  assert.equal(studioHref('full'), '/studio?ui=full')
})
