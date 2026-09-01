/**
 * The figure rig.
 *
 * Set.A.Light ships scanned people with a full skeleton; we generate ours, so
 * the rig has to carry every joint a photographer actually reaches for —
 * including the ones that change where the light lands: the spine (which moves
 * the chest plane), the clavicles (which move the shoulder line), the neck
 * (which decides whether the key falls on the jaw or the cheekbone) and the
 * legs (which decide the silhouette).
 *
 * Angles are degrees, positive following the anatomical convention noted on
 * each field. Distances are metres on a 1.82 m figure and scale with height.
 */

export type HandPose = 'relaxed' | 'open' | 'fist' | 'point' | 'pocket' | 'grip'

export type ModelPose = {
  // --- Root motion ---------------------------------------------------------
  /** True when neither foot should be pulled back to the floor. */
  airborne: boolean
  /** True when the pelvis should be placed on a chair rather than grounded. */
  seated: boolean
  /** Authored vertical travel in metres, used for jumps and lifted poses. */
  rootLift: number

  // --- Head and neck -------------------------------------------------------
  /** Turn, + is the figure's left (screen right at 0° facing). */
  headYaw: number
  /** Nod, + looks down. */
  headTilt: number
  /** Roll, + drops the right ear toward the shoulder. */
  headRoll: number
  /** Neck extension, + pushes the chin forward and away from the throat. */
  neckExtend: number

  // --- Spine ---------------------------------------------------------------
  /** Rotation about the vertical through the ribcage. */
  torsoYaw: number
  /** Forward/back lean at the lumbar, + leans into the camera. */
  spineBend: number
  /** Lateral bend, + drops the right shoulder. */
  spineSide: number
  /** Ribcage lift — the difference between a slouch and a runway posture. */
  chestLift: number

  // --- Shoulders and arms --------------------------------------------------
  /** Clavicle lift, + raises the shoulder toward the ear. */
  leftShoulder: number
  rightShoulder: number
  /** Abduction, away from the ribs. Negative on the left keeps arms down. */
  leftArm: number
  rightArm: number
  /** Flexion, + swings the arm forward toward the camera. */
  leftArmForward: number
  rightArmForward: number
  /** Humeral rotation, + rolls the elbow point outward. */
  leftArmTwist: number
  rightArmTwist: number
  /** Elbow flexion. */
  leftElbow: number
  rightElbow: number
  /** Forearm pronation, + turns the palm down. */
  leftForearmTwist: number
  rightForearmTwist: number
  /** Wrist flexion, + bends the hand toward the palm side. */
  leftWrist: number
  rightWrist: number
  leftHand: HandPose
  rightHand: HandPose

  // --- Pelvis and legs -----------------------------------------------------
  /** Lateral pelvis translation in metres — the contrapposto shift. */
  hipShift: number
  /** Pelvis tilt about the view axis, + raises the right hip. */
  hipTilt: number
  /** Pelvis rotation, independent of the ribcage. */
  hipYaw: number
  /** Distance between the feet in metres, measured at the ankles. */
  stanceWidth: number
  /** Weight distribution, -1 fully on the left foot, +1 fully on the right. */
  weightShift: number
  /** Hip flexion, + lifts the knee toward the chest. */
  leftLeg: number
  rightLeg: number
  /** Hip abduction, + swings the leg away from the midline. */
  leftLegSplay: number
  rightLegSplay: number
  /** Knee flexion, + folds the heel toward the seat. */
  leftKnee: number
  rightKnee: number
  /** Ankle, + points the toes down. */
  leftAnkle: number
  rightAnkle: number
  /** Foot rotation about the vertical, + turns the toes outward. */
  leftFootTurn: number
  rightFootTurn: number

  // --- Face ----------------------------------------------------------------
  /** Brow raise, + opens the forehead. Negative furrows it. */
  browRaise: number
  /** Lid aperture, 0 closed, 100 wide. */
  eyeOpen: number
  /** Orbicularis squint — a real smile narrows the eye. */
  squint: number
  /** Mouth corners, + smiles. */
  smile: number
  /** Jaw opening. */
  mouthOpen: number
  /** Lip parting without a jaw drop. */
  lipPart: number
  /** Jaw thrust, + pushes the jaw forward for a stronger jawline. */
  jawSet: number
  /** Gaze away from the head axis, degrees. */
  gazeYaw: number
  gazePitch: number
}

