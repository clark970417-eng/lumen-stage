import { lazy, Suspense, useEffect, useState } from 'react'
import { useT } from './i18n'
import { useMobileShell, usePhoneScreen, useUiModeStore } from './uiMode'
import { BrandMark } from './components/BrandMark'
import { routeFromLocation } from './routing'
import { ErrorBoundary } from './components/ErrorBoundary'
import { supportsWebGL } from './webgl'
import './ui-mode.css'

const loadApp = () => import('./App')
const loadMobileApp = () => import('./components/MobileApp').then((module) => ({ default: module.MobileApp }))
const App = lazy(loadApp)
const MobileApp = lazy(loadMobileApp)
const PublicSite = lazy(() => import('./components/PublicSite').then((module) => ({ default: module.PublicSite })))

function ShellLoading() {
  return (
    <div className="shell-loading" role="status" aria-label="Loading Lumen Stage">
      <BrandMark className="brand-symbol--loading" />
      <strong>LUMEN STAGE</strong>
    </div>
  )
}

/** Escape hatch: the full interface on a phone-sized screen keeps a way back. */
function ReturnToPhoneShell() {
  const t = useT()
  const phone = usePhoneScreen()
  const mode = useUiModeStore((state) => state.mode)
  const setMode = useUiModeStore((state) => state.setMode)
  if (!phone || mode !== 'full') return null
  return <button className="m-return" onClick={() => setMode('auto')} title={t('mobile.compact.title')}>{t('mobile.compact')}</button>
}

function WebGLFallback() {
  return <main className="fatal-screen"><BrandMark title="Lumen Stage" /><span>WEBGL REQUIRED</span><h1>This device cannot open the 3D studio.</h1><p>Update your browser, enable hardware acceleration, or open Lumen Stage on another device. Your browser data has not been changed.</p><div><button onClick={() => location.reload()}>Try again</button><a href="/support">Compatibility help</a></div></main>
}

function StudioShell() {
  const [ready, setReady] = useState(false)
  const mobile = useMobileShell()
  useEffect(() => {
    let active = true
    document.title = 'Studio — Lumen Stage'
    // Start downloading the selected interface while project data is restored.
    // React.lazy reuses the same module request, removing a serial network round trip.
    const shell = mobile ? loadMobileApp() : loadApp()
    Promise.all([import('./store'), import('./share'), import('./persistence'), shell]).then(async ([store, share, persistence]) => {
      const shared = await share.readSceneFromLocation()
      if (shared) store.useStudio.getState().importProject(shared)
      else if (persistence.hasLocalProject()) store.useStudio.getState().loadProject()
      else {
        // localStorage is written synchronously before the IndexedDB mirror.
        // Prefer it when both exist so a quick shell switch cannot restore an
        // older mirrored actor, camera or light state over the latest edit.
        const backup = await persistence.readMirroredProject()
        if (backup) store.useStudio.getState().importProject(backup)
      }
      void persistence.requestDurableStorage()
    }).finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])
  if (!supportsWebGL()) return <WebGLFallback />
  if (!ready) return <ShellLoading />
  if (mobile) return <Suspense fallback={<ShellLoading />}><MobileApp /></Suspense>
  return (
    <Suspense fallback={<ShellLoading />}>
      <App />
      <ReturnToPhoneShell />
    </Suspense>
  )
}

export default function Root() {
  const route = routeFromLocation(location.pathname, location.search, location.hash)
  return <ErrorBoundary>{route === 'studio' ? <StudioShell /> : <Suspense fallback={<ShellLoading />}><PublicSite route={route} /></Suspense>}</ErrorBoundary>
}
