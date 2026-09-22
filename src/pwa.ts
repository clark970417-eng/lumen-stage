import { APP_BASE } from './routing'

export function registerPwa() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  window.addEventListener('load', () => {
    const workerUrl = `${APP_BASE}sw.js`
    navigator.serviceWorker.register(workerUrl, { scope: APP_BASE }).catch((error: unknown) => {
      console.warn('Lumen Stage service worker registration failed', error)
    })
  })
}
