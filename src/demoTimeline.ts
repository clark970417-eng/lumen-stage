/** The instant each chapter's cursor starts travelling toward its target control. */
export const DEMO_STEP_MOVEMENT_STARTS = [0, 2.5, 3.75, 5, 7.5, 10] as const

export function demoStepAt(time: number) {
  for (let step = DEMO_STEP_MOVEMENT_STARTS.length - 1; step >= 0; step -= 1) {
    if (time >= DEMO_STEP_MOVEMENT_STARTS[step]) return step
  }
  return 0
}
