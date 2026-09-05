/**
 * The people the studio can photograph.
 *
 * These actors are photographed, not modelled: skin, clothing, hair and eyes
 * are painted into two texture maps, so nothing in the appearance controls can
 * recolour them and nothing in the physique controls can reshape them. Casting
 * is therefore the appearance control — to change the build in front of the
 * lens you change who is standing there, which is also how it works in a real
 * studio.
 *
 * Builds are measured, not guessed: `waist` is the width of the torso at the
 * navel over the height of the figure, read off each avatar's own reference
 * render. It is here so the list can be ordered by something real rather than
 * by an adjective.
 *
 * Microsoft Rocketbox, MIT licensed. `source` names the avatar it came from,
 * so the converter can be pointed at it again.
 */
import type { Physique } from './physique'

const assetBase = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
const assetHref = (path: string) => `${assetBase}${path.replace(/^\/+/, '')}`

/**
 * How short and how tall a subject may be.
 *
 * The floor used to be 1.45 m, which was an adult's floor. The cast has
 * children in it, authored at 1.43, and a project saved with one came back
 * with the child clamped up to adult height without saying so.
 */
export const MIN_SUBJECT_HEIGHT = 1.15
export const MAX_SUBJECT_HEIGHT = 2.2

export type ActorSex = 'feminine' | 'masculine'

export type CastMember = {
  id: string
  /** Avatar this was converted from, in the Rocketbox library. */
  source: string
  label: string
  /** What this actor is useful for, in lighting terms. */
  note: string
  sex: ActorSex
  /**
   * Torso width at the navel over standing height. Bigger is broader.
   *
   * On an actor marked `robed` this measures the garment rather than the body:
   * an abaya is the widest silhouette in the cast and the person inside it is
   * not. Kept because the number is what orders the list, flagged because it
   * would otherwise read as a claim about a build.
   */
  waist: number
  /** True when `waist` is the width of the clothing, not of the person. */
  robed?: true
  /** The height the avatar was authored at, in metres. */
  height: number
  child?: true
  url: string
  thumb: string
}

const member = (
  id: string, source: string, label: string, note: string,
  sex: ActorSex, waist: number, height: number,
  extra?: { child?: true; robed?: true },
): CastMember => ({
  id, source, label, note, sex, waist, height, ...extra,
  url: assetHref(`models/lumen-human/rocketbox-${id}.glb`),
  thumb: assetHref(`models/lumen-human/cast/${id}.jpg`),
})

export const CAST: CastMember[] = [
  member('female', 'Female_Adult_01', 'Everyday', 'The reference build. Shirt and jeans, nothing the light has to work around.', 'feminine', 0.183, 1.74),
  member('female-adult-07', 'Female_Adult_07', 'Everyday, fuller', 'A broader torso and a jacket — the widest female silhouette that is not a robe.', 'feminine', 0.194, 1.72),
  member('female-adult-08', 'Female_Adult_08', 'Everyday, slim', 'Narrow through the waist. Short lighting has very little to fall off.', 'feminine', 0.173, 1.73),
  member('sports-female-01', 'Sports_Female_01', 'Swimwear, athletic', 'Almost no clothing, so the light is doing all of the describing. The one to practise body lighting on.', 'feminine', 0.173, 1.73),
  member('medical-female-01', 'Medical_Female_01', 'Scrubs', 'White cotton from collar to shoe. The brightest thing in the room, and the first thing to clip.', 'feminine', 0.200, 1.74),
  member('female-adult-10', 'Female_Adult_10', 'Abaya', 'One dark shape from shoulder to floor. Only the face returns the key, so the exposure is decided by a hand-sized area.', 'feminine', 0.505, 1.74, { robed: true }),
  member('business-female', 'Business_Female_01', 'Business', 'A dark suit that swallows the key — expect to bring the fill up to keep the shoulders.', 'feminine', 0.196, 1.74),
  member('female-child-01', 'Female_Child_01', 'Child', 'A child stands a head shorter than the light stand expects. Drop the key.', 'feminine', 0.165, 1.43, { child: true }),
  member('male', 'Male_Adult_02', 'Everyday', 'The reference build. A mid-tone knit, which is the easiest thing in the room to expose for.', 'masculine', 0.193, 1.82),
  member('male-adult-04', 'Male_Adult_04', 'Hoodie, heavy-set', 'Shoulders narrower than the waist, in a hood that eats the eye sockets. Fill from low.', 'masculine', 0.205, 1.87),
  member('male-adult-05', 'Male_Adult_05', 'Work jacket, older', 'The broadest build in the cast, and an older face — texture the key will find if it is hard.', 'masculine', 0.222, 1.81),
  member('sports-male-01', 'Sports_Male_01', 'Trunks, athletic', 'Bare torso, wide shoulders to a narrow waist. Rim lighting has an edge to sit on.', 'masculine', 0.166, 1.80),
  member('male-adult-15', 'Male_Adult_15', 'Thobe', 'Plain white to the floor, no seams to break it. A wall of highlight — feather the key or lose every fold.', 'masculine', 0.217, 1.82, { robed: true }),
  member('male-adult-19', 'Male_Adult_19', 'Thobe and keffiyeh', 'The headdress lays a hard edge across the brow and drops a shadow into the eyes. Fill from low or lose them.', 'masculine', 0.215, 1.81, { robed: true }),
  member('male-adult-21', 'Male_Adult_21', 'Thobe, patterned keffiyeh', 'A second headdress, a different weave and a different face under it. The pattern is fine enough to alias — worth a look at full resolution before you shoot it.', 'masculine', 0.213, 1.82, { robed: true }),
  member('business-male', 'Business_Male_01', 'Business', 'Black suit, white shirt — the widest brightness range in the cast, in one frame.', 'masculine', 0.184, 1.81),
  member('male-child-02', 'Male_Child_02', 'Child', 'Darker skin at a child height. Watch the key clearing the top of his head.', 'masculine', 0.185, 1.43, { child: true }),
]

const BY_ID = new Map(CAST.map((entry) => [entry.id, entry]))
const BY_URL = new Map(CAST.map((entry) => [entry.url, entry]))

export function castMember(id: string | null | undefined): CastMember | undefined {
  return id ? BY_ID.get(id) : undefined
}

export function castMemberForUrl(url: string | null | undefined): CastMember | undefined {
  return url ? BY_URL.get(url) : undefined
}

/**
 * Who to photograph when a project has not said.
 *
 * Older projects picked their actor from the sex and wardrobe controls, and
 * still do: this keeps them opening on the person they were saved with.
 */
export function defaultCastFor(physique: Physique, tailored: boolean): CastMember {
  const feminine = physique.sex !== 'masculine'
  const id = tailored
    ? (feminine ? 'business-female' : 'business-male')
    : (feminine ? 'female' : 'male')
  return BY_ID.get(id)!
}
