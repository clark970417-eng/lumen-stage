import { lazy, Suspense } from 'react'
import { useT } from './i18n'
import { useMobileShell, usePhoneScreen, useUiModeStore } from './uiMode'
import { BrandMark } from './components/BrandMark'

const App = lazy(() => import('./App'))
const MobileApp = lazy(() => import('./components/MobileApp').then((module) => ({ default: module.MobileApp })))

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

export default function Root() {
  if (useMobileShell()) return <Suspense fallback={<ShellLoading />}><MobileApp /></Suspense>
  return (
    <Suspense fallback={<ShellLoading />}>
      <App />
      <ReturnToPhoneShell />
    </Suspense>
  )
}
