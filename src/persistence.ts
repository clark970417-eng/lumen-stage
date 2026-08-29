const DATABASE_NAME = 'lumen-stage'
const STORE_NAME = 'projects'
const LATEST_KEY = 'latest-scene'
const DATABASE_VERSION = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is unavailable'))
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open project storage'))
  })
}

export async function mirrorProject(json: string) {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put({ json, savedAt: Date.now() }, LATEST_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save project backup'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Project backup was interrupted'))
    })
  } finally {
    database.close()
  }
}

export async function readMirroredProject(): Promise<string | null> {
  try {
    const database = await openDatabase()
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(LATEST_KEY)
        request.onsuccess = () => resolve(typeof request.result?.json === 'string' ? request.result.json : null)
        request.onerror = () => reject(request.error ?? new Error('Could not read project backup'))
      })
    } finally {
      database.close()
    }
  } catch {
    return null
  }
}

export async function requestDurableStorage() {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted?.()) return true
    return navigator.storage.persist()
  } catch {
    return false
  }
}

export async function storageUsage() {
  try {
    const estimate = await navigator.storage?.estimate?.()
    return { usage: estimate?.usage ?? 0, quota: estimate?.quota ?? 0 }
  } catch {
    return { usage: 0, quota: 0 }
  }
}

export function formatStorage(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`
}

export function hasLocalProject(storage: Pick<Storage, 'length' | 'key'> = localStorage) {
  try {
    for (let index = 0; index < storage.length; index += 1) {
      if (storage.key(index)?.startsWith('lumen-stage-scene-v')) return true
    }
  } catch { return false }
  return false
}
