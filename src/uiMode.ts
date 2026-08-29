/**
 * Which shell to render.
 *
 * The full interface is built for a mouse, a keyboard and 1024 px of width —
 * three panels, a shortcut for everything. On a phone that is unusable, so the
 * same store drives a second, much smaller shell instead. The choice is
 * automatic but never final: `?ui=mobile` / `?ui=full` forces it for a link,
 * and the in-app switch remembers the preference like the language does.
 */

import { useSyncExternalStore } from 'react'
import { create } from 'zustand'

export type UiMode = 'auto' | 'mobile' | 'full'

const STORAGE_KEY = 'lumen-stage:ui'
const PHONE_QUERY = '(max-width: 900px)'

function isMode(value: unknown): value is UiMode {
  return value === 'auto' || value === 'mobile' || value === 'full'
}

/** Keep a forced shell choice durable without discarding other query params. */
export function searchForUiMode(search: string, mode: UiMode) {
  const params = new URLSearchParams(search)
  if (mode === 'auto') params.delete('ui')
  else params.set('ui', mode)
  const next = params.toString()
  return next ? `?${next}` : ''
}

function syncModeToLocation(mode: UiMode) {
  try {
    const nextSearch = searchForUiMode(window.location.search, mode)
    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`
    window.history.replaceState(window.history.state, '', nextUrl)
  } catch { /* no history API in a non-browser environment */ }
}

function detectMode(): UiMode {
  try {
    const forced = new URLSearchParams(window.location.search).get('ui')
    if (isMode(forced)) return forced
  } catch { /* no URL in a non-browser environment */ }
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isMode(stored)) return stored
  } catch { /* private mode can reject storage */ }
  return 'auto'
}

type UiModeStore = {
  mode: UiMode
  setMode: (mode: UiMode) => void
}

export const useUiModeStore = create<UiModeStore>((set) => ({
  mode: detectMode(),
  setMode: (mode) => {
    try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* private mode can reject storage */ }
    syncModeToLocation(mode)
    set({ mode })
  },
}))

function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** True on phone-sized viewports, live across rotation and window resizing. */
export function usePhoneScreen() {
  return useSyncExternalStore(subscribeToWidth, () => window.matchMedia(PHONE_QUERY).matches, () => false)
}

export function useMobileShell() {
  const mode = useUiModeStore((state) => state.mode)
  const phone = usePhoneScreen()
  return mode === 'mobile' || (mode === 'auto' && phone)
}
