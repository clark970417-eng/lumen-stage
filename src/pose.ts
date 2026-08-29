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
  headYaw: 0, headTilt: 0, headRoll: 0, neckExtend: 0,
  torsoYaw: 0, spineBend: 0, spineSide: 0, chestLift: 20,
  leftShoulder: 0, rightShoulder: 0,
  leftArm: -7, rightArm: 7,
  leftArmForward: 2, rightArmForward: 2,
  leftArmTwist: 0, rightArmTwist: 0,
  leftElbow: 4, rightElbow: -4,
  leftForearmTwist: 0, rightForearmTwist: 0,
  leftWrist: 0, rightWrist: 0,
  leftHand: 'relaxed', rightHand: 'relaxed',
  hipShift: 0, hipTilt: 0, hipYaw: 0, stanceWidth: 0.29, weightShift: 0,
  leftLeg: 0, rightLeg: 0, leftLegSplay: 0, rightLegSplay: 0,
  leftKnee: 3, rightKnee: 3, leftAnkle: 0, rightAnkle: 0,
  leftFootTurn: 7, rightFootTurn: 7,
  browRaise: 0, eyeOpen: 100, squint: 0, smile: 0, mouthOpen: 0, lipPart: 0, jawSet: 0,
  gazeYaw: 0, gazePitch: 0,
}