export const NEUTRAL_POSE: ModelPose = {
  airborne: false, seated: false, rootLift: 0,
  headYaw: 0, headTilt: 0, headRoll: 0, neckExtend: 0,
  torsoYaw: 0, spineBend: 0, spineSide: 0, chestLift: 18,
  leftShoulder: -1, rightShoulder: -1,
  // Solved so the wrist lands beside the thigh rather than a hand's width out
  // from it. Eight degrees of splay is what a figure drawn from the shoulders
  // wants; on a body it left both arms standing off the hips with daylight
  // under them, which is the first thing that reads as a mannequin.
  leftArm: -2.1, rightArm: 2.1,
  leftArmForward: 1.7, rightArmForward: 1.7,
  leftArmTwist: 0, rightArmTwist: 0,
  leftElbow: 4.1, rightElbow: -4.1,
  leftForearmTwist: 0, rightForearmTwist: 0,
  leftWrist: 0, rightWrist: 0,
  leftHand: 'relaxed', rightHand: 'relaxed',
  hipShift: 0, hipTilt: 0, hipYaw: 0, stanceWidth: 0.27, weightShift: 0,
  leftLeg: 0, rightLeg: 0, leftLegSplay: 0, rightLegSplay: 0,
  leftKnee: 2, rightKnee: 2, leftAnkle: 0, rightAnkle: 0,
  leftFootTurn: 6, rightFootTurn: 6,
  browRaise: 0, eyeOpen: 100, squint: 0, smile: 0, mouthOpen: 0, lipPart: 0, jawSet: 0,
  gazeYaw: 0, gazePitch: 0,
}

/** Fills in every joint an older saved scene never knew about. */
export function normalizePose(partial: Partial<ModelPose> | undefined | null): ModelPose {
  if (!partial) return { ...NEUTRAL_POSE }
  const pose = { ...NEUTRAL_POSE, ...partial }
  if (typeof partial.airborne !== 'boolean') pose.airborne = false
  if (typeof partial.seated !== 'boolean') {
    const folded = Math.min(pose.leftLeg, pose.rightLeg) > 60
    const crouched = Math.max(pose.leftKnee, pose.rightKnee) >= 102
    pose.seated = folded && !crouched
  }
  pose.rootLift = Number.isFinite(pose.rootLift) ? Math.min(0.8, Math.max(-0.2, pose.rootLift)) : 0
  // Hand poses arrive as free-form strings from imported project files.
  if (!HAND_POSES.includes(pose.leftHand)) pose.leftHand = 'relaxed'
  if (!HAND_POSES.includes(pose.rightHand)) pose.rightHand = 'relaxed'
  return pose
}

export const HAND_POSES: HandPose[] = ['relaxed', 'open', 'fist', 'point', 'pocket', 'grip']

export type PoseCategory = 'standing' | 'seated' | 'dynamic' | 'beauty' | 'commercial'

export type PoseEntry = {
  id: string
  category: PoseCategory
  /** English label; the UI looks up `pose.<id>` for the localized name. */
  label: string
  /** What the pose is for, in lighting terms. */
  note: string
  pose: ModelPose
}

const p = (overrides: Partial<ModelPose>): ModelPose => ({ ...NEUTRAL_POSE, ...overrides })

/**
 * The pose library.
 *
 * Each entry is a real posing instruction rather than a random joint dump — the
 * note says what the pose does to the light, because that is the only reason to
 * pick one pose over another inside a lighting tool.
 */
