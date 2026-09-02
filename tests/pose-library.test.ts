import test from 'node:test'
import assert from 'node:assert/strict'
import { translateCatalog } from '../src/i18n.ts'
import { isSeatedPose, normalizePose, POSE_LIBRARY } from '../src/pose.ts'

test('every pose has finite joint values and localized guidance', () => {
  assert.equal(new Set(POSE_LIBRARY.map((entry) => entry.id)).size, POSE_LIBRARY.length)
  for (const entry of POSE_LIBRARY) {
    for (const [key, value] of Object.entries(entry.pose)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${entry.id}.${key} must be finite`)
    }
    assert.notEqual(translateCatalog('zh', `pose.note.${entry.id}`, entry.note), entry.note, `${entry.id} needs Chinese guidance`)
    assert.notEqual(translateCatalog('ja', `pose.note.${entry.id}`, entry.note), entry.note, `${entry.id} needs Japanese guidance`)
  }
})

test('walking pose keeps a readable counter-swing and grounded stride', () => {
  const walking = POSE_LIBRARY.find((entry) => entry.id === 'walking')!.pose
  assert.ok(walking.leftLeg > 0 && walking.rightLeg < 0)
  assert.ok(walking.leftArmForward < 0 && walking.rightArmForward > 0)
  assert.ok(walking.rightKnee > walking.leftKnee)
  assert.ok(Math.abs(walking.leftArmForward) <= 15 && Math.abs(walking.rightArmForward) <= 15)
})

test('pose categories carry explicit floor-contact semantics', () => {
  for (const entry of POSE_LIBRARY) {
    // Captured poses are grouped by where they came from rather than by what
    // the body is doing, so the seated ones sit in their own category. They
    // still have to declare it: the placement code reads the flag, not the tab.
    const expected = entry.category === 'captured' ? entry.id.includes('seat') : entry.category === 'seated'
    assert.equal(isSeatedPose(entry.pose), expected, `${entry.id} has the wrong seated state`)
    if (entry.id !== 'jump') {
      assert.equal(entry.pose.airborne, false, `${entry.id} must stay grounded`)
      assert.equal(entry.pose.rootLift, 0, `${entry.id} must not receive an airborne lift`)
    }
  }

  const jump = POSE_LIBRARY.find((entry) => entry.id === 'jump')!.pose
  assert.equal(jump.airborne, true)
  assert.ok(jump.rootLift > 0)

  const crouch = POSE_LIBRARY.find((entry) => entry.id === 'crouch')!.pose
  assert.equal(isSeatedPose(crouch), false)
})

test('legacy poses distinguish a chair pose from a deep crouch', () => {
  assert.equal(isSeatedPose(normalizePose({ leftLeg: 82, rightLeg: 82, leftKnee: 92, rightKnee: 92 })), true)
  assert.equal(isSeatedPose(normalizePose({ leftLeg: 96, rightLeg: 96, leftKnee: 112, rightKnee: 112 })), false)
  assert.equal(normalizePose({ rootLift: 99 }).rootLift, 0.8)
})

test('pose library remains inside the supported anatomical ranges', () => {
  const ranges: Partial<Record<keyof (typeof POSE_LIBRARY)[number]['pose'], readonly [number, number]>> = {
    rootLift: [-0.2, 0.8],
    headYaw: [-95, 95], headTilt: [-25, 25], headRoll: [-20, 20], neckExtend: [-20, 20],
    torsoYaw: [-110, 110], spineBend: [-35, 35], spineSide: [-20, 20], chestLift: [0, 70],
    // These match what armPatch in src/ik.ts will hand back from a wrist drag,
    // because a library pose has to be a pose a user could also reach by hand.
    // The elbow was capped at 115 here, which was never anatomical — a real one
    // flexes to about 145, and reaching a chin or a cheek needs most of that.
    leftArm: [-175, 150], rightArm: [-150, 175], leftArmForward: [-70, 110], rightArmForward: [-70, 110],
    leftElbow: [-145, 145], rightElbow: [-145, 145], leftWrist: [-25, 25], rightWrist: [-25, 25],
    hipShift: [-0.16, 0.16], hipTilt: [-18, 18], hipYaw: [-110, 110], stanceWidth: [0.1, 0.6], weightShift: [-1, 1],
    leftLeg: [-50, 100], rightLeg: [-50, 100], leftKnee: [-5, 115], rightKnee: [-5, 115],
    leftAnkle: [-35, 35], rightAnkle: [-35, 35], leftFootTurn: [-45, 45], rightFootTurn: [-45, 45],
    gazeYaw: [-35, 35], gazePitch: [-35, 35],
  }

  for (const entry of POSE_LIBRARY) {
    for (const [key, [min, max]] of Object.entries(ranges)) {
      const value = entry.pose[key as keyof typeof entry.pose]
      assert.equal(typeof value, 'number', `${entry.id}.${key} must be numeric`)
      assert.ok((value as number) >= min && (value as number) <= max, `${entry.id}.${key} is outside ${min}…${max}`)
    }
  }
})
