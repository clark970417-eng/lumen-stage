export type TransformAxis = 'X' | 'Y' | 'Z'

/** Keep non-selected coordinates immutable during a single-axis gizmo drag. */
export function lockPositionToAxis(
  source: [number, number, number],
  requested: [number, number, number],
  axis?: TransformAxis,
): [number, number, number] {
  if (axis === 'X') return [requested[0], source[1], source[2]]
  if (axis === 'Y') return [source[0], requested[1], source[2]]
  if (axis === 'Z') return [source[0], source[1], requested[2]]
  return requested
}
