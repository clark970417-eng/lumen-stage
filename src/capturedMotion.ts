/**
 * The performances the captured poses were cut from.
 *
 * A captured pose ships one frame; this is the seven seconds around it, so the
 * frame can be scrubbed for rather than accepted. A performer holding a pose
 * passes through it — the hand arrives at the chin, settles, drifts — and
 * which moment reads best is a judgement only the person looking at the
 * picture can make.
 *
 * Stored as a binary asset rather than as source because it is a quarter of a
 * megabyte, and fetched only when a captured pose is actually chosen. Until it
 * arrives the shipped frame stands in, so nothing waits on the network.
 *
 * Rotations are deltas from the source rig's rest, the same as the shipped
 * frames, quantised to three int16 components with the fourth rebuilt —
 * negating a quaternion names the same rotation, so w is forced positive and
 * dropped.
 *
 * Generated. Re-run scripts/motion-build.html to change it.
 */

import type { CapturedContact, CapturedPose } from './capturedPoses.ts'

const assetBase = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
const MOTION_URL = `${assetBase}models/lumen-human/captured-motion.bin`

export type MotionWindow = {
  id: string
  /** Frames in the window. */
  count: number
  fps: number
  /** Seconds into the source clip that frame zero sits at. */
  start: number
  /** The frame the shipped pose was cut from. */
  defaultFrame: number
  /** Offset into the rotation array, in int16s. */
  rotationAt: number
  /** Offset into the contact array, in int16s. */
  contactAt: number
  contacts: { hand: CapturedContact['hand']; anchor: string }[]
}

/** Bone order every frame is written in. */
export const MOTION_BONES: string[] = ['Bip01_Pelvis', 'Bip01_Spine', 'Bip01_Spine1', 'Bip01_Spine2', 'Bip01_Neck', 'Bip01_Head', 'Bip01_LMouthBottom', 'Bip01_RMouthBottom', 'Bip01_RMasseter', 'Bip01_LMasseter', 'Bip01_RCaninus', 'Bip01_LCaninus', 'Bip01_RMouthCorner', 'Bip01_LMouthCorner', 'Bip01_RCheek', 'Bip01_LCheek', 'Bip01_MNose', 'Bip01_L_Clavicle', 'Bip01_L_UpperArm', 'Bip01_L_Forearm', 'Bip01_L_Hand', 'Bip01_L_Finger0', 'Bip01_L_Finger01', 'Bip01_L_Finger02', 'Bip01_L_Finger1', 'Bip01_L_Finger11', 'Bip01_L_Finger12', 'Bip01_L_Finger2', 'Bip01_L_Finger21', 'Bip01_L_Finger22', 'Bip01_L_Finger3', 'Bip01_L_Finger31', 'Bip01_L_Finger32', 'Bip01_L_Finger4', 'Bip01_L_Finger41', 'Bip01_L_Finger42', 'Bip01_R_Clavicle', 'Bip01_R_UpperArm', 'Bip01_R_Forearm', 'Bip01_R_Hand', 'Bip01_R_Finger0', 'Bip01_R_Finger01', 'Bip01_R_Finger02', 'Bip01_R_Finger1', 'Bip01_R_Finger11', 'Bip01_R_Finger12', 'Bip01_R_Finger2', 'Bip01_R_Finger21', 'Bip01_R_Finger22', 'Bip01_R_Finger3', 'Bip01_R_Finger31', 'Bip01_R_Finger32', 'Bip01_R_Finger4', 'Bip01_R_Finger41', 'Bip01_R_Finger42', 'Bip01_L_Thigh', 'Bip01_L_Calf', 'Bip01_L_Foot', 'Bip01_L_Toe0', 'Bip01_R_Thigh', 'Bip01_R_Calf', 'Bip01_R_Foot', 'Bip01_R_Toe0']

/** Head above foot in the rig these were read off, for scaling contacts. */
export const MOTION_STATURE = 142.27

/** Contact offsets are stored as hundredths of the source rig's units. */
const CONTACT_SCALE = 100

const ROTATION_COUNT = 121716

