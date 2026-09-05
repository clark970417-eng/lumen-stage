import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'

// Keep the two recently used actors decoded. Concurrent additions share a
// request, while each caller clones its own geometry, materials and skeleton.
const sources = new Map<string, Promise<GLTF>>()
export function loadActorSource(url: string): Promise<GLTF> {
  const existing = sources.get(url)
  if (existing) {
    sources.delete(url)
    sources.set(url, existing)
    return existing
  }
  const request = new GLTFLoader().loadAsync(url).catch((error: unknown) => {
    if (sources.get(url) === request) sources.delete(url)
    throw error
  })
  sources.set(url, request)
  if (sources.size > 2) sources.delete(sources.keys().next().value!)
  return request
}
