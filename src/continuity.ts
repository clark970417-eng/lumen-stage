import type { StudioLight } from './store'

export type ContinuityScene = {
  focalLength: number
  aperture: number
  iso: number
  shutter: number
  cameraPosition: [number, number, number]
  modelPosition: [number, number, number]
  lights: StudioLight[]
}

export type ContinuityBaseline = {
  focalLength: number
  aperture: number
  iso: number
  shutter: number
  cameraDistance: number
  lights: Array<{ id: string; name: string; power: number; distance: number; tracked: boolean }>
}

export type ContinuityReport = {
  score: number
  issues: Array<{ level: 'notice' | 'warning'; label: string; detail: string }>
}

const distance = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

export function captureContinuityBaseline(scene: ContinuityScene): ContinuityBaseline {
  return {
    focalLength: scene.focalLength,
    aperture: scene.aperture,
    iso: scene.iso,
    shutter: scene.shutter,
    cameraDistance: distance(scene.cameraPosition, scene.modelPosition),
    lights: scene.lights.filter((light) => light.enabled).map((light) => ({
      id: light.id,
      name: light.name,
      power: light.powerPercent,
      distance: distance(light.position, scene.modelPosition),
      tracked: light.targetSubjectId === 'model',
    })),
  }
}

export function evaluateContinuity(baseline: ContinuityBaseline, scene: ContinuityScene): ContinuityReport {
  const issues: ContinuityReport['issues'] = []
  const cameraDistance = distance(scene.cameraPosition, scene.modelPosition)
  const cameraDelta = Math.abs(cameraDistance - baseline.cameraDistance)
  if (cameraDelta > 0.35) issues.push({ level: cameraDelta > 1 ? 'warning' : 'notice', label: 'Camera distance', detail: `${cameraDelta.toFixed(2)} m from baseline` })
  if (Math.abs(scene.focalLength - baseline.focalLength) >= 5) issues.push({ level: 'notice', label: 'Perspective', detail: `${scene.focalLength} mm vs ${baseline.focalLength} mm` })
  if (scene.aperture !== baseline.aperture || scene.iso !== baseline.iso || scene.shutter !== baseline.shutter) issues.push({ level: 'warning', label: 'Exposure triangle', detail: 'Aperture, ISO or shutter changed' })

  baseline.lights.forEach((saved) => {
    const light = scene.lights.find((candidate) => candidate.id === saved.id)
    if (!light || !light.enabled) {
      issues.push({ level: 'warning', label: saved.name, detail: 'Baseline light is off or missing' })
      return
    }
    const powerDelta = Math.abs(light.powerPercent - saved.power)
    const distanceDelta = Math.abs(distance(light.position, scene.modelPosition) - saved.distance)
    if (powerDelta >= 3) issues.push({ level: powerDelta >= 8 ? 'warning' : 'notice', label: saved.name, detail: `Power shifted ${powerDelta.toFixed(0)}%` })
    if (distanceDelta > 0.25) issues.push({ level: distanceDelta > 0.75 ? 'warning' : 'notice', label: saved.name, detail: `Distance shifted ${distanceDelta.toFixed(2)} m` })
    if (saved.tracked && light.targetSubjectId !== 'model') issues.push({ level: 'warning', label: saved.name, detail: 'Subject tracking was released' })
  })

  const penalty = issues.reduce((total, issue) => total + (issue.level === 'warning' ? 18 : 8), 0)
  return { score: Math.max(0, 100 - penalty), issues }
}