export const MOTION_WINDOWS: MotionWindow[] = [
  { id: 'captured-relaxed', count: 85, fps: 12, start: 5.043, defaultFrame: 42, rotationAt: 0, contactAt: 0, contacts: [{ hand: 'left', anchor: 'Bip01_L_Thigh' }, { hand: 'right', anchor: 'Bip01_R_Thigh' }] },
  { id: 'captured-hands-hips', count: 85, fps: 12, start: 22.625, defaultFrame: 42, rotationAt: 16065, contactAt: 510, contacts: [{ hand: 'left', anchor: 'Bip01_L_Thigh' }, { hand: 'right', anchor: 'Bip01_R_Thigh' }] },
  { id: 'captured-touch-face', count: 66, fps: 12, start: 0, defaultFrame: 23, rotationAt: 32130, contactAt: 1020, contacts: [{ hand: 'right', anchor: 'Bip01_Head' }, { hand: 'left', anchor: 'Bip01_L_Thigh' }] },
  { id: 'captured-chin-rest', count: 83, fps: 12, start: 0, defaultFrame: 40, rotationAt: 44604, contactAt: 1416, contacts: [{ hand: 'right', anchor: 'Bip01_Head' }, { hand: 'left', anchor: 'Bip01_Spine1' }] },
  { id: 'captured-open-palms', count: 85, fps: 12, start: 8.875, defaultFrame: 42, rotationAt: 60291, contactAt: 1914, contacts: [] },
  { id: 'captured-seat-upright', count: 85, fps: 12, start: 13.345, defaultFrame: 42, rotationAt: 76356, contactAt: 1914, contacts: [{ hand: 'left', anchor: 'Bip01_L_Thigh' }, { hand: 'right', anchor: 'Bip01_R_Thigh' }] },
  { id: 'captured-seat-crossed', count: 85, fps: 12, start: 28.318, defaultFrame: 42, rotationAt: 92421, contactAt: 2424, contacts: [{ hand: 'left', anchor: 'Bip01_L_Thigh' }, { hand: 'right', anchor: 'Bip01_R_Thigh' }] },
  { id: 'captured-seat-chin', count: 70, fps: 12, start: 3.175, defaultFrame: 42, rotationAt: 108486, contactAt: 2934, contacts: [{ hand: 'right', anchor: 'Bip01_Head' }, { hand: 'left', anchor: 'Bip01_Spine1' }] },
]

const BY_ID = new Map(MOTION_WINDOWS.map((entry) => [entry.id, entry]))

export function motionWindowFor(id: string | undefined): MotionWindow | undefined {
  return id ? BY_ID.get(id) : undefined
}

export type CapturedMotion = { rotation: Int16Array; contact: Int16Array }

let pending: Promise<CapturedMotion | null> | null = null

/**
 * Fetches the performances, once per session.
 *
 * Answers null rather than throwing when the asset is missing or short: a
 * studio that cannot reach it should carry on posing people from the shipped
 * frames, not fail to pose anybody.
 */
export function loadCapturedMotion(): Promise<CapturedMotion | null> {
  pending ??= fetch(MOTION_URL)
    .then((response) => response.ok ? response.arrayBuffer() : null)
    .then((buffer) => {
      if (!buffer) return null
      const rotationBytes = ROTATION_COUNT * 2
      if (buffer.byteLength < rotationBytes) return null
      return {
        rotation: new Int16Array(buffer, 0, ROTATION_COUNT),
        contact: new Int16Array(buffer, rotationBytes, (buffer.byteLength - rotationBytes) / 2),
      }
    })
    .catch(() => null)
  return pending
}

/**
 * One frame of a performance, shaped like a shipped pose so that the same code
 * writes it onto the skeleton and lands the same hands.
 */
export function motionFrame(motion: CapturedMotion, window: MotionWindow, frame: number, shipped: CapturedPose): CapturedPose {
  const at = Math.min(window.count - 1, Math.max(0, Math.round(frame)))
  const rotation: CapturedPose['rotation'] = {}
  let read = window.rotationAt + at * MOTION_BONES.length * 3
  for (const name of MOTION_BONES) {
    const x = motion.rotation[read] / 32767
    const y = motion.rotation[read + 1] / 32767
    const z = motion.rotation[read + 2] / 32767
    read += 3
    rotation[name] = [x, y, z, Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z))]
  }
  let offset = window.contactAt + at * window.contacts.length * 3
  const contacts: CapturedContact[] = window.contacts.map(({ hand, anchor }) => {
    const start = offset
    offset += 3
    return {
      hand,
      anchor,
      offset: [
        motion.contact[start] / CONTACT_SCALE,
        motion.contact[start + 1] / CONTACT_SCALE,
        motion.contact[start + 2] / CONTACT_SCALE,
      ],
    }
  })
  return { ...shipped, rotation, contacts }
}

/** Where a frame sits in the source clip, so the control can read in seconds. */
export function motionSeconds(window: MotionWindow, frame: number): number {
  return window.start + frame / window.fps
}