export const POSE_LIBRARY: PoseEntry[] = [
  // --- Standing ------------------------------------------------------------
  { id: 'neutral', category: 'standing', label: 'Neutral stand', note: 'Square to camera. The reference every ratio is judged against.', pose: p({}) },
  { id: 'contrapposto', category: 'standing', label: 'Contrapposto', note: 'Weight on one foot. The hip break gives the key light a waist to model.', pose: p({ hipShift: 0.05, hipTilt: -4, weightShift: 0.45, headYaw: 7, headTilt: -1, headRoll: 2, torsoYaw: -5, spineSide: 2, chestLift: 28, leftShoulder: -2, rightShoulder: 0, leftArm: -9, rightArm: 11, leftArmForward: 2, rightArmForward: -1, leftElbow: 8, rightElbow: -11, rightKnee: 9, leftKnee: 2, rightAnkle: 2, leftFootTurn: 5, rightFootTurn: 11, stanceWidth: 0.24 }) },
  { id: 'hands-on-hips', category: 'standing', label: 'Hands on hips', note: 'Triangles at the elbows. Watch the arms shadowing the ribcage.', pose: p({ leftArm: -53.6, rightArm: 53.6, leftArmForward: -64.7, rightArmForward: -64.7, leftArmTwist: 47.2, rightArmTwist: -47.2, leftElbow: 89.3, rightElbow: -89.3, leftForearmTwist: -25, rightForearmTwist: 25, leftWrist: 7, rightWrist: -7, leftHand: 'grip', rightHand: 'grip', stanceWidth: 0.34, chestLift: 36 }) },
  { id: 'profile', category: 'standing', label: 'Profile', note: 'Full side-on. Short lighting becomes rim lighting here.', pose: p({ torsoYaw: 56, hipYaw: 48, headYaw: 14, headTilt: -1, leftArm: -7, rightArm: 9, leftArmForward: 2, rightArmForward: -2, leftElbow: 9, rightElbow: -12, hipShift: 0.02, leftFootTurn: 28, rightFootTurn: 32, chestLift: 24 }) },
  { id: 'three-quarter', category: 'standing', label: 'Three-quarter turn', note: 'The classic portrait angle. Sets up short and broad lighting.', pose: p({ torsoYaw: 29, hipYaw: 22, headYaw: -10, headTilt: -2, headRoll: 1, leftArm: -8, rightArm: 10, leftElbow: 11, rightElbow: -10, weightShift: 0.32, hipShift: 0.035, rightKnee: 8, chestLift: 27 }) },
  { id: 'arms-crossed', category: 'standing', label: 'Arms crossed', note: 'Forearms build a hard edge across the chest — fill it or lose it.', pose: p({ leftArm: -0.5, rightArm: 1.1, leftArmForward: 4.2, rightArmForward: 13, leftArmTwist: 63.5, rightArmTwist: -57.6, leftElbow: 110.7, rightElbow: -96.5, leftForearmTwist: -55, rightForearmTwist: 55, leftWrist: 18, rightWrist: -18, leftHand: 'grip', rightHand: 'grip', chestLift: 27 }) },
  { id: 'hands-pockets', category: 'standing', label: 'Hands in pockets', note: 'Relaxed shoulders, arms tight to the body. Clean silhouette.', pose: p({ leftArm: -1, rightArm: 1.6, leftElbow: 37, rightElbow: -35.7, leftArmForward: -3.7, rightArmForward: -3.2, leftArmTwist: 13.8, rightArmTwist: -16.5, leftForearmTwist: -10, rightForearmTwist: 10, leftWrist: 5, rightWrist: 5, leftHand: 'pocket', rightHand: 'pocket', leftShoulder: -5, rightShoulder: -5, weightShift: 0.26, hipShift: 0.035, chestLift: 21 }) },
  { id: 'lean-back', category: 'standing', label: 'Leaning back', note: 'Chest opens to a high key; the jaw clears the neck shadow.', pose: p({ spineBend: -8, chestLift: 46, headTilt: -5, neckExtend: 5, leftArm: -15, rightArm: 15, leftArmForward: -2, rightArmForward: -2, leftElbow: 16, rightElbow: -16, weightShift: -0.32, stanceWidth: 0.32 }) },
  { id: 'walking', category: 'standing', label: 'Walking', note: 'Stride splits the legs — good for a full-length strip light.', pose: p({ headYaw: 3, headTilt: -2, torsoYaw: -4, spineSide: -2, chestLift: 32, hipShift: -0.025, hipTilt: 3, hipYaw: 6, weightShift: -0.22, stanceWidth: 0.18, leftLeg: 24, rightLeg: -13, leftLegSplay: -2, rightLegSplay: 2, leftKnee: 9, rightKnee: 32, leftAnkle: -8, rightAnkle: 22, leftFootTurn: 4, rightFootTurn: 7, leftShoulder: -2, rightShoulder: 1, leftArm: -7, rightArm: 7, leftArmForward: -12, rightArmForward: 14, leftArmTwist: -3, rightArmTwist: 3, leftElbow: 12, rightElbow: -15, leftHand: 'relaxed', rightHand: 'relaxed' }) },

  // --- Seated --------------------------------------------------------------
  { id: 'seated-upright', category: 'seated', label: 'Seated upright', note: 'Hips at chair height. Drop the key or you will light the scalp.', pose: p({ seated: true, leftLeg: 82, rightLeg: 82, leftKnee: 92, rightKnee: 92, leftAnkle: -4, rightAnkle: -4, stanceWidth: 0.32, chestLift: 34, leftArm: -8, rightArm: 8, leftArmForward: 18, rightArmForward: 18, leftElbow: 42, rightElbow: -42, leftForearmTwist: -22, rightForearmTwist: 22, leftWrist: 3, rightWrist: 3 }) },
  { id: 'seated-lean', category: 'seated', label: 'Seated, leaning in', note: 'Elbows on knees. The face moves a foot closer to the key.', pose: p({ seated: true, leftLeg: 82, rightLeg: 82, leftKnee: 92, rightKnee: 92, leftAnkle: -6, rightAnkle: -6, spineBend: 18, chestLift: 14, headTilt: -4, neckExtend: 6, leftArm: -16, rightArm: 16, leftArmForward: 36, rightArmForward: 36, leftElbow: 62, rightElbow: -62, leftForearmTwist: -18, rightForearmTwist: 18, stanceWidth: 0.38 }) },
  { id: 'seated-crossed', category: 'seated', label: 'Seated, legs crossed', note: 'Asymmetric lower half; keep the fill wide enough to cover it.', pose: p({ seated: true, leftLeg: 80, rightLeg: 72, leftKnee: 86, rightKnee: 94, leftLegSplay: -12, rightLegSplay: 10, leftAnkle: -3, rightAnkle: 5, stanceWidth: 0.16, torsoYaw: -9, headYaw: 8, headRoll: 2, chestLift: 31, leftArm: -9, rightArm: 11, leftArmForward: 15, rightArmForward: 12, leftElbow: 40, rightElbow: -46 }) },
  { id: 'seated-backward', category: 'seated', label: 'Straddling the chair', note: 'Arms over the backrest — a natural place for a hard rim.', pose: p({ seated: true, leftLeg: 82, rightLeg: 82, leftKnee: 88, rightKnee: 88, leftLegSplay: -18, rightLegSplay: 18, stanceWidth: 0.48, leftArm: -28, rightArm: 28, leftArmForward: 38, rightArmForward: 38, leftElbow: 56, rightElbow: -56, leftForearmTwist: -14, rightForearmTwist: 14, spineBend: 10, chestLift: 22 }) },

  // --- Dynamic -------------------------------------------------------------
  { id: 'jump', category: 'dynamic', label: 'Mid-air', note: 'Everything leaves the floor. Freeze it with a short flash duration.', pose: p({ airborne: true, rootLift: 0.24, leftLeg: 40, rightLeg: 15, leftKnee: 68, rightKnee: 31, leftArm: -61, rightArm: 66, leftArmForward: -14, rightArmForward: 18, leftElbow: 35, rightElbow: -27, leftWrist: -4, rightWrist: 5, spineBend: -6, spineSide: 2, torsoYaw: -5, headTilt: -7, headRoll: 2, leftAnkle: 20, rightAnkle: 26, leftHand: 'open', rightHand: 'open' }) },
  { id: 'reach', category: 'dynamic', label: 'Reaching up', note: 'Fully extended arm. Check the top of the softbox still covers it.', pose: p({ rightArm: 142, rightArmForward: 8, rightArmTwist: 6, rightElbow: -12, rightWrist: -3, rightHand: 'open', leftArm: -13, leftArmForward: 3, leftElbow: 16, spineSide: -7, torsoYaw: -4, headTilt: -10, headYaw: 5, chestLift: 48, weightShift: 0.26 }) },
  { id: 'twist', category: 'dynamic', label: 'Torso twist', note: 'Ribcage against the hips. The chest plane turns away from the key.', pose: p({ torsoYaw: 36, hipYaw: -10, headYaw: -22, spineSide: 4, leftArm: -25, rightArm: 19, leftArmForward: 28, rightArmForward: -19, leftElbow: 47, rightElbow: -34, leftForearmTwist: -10, rightForearmTwist: 8, weightShift: -0.3, chestLift: 26 }) },
  { id: 'crouch', category: 'dynamic', label: 'Crouching', note: 'Low centre of gravity — drop the key stand to match.', pose: p({ leftLeg: 78, rightLeg: 78, leftKnee: 104, rightKnee: 104, spineBend: 16, chestLift: 12, stanceWidth: 0.42, leftAnkle: -18, rightAnkle: -18, leftArm: -14, rightArm: 14, leftArmForward: 16, rightArmForward: 16, leftElbow: 48, rightElbow: -48, leftForearmTwist: -12, rightForearmTwist: 12, headTilt: -5 }) },

  // --- Beauty --------------------------------------------------------------
  { id: 'beauty-front', category: 'beauty', label: 'Beauty, straight on', note: 'Square, chin slightly forward. Built for a butterfly key.', pose: p({ neckExtend: 6, headTilt: -1, chestLift: 40, leftShoulder: -3, rightShoulder: -3, leftArm: -7, rightArm: 7, leftElbow: 7, rightElbow: -7, eyeOpen: 94, jawSet: 14, squint: 5 }) },
  { id: 'beauty-hands-face', category: 'beauty', label: 'Hands to face', note: 'Hands enter the light — expect a bounce onto the jaw.', pose: p({ leftArm: -37.8, rightArm: 16, leftArmForward: 67.4, rightArmForward: 8, leftArmTwist: 30.4, leftElbow: 141.6, rightElbow: -24, leftForearmTwist: -18, rightForearmTwist: 16, leftWrist: -10, rightWrist: 6, leftHand: 'open', rightHand: 'relaxed', headTilt: -4, headRoll: 6, neckExtend: 5, smile: 14 }) },
  { id: 'over-shoulder', category: 'beauty', label: 'Over the shoulder', note: 'Body away, face back. The shoulder becomes the shadow edge.', pose: p({ torsoYaw: 95, hipYaw: 100, headYaw: -58, headTilt: -3, headRoll: -4, leftArm: -8, rightArm: 8, leftArmForward: 2, rightArmForward: -2, leftElbow: 12, rightElbow: -12, weightShift: 0.32, hipShift: -0.04, squint: 5, smile: 10, chestLift: 25 }) },
  { id: 'editorial', category: 'beauty', label: 'Editorial', note: 'Angular and asymmetric. Hard light reads as intent here, not error.', pose: p({ headYaw: -21, headTilt: 6, headRoll: -7, torsoYaw: 14, spineSide: -5, leftArm: -52, leftArmForward: 22, leftElbow: 58, leftForearmTwist: -12, leftWrist: -5, leftHand: 'open', rightArm: 18, rightArmForward: -4, rightElbow: -27, hipShift: -0.05, hipTilt: 5, weightShift: -0.42, rightKnee: 13, browRaise: -5, eyeOpen: 90, jawSet: 14 }) },
  { id: 'chin-down', category: 'beauty', label: 'Chin down, eyes up', note: 'Lifts the eyes into the catchlight without lifting the jaw.', pose: p({ headTilt: 10, gazePitch: -10, browRaise: 9, neckExtend: 4, eyeOpen: 98, chestLift: 38, jawSet: 10 }) },
  { id: 'laughing', category: 'beauty', label: 'Laughing', note: 'A real laugh closes the eyes — keep a catchlight in the lower lid.', pose: p({ smile: 78, squint: 48, mouthOpen: 34, lipPart: 48, headTilt: -9, headRoll: 7, browRaise: 14, eyeOpen: 60, leftArm: -13, rightArm: 17, leftArmForward: 4, rightArmForward: 7, leftElbow: 27, rightElbow: -35, chestLift: 36 }) },

  // --- Commercial ----------------------------------------------------------
  { id: 'presenting', category: 'commercial', label: 'Presenting', note: 'Open palm out to the side. Product goes on the palm.', pose: p({ rightArm: 74, rightArmForward: 10, rightArmTwist: 0, rightElbow: -20, rightForearmTwist: 55, rightWrist: -8, rightHand: 'open', leftArm: -10, leftArmForward: 2, leftElbow: 14, smile: 34, chestLift: 38, torsoYaw: -9, headYaw: 5 }) },
  { id: 'holding', category: 'commercial', label: 'Holding a product', note: 'Both hands in front — a specular product wants a large soft key.', pose: p({ leftArm: 8, rightArm: -8, leftArmForward: 4, rightArmForward: 4, leftArmTwist: 7, rightArmTwist: -7, leftElbow: 101, rightElbow: -100, leftForearmTwist: -22, rightForearmTwist: 22, leftWrist: -3, rightWrist: 3, leftHand: 'grip', rightHand: 'grip', headTilt: 6, gazePitch: 10, chestLift: 30 }) },
  { id: 'thinking', category: 'commercial', label: 'Hand to chin', note: 'The forearm cuts across the neck. Fill from below or lose the jaw.', pose: p({ rightArm: -4.2, rightArmForward: 79.6, rightArmTwist: -33.3, rightElbow: -140.6, rightForearmTwist: 32, rightWrist: 8, rightHand: 'fist', leftArm: -4.8, leftArmForward: 7.1, leftArmTwist: 63.2, leftElbow: 109.2, leftForearmTwist: -12, leftHand: 'grip', headTilt: -3, headYaw: -10, browRaise: -7, chestLift: 27 }) },
  { id: 'greeting', category: 'commercial', label: 'Waving', note: 'Raised open hand — the brightest thing in frame unless flagged.', pose: p({ rightArm: 132, rightArmForward: 4, rightArmTwist: 0, rightElbow: -46, rightForearmTwist: 10, rightHand: 'open', rightWrist: -6, leftArm: -10, leftArmForward: 2, leftElbow: 14, smile: 52, squint: 16, headRoll: -4, chestLift: 30 }) },
]

export const POSE_CATEGORIES: PoseCategory[] = ['standing', 'seated', 'dynamic', 'beauty', 'commercial']

export function getPoseEntry(id: string): PoseEntry | undefined {
  return POSE_LIBRARY.find((entry) => entry.id === id)
}

/** Poses that move the pelvis off the floor need the figure raised to a seat. */
export function seatHeightFor(pose: ModelPose): number {
  return pose.seated ? 0.45 : 0
}

export function isSeatedPose(pose: ModelPose): boolean {
  return pose.seated
}
