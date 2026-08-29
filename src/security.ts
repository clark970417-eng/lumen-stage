export const MAX_PROJECT_FILE_BYTES = 10 * 1024 * 1024
export const MAX_HDRI_FILE_BYTES = 64 * 1024 * 1024
export const MAX_IES_FILE_BYTES = 2 * 1024 * 1024

export async function readTextFileWithinLimit(file: File, maxBytes: number) {
  if (file.size > maxBytes) throw new Error('File exceeds the safety limit')
  const text = await file.text()
  if (new TextEncoder().encode(text).length > maxBytes) throw new Error('File exceeds the safety limit')
  return text
}
