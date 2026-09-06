import { NEUTRAL_POSE, type ModelPose } from './pose.ts'
import { DEFAULT_PHYSIQUE } from './physique.ts'
import { DEFAULT_FABRIC } from './wardrobe.ts'
import { FOOTPRINT, isSittable } from './layout.ts'
import type { StudioObject } from './store'

/**
 * The seating a pose implies, kept in step with the pose.
 *
 * A seated preset puts a chair under the subject. What made this worth its own
 * module is the other half: the chair used to outlive the pose. Choosing a
 * standing preset afterwards left the actor walking through a chair nobody had
 * asked for, and the only way out was to find it in the object list and delete
 * it by hand.
 *
 * So the chair belongs to the pose that produced it. `seatFor` names the
 * subject it was put under, and only chairs carrying that mark are turned or
 * taken away. A chair the photographer placed from the object library carries
 * no mark and is never touched -- it is also reused rather than duplicated,
 * which is why sitting down over an existing chair adds nothing.
 *
 * Returns the same array when nothing changes, so a pose that neither seats
 * nor unseats anyone does not push a new object list through the store.
 */
export function seatingForPose(
  objects: StudioObject[],
  pose: Pick<ModelPose, 'seated'>,
  subjectId: string,
  position: [number, number, number],
  rotation: number,
  preset: string,
): StudioObject[] {
  const ours = (object: StudioObject) => object.seatFor === subjectId

  if (!pose.seated) {
    const kept = objects.filter((object) => !ours(object))
    return kept.length === objects.length ? objects : kept
  }

  // Straddling turns the chair around so the backrest ends up in front of the
  // sitter, which is the whole shape of that pose.
  const facing = rotation + (preset === 'seated-backward' ? Math.PI : 0)
  const near = (object: StudioObject) =>
    isSittable(object.type) &&
    Math.hypot(object.position[0] - position[0], object.position[2] - position[2]) <=
      (FOOTPRINT[object.type as keyof typeof FOOTPRINT] ?? 0.4)

  // Our own seat follows the pose from one seated preset to the next. Sitting
  // down on the photographer's chair leaves their chair exactly as it is --
  // they may have angled it for the shot, and the pose does not own it.
  const mine = objects.find((object) => ours(object) && near(object))
  if (mine) {
    return mine.rotationY === facing
      ? objects
      : objects.map((object) => (object === mine ? { ...object, rotationY: facing } : object))
  }
  if (objects.some(near)) return objects

  return [
    ...objects.filter((object) => !ours(object)),
    {
      id: `chair-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: 'Chair',
      type: 'chair',
      seatFor: subjectId,
      position: [position[0], 0, position[2]],
      rotationY: facing,
      scale: 1,
      color: '#6f4938',
      material: 'matte',
      locked: false,
      subjectHeight: 1.74,
      subjectSkinColor: '#b9826b',
      subjectOutfitColor: '#343c48',
      subjectSkinRoughness: 55,
      subjectSkinOil: 22,
      subjectSubsurface: 45,
      subjectMakeup: 'natural',
      subjectEyeColor: '#4b372b',
      subjectHairColor: '#211815',
      subjectHairGloss: 35,
      subjectOutfitFabric: 'cotton',
      subjectPosePreset: 'neutral',
      subjectPose: { ...NEUTRAL_POSE },
      subjectPhysique: { ...DEFAULT_PHYSIQUE },
      subjectHairStyle: 'long',
      subjectOutfitStyle: 'tshirt',
      swatchFabric: DEFAULT_FABRIC,
    },
  ]
}