/** Fills in every joint an older saved scene never knew about. */
export function normalizePose(partial: Partial<ModelPose> | undefined | null): ModelPose {
  if (!partial) return { ...NEUTRAL_POSE }
  const pose = { ...NEUTRAL_POSE, ...partial }
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
  { id: 'contrapposto', category: 'standing', label: 'Contrapposto', note: 'Weight on one foot. The hip break gives the key light a waist to model.', pose: p({ hipShift: 0.075, hipTilt: -7, weightShift: 0.65, headYaw: 13, headTilt: -3, torsoYaw: -8, spineSide: 4, leftArm: -11, rightArm: 15, leftElbow: 12, rightElbow: -20, rightKnee: 14, leftKnee: 2, rightFootTurn: 16, stanceWidth: 0.24 }) },
  { id: 'hands-on-hips', category: 'standing', label: 'Hands on hips', note: 'Triangles at the elbows. Watch the arms shadowing the ribcage.', pose: p({ leftArm: -46, rightArm: 46, leftArmForward: -6, rightArmForward: -6, leftElbow: 88, rightElbow: -88, leftForearmTwist: -35, rightForearmTwist: 35, leftHand: 'grip', rightHand: 'grip', stanceWidth: 0.36, chestLift: 45 }) },
  { id: 'profile', category: 'standing', label: 'Profile', note: 'Full side-on. Short lighting becomes rim lighting here.', pose: p({ torsoYaw: 62, hipYaw: 48, headYaw: 16, leftArm: -5, rightArm: 9, leftElbow: 10, rightElbow: -14, hipShift: 0.02, leftFootTurn: 32, rightFootTurn: 38 }) },
  { id: 'three-quarter', category: 'standing', label: 'Three-quarter turn', note: 'The classic portrait angle. Sets up short and broad lighting.', pose: p({ torsoYaw: 34, hipYaw: 26, headYaw: -14, headTilt: -3, leftArm: -8, rightArm: 10, leftElbow: 14, rightElbow: -12, weightShift: 0.4, hipShift: 0.04, rightKnee: 10 }) },
  { id: 'arms-crossed', category: 'standing', label: 'Arms crossed', note: 'Forearms build a hard edge across the chest — fill it or lose it.', pose: p({ leftArm: -52, rightArm: 52, leftArmForward: 34, rightArmForward: 34, leftElbow: 105, rightElbow: -105, leftForearmTwist: -55, rightForearmTwist: 55, leftHand: 'relaxed', rightHand: 'relaxed', chestLift: 30 }) },
  { id: 'hands-pockets', category: 'standing', label: 'Hands in pockets', note: 'Relaxed shoulders, arms tight to the body. Clean silhouette.', pose: p({ leftArm: -13, rightArm: 13, leftElbow: 26, rightElbow: -26, leftArmForward: 8, rightArmForward: 8, leftHand: 'pocket', rightHand: 'pocket', leftShoulder: -6, rightShoulder: -6, weightShift: 0.3, hipShift: 0.04 }) },
  { id: 'lean-back', category: 'standing', label: 'Leaning back', note: 'Chest opens to a high key; the jaw clears the neck shadow.', pose: p({ spineBend: -12, chestLift: 60, headTilt: -8, neckExtend: 8, leftArm: -18, rightArm: 18, leftElbow: 20, rightElbow: -20, weightShift: -0.4, stanceWidth: 0.34 }) },
  { id: 'walking', category: 'standing', label: 'Walking', note: 'Stride splits the legs — good for a full-length strip light.', pose: p({ leftLeg: 22, rightLeg: -18, leftKnee: 12, rightKnee: 24, leftArm: -10, rightArm: 10, leftArmForward: -24, rightArmForward: 26, leftElbow: 30, rightElbow: -34, torsoYaw: -6, hipYaw: 8, stanceWidth: 0.2, leftAnkle: -12, rightAnkle: 16 }) },

  // --- Seated --------------------------------------------------------------
  { id: 'seated-upright', category: 'seated', label: 'Seated upright', note: 'Hips at chair height. Drop the key or you will light the scalp.', pose: p({ leftLeg: 88, rightLeg: 88, leftKnee: 86, rightKnee: 86, stanceWidth: 0.34, chestLift: 45, leftArm: -8, rightArm: 8, leftElbow: 52, rightElbow: -52, leftForearmTwist: -30, rightForearmTwist: 30 }) },
  { id: 'seated-lean', category: 'seated', label: 'Seated, leaning in', note: 'Elbows on knees. The face moves a foot closer to the key.', pose: p({ leftLeg: 84, rightLeg: 84, leftKnee: 88, rightKnee: 88, spineBend: 26, chestLift: 10, headTilt: -12, neckExtend: 10, leftArm: -22, rightArm: 22, leftArmForward: 22, rightArmForward: 22, leftElbow: 74, rightElbow: -74, stanceWidth: 0.4 }) },
  { id: 'seated-crossed', category: 'seated', label: 'Seated, legs crossed', note: 'Asymmetric lower half; keep the fill wide enough to cover it.', pose: p({ leftLeg: 82, rightLeg: 74, leftKnee: 84, rightKnee: 96, leftLegSplay: -18, rightLegSplay: 14, stanceWidth: 0.12, torsoYaw: -12, headYaw: 10, chestLift: 40, leftArm: -10, rightArm: 12, leftElbow: 48, rightElbow: -56 }) },
  { id: 'seated-backward', category: 'seated', label: 'Straddling the chair', note: 'Arms over the backrest — a natural place for a hard rim.', pose: p({ leftLeg: 86, rightLeg: 86, leftKnee: 82, rightKnee: 82, leftLegSplay: -22, rightLegSplay: 22, stanceWidth: 0.52, leftArm: -34, rightArm: 34, leftArmForward: 46, rightArmForward: 46, leftElbow: 62, rightElbow: -62, spineBend: 14 }) },

  // --- Dynamic -------------------------------------------------------------
  { id: 'jump', category: 'dynamic', label: 'Mid-air', note: 'Everything leaves the floor. Freeze it with a short flash duration.', pose: p({ leftLeg: 46, rightLeg: 18, leftKnee: 76, rightKnee: 34, leftArm: -68, rightArm: 74, leftArmForward: -18, rightArmForward: 22, leftElbow: 42, rightElbow: -30, spineBend: -8, headTilt: -10, leftAnkle: 24, rightAnkle: 30, leftHand: 'open', rightHand: 'open' }) },
  { id: 'reach', category: 'dynamic', label: 'Reaching up', note: 'Fully extended arm. Check the top of the softbox still covers it.', pose: p({ rightArm: 155, rightArmForward: 12, rightElbow: -8, rightHand: 'open', leftArm: -14, leftElbow: 18, spineSide: -10, headTilt: -16, chestLift: 60, weightShift: 0.3 }) },
  { id: 'twist', category: 'dynamic', label: 'Torso twist', note: 'Ribcage against the hips. The chest plane turns away from the key.', pose: p({ torsoYaw: 46, hipYaw: -14, headYaw: -30, spineSide: 6, leftArm: -30, rightArm: 22, leftArmForward: 34, rightArmForward: -26, leftElbow: 54, rightElbow: -40, weightShift: -0.35 }) },
  { id: 'crouch', category: 'dynamic', label: 'Crouching', note: 'Low centre of gravity — drop the key stand to match.', pose: p({ leftLeg: 96, rightLeg: 96, leftKnee: 112, rightKnee: 112, spineBend: 22, stanceWidth: 0.46, leftAnkle: -24, rightAnkle: -24, leftArm: -16, rightArm: 16, leftElbow: 58, rightElbow: -58, headTilt: -10 }) },

  // --- Beauty --------------------------------------------------------------
  { id: 'beauty-front', category: 'beauty', label: 'Beauty, straight on', note: 'Square, chin slightly forward. Built for a butterfly key.', pose: p({ neckExtend: 12, headTilt: -2, chestLift: 55, leftShoulder: -4, rightShoulder: -4, leftArm: -6, rightArm: 6, leftElbow: 8, rightElbow: -8, eyeOpen: 96, jawSet: 22, squint: 8 }) },
  { id: 'beauty-hands-face', category: 'beauty', label: 'Hands to face', note: 'Hands enter the light — expect a bounce onto the jaw.', pose: p({ leftArm: -58, rightArm: 30, leftArmForward: 66, rightArmForward: 30, leftElbow: 118, rightElbow: -96, leftWrist: -18, leftHand: 'open', rightHand: 'relaxed', headTilt: -6, headRoll: 7, neckExtend: 8, smile: 18 }) },
  { id: 'over-shoulder', category: 'beauty', label: 'Over the shoulder', note: 'Body away, face back. The shoulder becomes the shadow edge.', pose: p({ torsoYaw: 118, hipYaw: 124, headYaw: -74, headTilt: -4, headRoll: -6, leftArm: -8, rightArm: 8, leftElbow: 16, rightElbow: -16, weightShift: 0.4, hipShift: -0.05, squint: 6, smile: 12 }) },
  { id: 'editorial', category: 'beauty', label: 'Editorial', note: 'Angular and asymmetric. Hard light reads as intent here, not error.', pose: p({ headYaw: -26, headTilt: 8, headRoll: -9, torsoYaw: 16, spineSide: -7, leftArm: -70, leftArmForward: 28, leftElbow: 66, leftHand: 'open', rightArm: 22, rightElbow: -32, hipShift: -0.06, hipTilt: 6, weightShift: -0.5, rightKnee: 16, browRaise: -6, eyeOpen: 88, jawSet: 18 }) },
  { id: 'chin-down', category: 'beauty', label: 'Chin down, eyes up', note: 'Lifts the eyes into the catchlight without lifting the jaw.', pose: p({ headTilt: 13, gazePitch: -14, browRaise: 12, neckExtend: 6, eyeOpen: 100, chestLift: 50, jawSet: 14 }) },
  { id: 'laughing', category: 'beauty', label: 'Laughing', note: 'A real laugh closes the eyes — keep a catchlight in the lower lid.', pose: p({ smile: 88, squint: 62, mouthOpen: 42, lipPart: 60, headTilt: -12, headRoll: 9, browRaise: 18, eyeOpen: 52, leftArm: -14, rightArm: 20, leftElbow: 34, rightElbow: -44, chestLift: 45 }) },

  // --- Commercial ----------------------------------------------------------
  { id: 'presenting', category: 'commercial', label: 'Presenting', note: 'Open palm out to the side. Product goes on the palm.', pose: p({ rightArm: 62, rightArmForward: 34, rightElbow: -62, rightForearmTwist: 70, rightWrist: -14, rightHand: 'open', leftArm: -10, leftElbow: 16, smile: 42, chestLift: 50, torsoYaw: -12 }) },
  { id: 'holding', category: 'commercial', label: 'Holding a product', note: 'Both hands in front — a specular product wants a large soft key.', pose: p({ leftArm: -26, rightArm: 26, leftArmForward: 52, rightArmForward: 52, leftElbow: 86, rightElbow: -86, leftForearmTwist: -30, rightForearmTwist: 30, leftHand: 'grip', rightHand: 'grip', headTilt: 10, gazePitch: 16 }) },
  { id: 'thinking', category: 'commercial', label: 'Hand to chin', note: 'The forearm cuts across the neck. Fill from below or lose the jaw.', pose: p({ rightArm: 24, rightArmForward: 62, rightElbow: -122, rightForearmTwist: 40, rightWrist: 12, rightHand: 'relaxed', leftArm: -24, leftArmForward: 26, leftElbow: 72, leftHand: 'grip', headTilt: -4, headYaw: -12, browRaise: -10 }) },
  { id: 'greeting', category: 'commercial', label: 'Waving', note: 'Raised open hand — the brightest thing in frame unless flagged.', pose: p({ rightArm: 96, rightArmForward: 18, rightElbow: -54, rightHand: 'open', rightWrist: -10, leftArm: -10, leftElbow: 16, smile: 62, squint: 22, headRoll: -5 }) },
]

export const POSE_CATEGORIES: PoseCategory[] = ['standing', 'seated', 'dynamic', 'beauty', 'commercial']

export function getPoseEntry(id: string): PoseEntry | undefined {
  return POSE_LIBRARY.find((entry) => entry.id === id)
}

/** Poses that move the pelvis off the floor need the figure raised to a seat. */
export function seatHeightFor(pose: ModelPose): number {
  // Both hips folded past 60° means the figure is sitting, not standing.
  const folded = Math.min(pose.leftLeg, pose.rightLeg)
  if (folded < 60) return 0
  return 0.45
}
