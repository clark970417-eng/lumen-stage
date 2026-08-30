/**
 * Subject controls: pose library, joint rig, physique and wardrobe.
 *
 * Both the main subject and every standalone person use the same panels, so a
 * second person in the scene is never a second-class citizen with half the
 * controls — which is the usual failure mode when a tool grows a multi-subject
 * feature late.
 */

import { useEffect, useState } from 'react'
import { PHYSIQUE_PRESETS, type Physique } from '../physique'
import { HAND_POSES, POSE_CATEGORIES, POSE_LIBRARY, type HandPose, type ModelPose, type PoseCategory } from '../pose'
import { FABRICS, HAIR_STYLES, OUTFITS, type FabricKind, type HairStyle, type OutfitStyle } from '../wardrobe'
import { useCatalogT, useT, type MessageKey } from '../i18n'

type RangeProps = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  displayValue?: string
  onChange: (value: number) => void
}

function Range({ label, value, min, max, step = 1, unit = '', displayValue, onChange }: RangeProps) {
  const progress = ((value - min) / (max - min)) * 100
  return (
    <label className="control-row">
      <span>{label}</span><output>{displayValue ?? `${value}${unit}`}</output>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} style={{ '--progress': `${progress}%` } as React.CSSProperties} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

/** A joint group that stays folded until you need it. */
function JointGroup({ title, count, children, defaultOpen = false }: { title: string; count: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`joint-group ${open ? 'is-open' : ''}`}>
      <button className="joint-group-header" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{title}</span><small>{count}</small><i aria-hidden="true" />
      </button>
      {open && <div className="joint-group-body">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pose library
// ---------------------------------------------------------------------------

export function PoseLibraryPanel({ current, onApply }: { current: string; onApply: (id: string) => void }) {
  const t = useT()
  const ct = useCatalogT()
  const currentCategory = POSE_LIBRARY.find((entry) => entry.id === current)?.category ?? 'standing'
  const [category, setCategory] = useState<PoseCategory>(currentCategory)
  const entries = POSE_LIBRARY.filter((entry) => entry.category === category)
  const active = POSE_LIBRARY.find((entry) => entry.id === current)
  const note = active ? ct(`pose.note.${active.id}`, active.note) : t('pose.custom')
  useEffect(() => setCategory(currentCategory), [currentCategory])

  return (
    <div className="pose-library">
      <div className="pose-heading"><span>{t('pose.library')}</span><small>{t('pose.count', { count: POSE_LIBRARY.length })}</small></div>
      <div className="pose-category-tabs" role="tablist">
        {POSE_CATEGORIES.map((item) => (
          <button key={item} role="tab" aria-selected={category === item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>
            {t(`pose.category.${item}` as MessageKey)}
          </button>
        ))}
      </div>
      <div className="pose-grid" role="group" aria-label={t('pose.library')}>
        {entries.map((entry) => (
          <button key={entry.id} className={current === entry.id ? 'active' : ''} title={ct(`pose.note.${entry.id}`, entry.note)} onClick={() => onApply(entry.id)}>
            {ct(`pose.${entry.id}`, entry.label)}
          </button>
        ))}
      </div>
      <p className="pose-note" aria-live="polite">{note}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Joint rig
// ---------------------------------------------------------------------------

/** Mirrors a pose left-to-right. The fastest way to flip a lighting setup. */
export function mirrorPose(pose: ModelPose): Partial<ModelPose> {
  const swap = <T,>(a: T, b: T) => [b, a] as const
  const [leftArm, rightArm] = swap(pose.leftArm, pose.rightArm)
  const [leftElbow, rightElbow] = swap(pose.leftElbow, pose.rightElbow)
  const [leftShoulder, rightShoulder] = swap(pose.leftShoulder, pose.rightShoulder)
  const [leftArmForward, rightArmForward] = swap(pose.leftArmForward, pose.rightArmForward)
  const [leftArmTwist, rightArmTwist] = swap(pose.leftArmTwist, pose.rightArmTwist)
  const [leftForearmTwist, rightForearmTwist] = swap(pose.leftForearmTwist, pose.rightForearmTwist)
  const [leftWrist, rightWrist] = swap(pose.leftWrist, pose.rightWrist)
  const [leftHand, rightHand] = swap(pose.leftHand, pose.rightHand)
  const [leftLeg, rightLeg] = swap(pose.leftLeg, pose.rightLeg)
  const [leftKnee, rightKnee] = swap(pose.leftKnee, pose.rightKnee)
  const [leftAnkle, rightAnkle] = swap(pose.leftAnkle, pose.rightAnkle)
  const [leftLegSplay, rightLegSplay] = swap(pose.leftLegSplay, pose.rightLegSplay)
  const [leftFootTurn, rightFootTurn] = swap(pose.leftFootTurn, pose.rightFootTurn)
  return {
    headYaw: -pose.headYaw, headRoll: -pose.headRoll, torsoYaw: -pose.torsoYaw,
    spineSide: -pose.spineSide, hipShift: -pose.hipShift, hipTilt: -pose.hipTilt,
    hipYaw: -pose.hipYaw, weightShift: -pose.weightShift, gazeYaw: -pose.gazeYaw,
    // Sides mirror by swapping and negating the signed-by-screen-direction axes.
    leftArm: -rightArm, rightArm: -leftArm,
    leftElbow: -rightElbow, rightElbow: -leftElbow,
    leftShoulder: rightShoulder, rightShoulder: leftShoulder,
    leftArmForward, rightArmForward,
    leftArmTwist: -rightArmTwist, rightArmTwist: -leftArmTwist,
    leftForearmTwist: -rightForearmTwist, rightForearmTwist: -leftForearmTwist,
    leftWrist, rightWrist,
    leftHand, rightHand,
    leftLeg, rightLeg,
    leftKnee, rightKnee,
    leftAnkle, rightAnkle,
    leftLegSplay: -rightLegSplay, rightLegSplay: -leftLegSplay,
    leftFootTurn, rightFootTurn,
  }
}

export function PoseControls({ pose, onChange }: { pose: ModelPose; onChange: (patch: Partial<ModelPose>) => void }) {
  const t = useT()
  const ct = useCatalogT()
  const set = (key: keyof ModelPose) => (value: number) => onChange({ [key]: value } as Partial<ModelPose>)
  const weightLabel = pose.weightShift < -0.15 ? t('pose.weight.left') : pose.weightShift > 0.15 ? t('pose.weight.right') : t('pose.weight.even')

  const handPicker = (side: 'leftHand' | 'rightHand') => (
    <div className="subject-look-control">
      <span>{t(side === 'leftHand' ? 'pose.leftHand' : 'pose.rightHand')}</span>
      <div role="group" aria-label={t(side === 'leftHand' ? 'pose.leftHand' : 'pose.rightHand')}>
        {HAND_POSES.map((item: HandPose) => (
          <button key={item} className={pose[side] === item ? 'active' : ''} onClick={() => onChange({ [side]: item } as Partial<ModelPose>)}>
            {ct(`hand.${item}`, item)}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="joint-rig">
      <div className="joint-rig-actions">
        <button onClick={() => onChange(mirrorPose(pose))}>{t('pose.mirror')}</button>
      </div>

      <JointGroup title={t('pose.group.head')} count={4} defaultOpen>
        <Range label={t('pose.headYaw')} value={pose.headYaw} min={-75} max={75} unit="°" onChange={set('headYaw')} />
        <Range label={t('pose.headTilt')} value={pose.headTilt} min={-32} max={32} unit="°" onChange={set('headTilt')} />
        <Range label={t('pose.headRoll')} value={pose.headRoll} min={-28} max={28} unit="°" onChange={set('headRoll')} />
        <Range label={t('pose.neckExtend')} value={pose.neckExtend} min={-10} max={25} unit="°" onChange={set('neckExtend')} />
      </JointGroup>

      <JointGroup title={t('pose.group.spine')} count={7}>
        <Range label={t('pose.torsoYaw')} value={pose.torsoYaw} min={-130} max={130} unit="°" onChange={set('torsoYaw')} />
        <Range label={t('pose.spineBend')} value={pose.spineBend} min={-25} max={40} unit="°" onChange={set('spineBend')} />
        <Range label={t('pose.spineSide')} value={pose.spineSide} min={-25} max={25} unit="°" onChange={set('spineSide')} />
        <Range label={t('pose.chestLift')} value={pose.chestLift} min={0} max={100} unit="%" onChange={set('chestLift')} />
        <Range label={t('pose.hipShift')} value={pose.hipShift} min={-0.16} max={0.16} step={0.005} displayValue={`${(pose.hipShift * 100).toFixed(0)} cm`} onChange={set('hipShift')} />
        <Range label={t('pose.hipTilt')} value={pose.hipTilt} min={-18} max={18} unit="°" onChange={set('hipTilt')} />
        <Range label={t('pose.hipYaw')} value={pose.hipYaw} min={-130} max={130} unit="°" onChange={set('hipYaw')} />
      </JointGroup>

      <JointGroup title={t('pose.group.arms')} count={12}>
        <Range label={t('pose.leftArm')} value={pose.leftArm} min={-175} max={60} unit="°" onChange={set('leftArm')} />
        <Range label={t('pose.leftArmForward')} value={pose.leftArmForward} min={-70} max={110} unit="°" onChange={set('leftArmForward')} />
        <Range label={t('pose.leftArmTwist')} value={pose.leftArmTwist} min={-80} max={80} unit="°" onChange={set('leftArmTwist')} />
        <Range label={t('pose.leftElbow')} value={pose.leftElbow} min={-10} max={145} unit="°" onChange={set('leftElbow')} />
        <Range label={t('pose.leftForearmTwist')} value={pose.leftForearmTwist} min={-90} max={90} unit="°" onChange={set('leftForearmTwist')} />
        <Range label={t('pose.leftWrist')} value={pose.leftWrist} min={-60} max={60} unit="°" onChange={set('leftWrist')} />
        <Range label={t('pose.rightArm')} value={pose.rightArm} min={-60} max={175} unit="°" onChange={set('rightArm')} />
        <Range label={t('pose.rightArmForward')} value={pose.rightArmForward} min={-70} max={110} unit="°" onChange={set('rightArmForward')} />
        <Range label={t('pose.rightArmTwist')} value={pose.rightArmTwist} min={-80} max={80} unit="°" onChange={set('rightArmTwist')} />
        <Range label={t('pose.rightElbow')} value={pose.rightElbow} min={-145} max={10} unit="°" onChange={set('rightElbow')} />
        <Range label={t('pose.rightForearmTwist')} value={pose.rightForearmTwist} min={-90} max={90} unit="°" onChange={set('rightForearmTwist')} />
        <Range label={t('pose.rightWrist')} value={pose.rightWrist} min={-60} max={60} unit="°" onChange={set('rightWrist')} />
        <Range label={t('pose.leftShoulder')} value={pose.leftShoulder} min={-25} max={45} unit="°" onChange={set('leftShoulder')} />
        <Range label={t('pose.rightShoulder')} value={pose.rightShoulder} min={-25} max={45} unit="°" onChange={set('rightShoulder')} />
      </JointGroup>

      <JointGroup title={t('pose.group.hands')} count={2}>
        {handPicker('leftHand')}
        {handPicker('rightHand')}
      </JointGroup>

      <JointGroup title={t('pose.group.legs')} count={12}>
        <Range label={t('pose.stanceWidth')} value={pose.stanceWidth} min={0.08} max={0.9} step={0.01} displayValue={`${(pose.stanceWidth * 100).toFixed(0)} cm`} onChange={set('stanceWidth')} />
        <Range label={t('pose.weightShift')} value={pose.weightShift} min={-1} max={1} step={0.05} displayValue={weightLabel} onChange={set('weightShift')} />
        <Range label={t('pose.leftLeg')} value={pose.leftLeg} min={-30} max={120} unit="°" onChange={set('leftLeg')} />
        <Range label={t('pose.leftKnee')} value={pose.leftKnee} min={0} max={135} unit="°" onChange={set('leftKnee')} />
        <Range label={t('pose.leftLegSplay')} value={pose.leftLegSplay} min={-45} max={45} unit="°" onChange={set('leftLegSplay')} />
        <Range label={t('pose.leftAnkle')} value={pose.leftAnkle} min={-35} max={45} unit="°" onChange={set('leftAnkle')} />
        <Range label={t('pose.leftFootTurn')} value={pose.leftFootTurn} min={-30} max={50} unit="°" onChange={set('leftFootTurn')} />
        <Range label={t('pose.rightLeg')} value={pose.rightLeg} min={-30} max={120} unit="°" onChange={set('rightLeg')} />
        <Range label={t('pose.rightKnee')} value={pose.rightKnee} min={0} max={135} unit="°" onChange={set('rightKnee')} />
        <Range label={t('pose.rightLegSplay')} value={pose.rightLegSplay} min={-45} max={45} unit="°" onChange={set('rightLegSplay')} />
        <Range label={t('pose.rightAnkle')} value={pose.rightAnkle} min={-35} max={45} unit="°" onChange={set('rightAnkle')} />
        <Range label={t('pose.rightFootTurn')} value={pose.rightFootTurn} min={-30} max={50} unit="°" onChange={set('rightFootTurn')} />
      </JointGroup>

      <JointGroup title={t('pose.group.face')} count={9}>
        <Range label={t('pose.browRaise')} value={pose.browRaise} min={-100} max={100} unit="%" onChange={set('browRaise')} />
        <Range label={t('pose.eyeOpen')} value={pose.eyeOpen} min={0} max={100} unit="%" onChange={set('eyeOpen')} />
        <Range label={t('pose.squint')} value={pose.squint} min={0} max={100} unit="%" onChange={set('squint')} />
        <Range label={t('pose.smile')} value={pose.smile} min={-40} max={100} unit="%" onChange={set('smile')} />
        <Range label={t('pose.lipPart')} value={pose.lipPart} min={0} max={100} unit="%" onChange={set('lipPart')} />
        <Range label={t('pose.mouthOpen')} value={pose.mouthOpen} min={0} max={100} unit="%" onChange={set('mouthOpen')} />
        <Range label={t('pose.jawSet')} value={pose.jawSet} min={-30} max={40} unit="%" onChange={set('jawSet')} />
        <Range label={t('pose.gazeYaw')} value={pose.gazeYaw} min={-35} max={35} unit="°" onChange={set('gazeYaw')} />
        <Range label={t('pose.gazePitch')} value={pose.gazePitch} min={-30} max={30} unit="°" onChange={set('gazePitch')} />
      </JointGroup>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Physique
// ---------------------------------------------------------------------------

export function PhysiquePanel({ physique, onChange, onPreset }: { physique: Physique; onChange: (patch: Partial<Physique>) => void; onPreset: (id: string) => void }) {
  const t = useT()
  const ct = useCatalogT()
  return (
    <div className="subject-material-block">
      <div className="subject-material-heading"><span>{t('physique.title')}</span><small>{t('physique.sub')}</small></div>
      <div className="subject-look-control">
        <span>{t('physique.sex')}</span>
        <div role="group" aria-label={t('physique.sex')}>
          {([['feminine', 'physique.feminine'], ['masculine', 'physique.masculine'], ['neutral', 'physique.neutral']] as [Physique['sex'], MessageKey][]).map(([value, key]) => (
            <button key={value} className={physique.sex === value ? 'active' : ''} onClick={() => onChange({ sex: value })}>{t(key)}</button>
          ))}
        </div>
      </div>
      <Range label={t('physique.age')} value={physique.age ?? 28} min={18} max={80} unit={t('physique.years')} onChange={(value) => onChange({ age: value })} />
      <div className="pose-grid physique-presets" role="group" aria-label={t('physique.presets')}>
        {Object.keys(PHYSIQUE_PRESETS).map((id) => (
          <button key={id} onClick={() => onPreset(id)}>{ct(`physique.${id}`, id)}</button>
        ))}
      </div>
      <Range label={t('physique.face')} value={physique.face} min={0} max={100} onChange={(value) => onChange({ face: value })} />
      <Range label={t('physique.build')} value={physique.build} min={0} max={100} unit="%" onChange={(value) => onChange({ build: value })} />
      <Range label={t('physique.muscle')} value={physique.muscle} min={0} max={100} unit="%" onChange={(value) => onChange({ muscle: value })} />
      <Range label={t('physique.shoulders')} value={physique.shoulders} min={-50} max={50} onChange={(value) => onChange({ shoulders: value })} />
      <Range label={t('physique.waist')} value={physique.waist} min={-50} max={50} onChange={(value) => onChange({ waist: value })} />
      <Range label={t('physique.hips')} value={physique.hips} min={-50} max={50} onChange={(value) => onChange({ hips: value })} />
      <Range label={t('physique.bust')} value={physique.bust} min={-50} max={50} onChange={(value) => onChange({ bust: value })} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Wardrobe
// ---------------------------------------------------------------------------

export function WardrobePanel({ hairStyle, outfit, fabric, onChange }: {
  hairStyle: HairStyle
  outfit: OutfitStyle
  fabric: FabricKind
  onChange: (patch: { hairStyle?: HairStyle; outfit?: OutfitStyle; fabric?: FabricKind }) => void
}) {
  const t = useT()
  const ct = useCatalogT()
  const activeFabric = FABRICS.find((item) => item.id === fabric)
  return (
    <div className="subject-material-block">
      <div className="subject-material-heading"><span>{t('wardrobe.title')}</span><small>{t('wardrobe.sub')}</small></div>
      <div className="wardrobe-label">{t('wardrobe.hair')}</div>
      <div className="pose-grid" role="group" aria-label={t('wardrobe.hair')}>
        {HAIR_STYLES.map((item) => (
          <button key={item.id} title={item.note} className={hairStyle === item.id ? 'active' : ''} onClick={() => onChange({ hairStyle: item.id })}>{ct(`hair.${item.id}`, item.label)}</button>
        ))}
      </div>
      <div className="wardrobe-label">{t('wardrobe.outfit')}</div>
      <div className="pose-grid" role="group" aria-label={t('wardrobe.outfit')}>
        {OUTFITS.map((item) => (
          <button key={item.id} title={item.note} className={outfit === item.id ? 'active' : ''} onClick={() => onChange({ outfit: item.id })}>{ct(`outfit.${item.id}`, item.label)}</button>
        ))}
      </div>
      <div className="wardrobe-label">{t('appearance.fabric')}</div>
      <div className="pose-grid" role="group" aria-label={t('appearance.fabric')}>
        {FABRICS.map((item) => (
          <button key={item.id} title={item.note} className={fabric === item.id ? 'active' : ''} onClick={() => onChange({ fabric: item.id })}>{ct(`fabric.${item.id}`, item.label)}</button>
        ))}
      </div>
      {activeFabric && <p className="pose-note">{activeFabric.note}</p>}
    </div>
  )
}
