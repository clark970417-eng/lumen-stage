export function createHistoryTransaction<T>() {
  let depth = 0
  let initial: T | null = null

  return {
    begin() {
      if (depth === 0) initial = null
      depth += 1
    },
    capture(createSnapshot: () => T): T | null {
      if (depth === 0) return createSnapshot()
      if (initial === null) initial = createSnapshot()
      return null
    },
    end(): T | null {
      if (depth === 0) return null
      depth -= 1
      if (depth > 0) return null
      const snapshot = initial
      initial = null
      return snapshot
    },
  }
}
