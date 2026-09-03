import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { CAPTURED_POSES, getCapturedPose } from '../src/capturedPoses.ts'
import { MOTION_BONES, MOTION_WINDOWS, motionFrame, motionSeconds, motionWindowFor, type CapturedMotion } from '../src/capturedMotion.ts'
import { normalizePose, POSE_LIBRARY } from '../src/pose.ts'

const BIN = 'public/models/lumen-human/captured-motion.bin'
const rotationCount = MOTION_WINDOWS.reduce((total, w) => total + w.count, 0) * MOTION_BONES.length * 3
const contactCount = MOTION_WINDOWS.reduce((total, w) => total + w.count * w.contacts.length * 3, 0)

/** A stand-in buffer of the size the index describes. */
function fakeMotion(fill = 0): CapturedMotion {
  return { rotation: new Int16Array(rotationCount).fill(fill), contact: new Int16Array(contactCount).fill(fill) }
}

test('every performance belongs to a pose that ships a frame from it', () => {
  assert.equal(MOTION_WINDOWS.length, CAPTURED_POSES.length)
  for (const window of MOTION_WINDOWS) {
    const shipped = getCapturedPose(window.id)
    assert.ok(shipped, `${window.id} has no shipped frame`)
    assert.ok(window.count > 1, `${window.id} is not a window`)
    assert.ok(window.defaultFrame >= 0 && window.defaultFrame < window.count, `${window.id} ships a frame outside its own window`)
    // The contacts have to match, or a scrubbed frame would land a different
    // hand on a different bone than the frame the pose ships.
    assert.deepEqual(
      window.contacts.map((c) => `${c.hand}:${c.anchor}`),
      shipped!.contacts.map((c) => `${c.hand}:${c.anchor}`),
      `${window.id} contacts disagree with its shipped frame`)
  }
  for (const entry of POSE_LIBRARY.filter((e) => e.category === 'captured')) {
    assert.ok(motionWindowFor(entry.pose.capture), `${entry.id} has no performance to scrub`)
  }
})

test('the index tiles the binary exactly', () => {
  // The index and the file are generated together and shipped apart, so a
  // regenerated one against a stale other is the failure worth catching: it
  // would read a neighbouring pose's frames and silently pose the wrong body.
  let rotationAt = 0
  let contactAt = 0
  for (const window of MOTION_WINDOWS) {
    assert.equal(window.rotationAt, rotationAt, `${window.id} rotation offset`)
    assert.equal(window.contactAt, contactAt, `${window.id} contact offset`)
    rotationAt += window.count * MOTION_BONES.length * 3
    contactAt += window.count * window.contacts.length * 3
  }
  assert.equal(rotationAt, rotationCount)
  assert.equal(contactAt, contactCount)
  assert.equal(statSync(BIN).size, (rotationCount + contactCount) * 2, 'the binary is not the size the index describes')
})

test('a frame decodes to unit rotations for every bone', () => {
  const buffer = readFileSync(BIN)
  const motion: CapturedMotion = {
    rotation: new Int16Array(buffer.buffer, buffer.byteOffset, rotationCount),
    contact: new Int16Array(buffer.buffer, buffer.byteOffset + rotationCount * 2, contactCount),
  }
  for (const window of MOTION_WINDOWS) {
    const shipped = getCapturedPose(window.id)!
    for (const at of [0, window.defaultFrame, window.count - 1]) {
      const frame = motionFrame(motion, window, at, shipped)
      assert.equal(Object.keys(frame.rotation).length, MOTION_BONES.length)
      for (const name of MOTION_BONES) {
        const [x, y, z, w] = frame.rotation[name]
        const length = Math.hypot(x, y, z, w)
        assert.ok(Math.abs(length - 1) < 1e-3, `${window.id}@${at} ${name} is not a unit rotation (${length})`)
        assert.ok(w >= 0, `${window.id}@${at} ${name} rebuilt a negative w`)
      }
      assert.equal(frame.contacts.length, window.contacts.length)
      // A hand rests within arm's reach of what it rests on, in the source
      // rig's centimetres — a decode that slipped alignment would not be.
      for (const contact of frame.contacts) {
        assert.ok(Math.hypot(...contact.offset) < 120, `${window.id}@${at} ${contact.hand} hand is ${Math.hypot(...contact.offset).toFixed(0)} from ${contact.anchor}`)
      }
    }
  }
})

test('the shipped frame and the performance agree at the default', () => {
  const buffer = readFileSync(BIN)
  const motion: CapturedMotion = {
    rotation: new Int16Array(buffer.buffer, buffer.byteOffset, rotationCount),
    contact: new Int16Array(buffer.buffer, buffer.byteOffset + rotationCount * 2, contactCount),
  }
  for (const window of MOTION_WINDOWS) {
    const shipped = getCapturedPose(window.id)!
    const frame = motionFrame(motion, window, window.defaultFrame, shipped)
    // Scrubbing to the default must not move anybody: it is the frame the pose
    // already shows. Sampled at 12 fps against a frame taken at the exact
    // moment, so a fraction of a frame of drift is expected.
    let worst = 0
    for (const [name, quaternion] of Object.entries(shipped.rotation)) {
      const other = frame.rotation[name]
      if (!other) continue
      const dot = Math.abs(quaternion.reduce((sum, v, i) => sum + v * other[i], 0))
      worst = Math.max(worst, 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI)
    }
    assert.ok(worst < 6, `${window.id} default frame is ${worst.toFixed(1)}° from the shipped pose`)
  }
})

test('a frame outside the performance is held at its ends', () => {
  const motion = fakeMotion()
  const window = MOTION_WINDOWS[0]
  const shipped = getCapturedPose(window.id)!
  const before = motionFrame(motion, window, -50, shipped)
  const after = motionFrame(motion, window, window.count + 50, shipped)
  assert.deepEqual(before.rotation, motionFrame(motion, window, 0, shipped).rotation)
  assert.deepEqual(after.rotation, motionFrame(motion, window, window.count - 1, shipped).rotation)
})

test('performances carry no facial bones, and read in clip seconds', () => {
  for (const name of MOTION_BONES) assert.doesNotMatch(name, /eye|lip|jaw|tongue|brow/i)
  const window = motionWindowFor('captured-chin-rest')!
  assert.equal(motionSeconds(window, 0), window.start)
  assert.ok(Math.abs(motionSeconds(window, window.fps) - (window.start + 1)) < 1e-9)
})

test('a scrub position is kept only while it indexes a real performance', () => {
  const window = motionWindowFor('captured-chin-rest')!
  assert.equal(normalizePose({ capture: 'captured-chin-rest', captureFrame: 12 }).captureFrame, 12)
  assert.equal(normalizePose({ capture: 'captured-chin-rest', captureFrame: 9999 }).captureFrame, window.count - 1)
  assert.equal(normalizePose({ capture: 'captured-chin-rest', captureFrame: -4 }).captureFrame, 0)
  // No capture, or one that no longer exists: nothing to index into.
  assert.equal(normalizePose({ captureFrame: 12 }).captureFrame, undefined)
  assert.equal(normalizePose({ capture: 'captured-gone', captureFrame: 12 }).captureFrame, undefined)
})
