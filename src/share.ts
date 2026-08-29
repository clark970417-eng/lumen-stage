/**
 * Scene sharing without a server.
 *
 * A shared setup library needs somewhere to put the scene. Rather than run a
 * backend, the whole scene is compressed into the URL — so a link is the
 * scene, it works offline, nothing is uploaded, and it keeps working whether or
 * not anyone is maintaining a service.
 *
 * The cost is length: a busy scene makes a long URL. Deflate takes the typical
 * scene from roughly 12 kB of JSON to under 2 kB of base64, which every browser
 * and chat client handles.
 */

const PREFIX = '#scene='

/** URL-safe base64 — the standard alphabet's + and / break in a query string. */
function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length }
  return output
}

/**
 * Compression is optional.
 *
 * `CompressionStream` is widely available but not universal, and a link that is
 * four times longer still works — so a browser without it falls back to raw
 * bytes rather than failing to share at all. The marker byte says which.
 */
const RAW = 0x00
const DEFLATE = 0x01

export async function encodeScene(json: string): Promise<string> {
  const bytes = new TextEncoder().encode(json)
  if (typeof CompressionStream === 'undefined') {
    return toBase64Url(new Uint8Array([RAW, ...bytes]))
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const compressed = await collect(stream)
  const payload = new Uint8Array(compressed.length + 1)
  payload[0] = DEFLATE
  payload.set(compressed, 1)
  return toBase64Url(payload)
}

export async function decodeScene(encoded: string): Promise<string> {
  const payload = fromBase64Url(encoded)
  const body = payload.subarray(1)
  if (payload[0] === RAW) return new TextDecoder().decode(body)
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read compressed scene links')
  const stream = new Blob([body as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new TextDecoder().decode(await collect(stream))
}

/** Builds the shareable URL for a scene, without touching the current one. */
export async function buildShareLink(json: string) {
  const encoded = await encodeScene(json)
  const base = `${window.location.origin}${window.location.pathname}`
  return `${base}${PREFIX}${encoded}`
}

/**
 * Reads a scene out of the address bar, if one is there.
 *
 * The hash is cleared afterwards so a reload does not silently discard whatever
 * the user has done since opening the link.
 */
export async function readSceneFromLocation(): Promise<string | null> {
  const hash = window.location.hash
  if (!hash.startsWith(PREFIX)) return null
  const encoded = hash.slice(PREFIX.length)
  try {
    const json = await decodeScene(encoded)
    history.replaceState(null, '', window.location.pathname + window.location.search)
    return json
  } catch {
    history.replaceState(null, '', window.location.pathname + window.location.search)
    return null
  }
}

/** Copies text, falling back to a hidden textarea where the clipboard API is blocked. */
export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(field)
    return copied
  }
}
