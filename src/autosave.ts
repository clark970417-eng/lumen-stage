type AutosaveOptions<T> = {
  delay: number
  initialSerialized: string
  serialize: (value: T) => string
  persist: (serialized: string) => void | Promise<void>
  onSaved: () => void
  onError: (error: unknown, serialized: string) => void
}

/** Debounces both serialization and storage so transient render updates are cheap. */
export function createAutosaveScheduler<T>(options: AutosaveOptions<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let latest: T | undefined
  let lastSerialized = options.initialSerialized

  const flush = async () => {
    timer = undefined
    if (latest === undefined) return
    const value = latest
    latest = undefined
    let serialized: string | undefined
    try {
      serialized = options.serialize(value)
      if (serialized === lastSerialized) return
      await options.persist(serialized)
      lastSerialized = serialized
      options.onSaved()
    } catch (error) {
      options.onError(error, serialized ?? lastSerialized)
    }
  }

  return {
    schedule(value: T) {
      latest = value
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => { void flush() }, options.delay)
    },
    markSaved(serialized: string) {
      lastSerialized = serialized
    },
    flush,
    cancel() {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      latest = undefined
    },
  }
}
