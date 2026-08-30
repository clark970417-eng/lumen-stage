export type HistorySummaryLabels = {
  project: string
  subject: string
  lighting: string
  camera: string
  stage: string
  scene: string
}

type HistoryComparable = {
  projectName: string
  lights: unknown[]
  modifiers: unknown[]
  studioObjects: unknown[]
  modelPosition: unknown
  modelRotation: number
  modelHeight: number
  modelPose: unknown
  posePreset: string
  cameraPosition: unknown
  cameraTarget: unknown
  focalLength: number
  aperture: number
  iso: number
  shutter: number
  focusDistance: number
  backdropId: string
  roomWidth: number
  roomDepth: number
  roomHeight: number
}

const changed = (left: unknown, right: unknown) => JSON.stringify(left) !== JSON.stringify(right)

export function summarizeHistoryChange(previous: HistoryComparable, next: HistoryComparable, labels: HistorySummaryLabels) {
  if (previous.projectName !== next.projectName) return labels.project
  if (changed(previous.studioObjects, next.studioObjects) || changed(previous.modelPosition, next.modelPosition) || previous.modelRotation !== next.modelRotation || previous.modelHeight !== next.modelHeight || previous.posePreset !== next.posePreset || changed(previous.modelPose, next.modelPose)) return labels.subject
  if (changed(previous.lights, next.lights) || changed(previous.modifiers, next.modifiers)) return labels.lighting
  if (changed(previous.cameraPosition, next.cameraPosition) || changed(previous.cameraTarget, next.cameraTarget) || previous.focalLength !== next.focalLength || previous.aperture !== next.aperture || previous.iso !== next.iso || previous.shutter !== next.shutter || previous.focusDistance !== next.focusDistance) return labels.camera
  if (previous.backdropId !== next.backdropId || previous.roomWidth !== next.roomWidth || previous.roomDepth !== next.roomDepth || previous.roomHeight !== next.roomHeight) return labels.stage
  return labels.scene
}
