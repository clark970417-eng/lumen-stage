import App from './App'
import { MobileApp } from './components/MobileApp'
import { useT } from './i18n'
import { useMobileShell, usePhoneScreen, useUiModeStore } from './uiMode'

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
  if (useMobileShell()) return <MobileApp />
  return (
    <>
      <App />
      <ReturnToPhoneShell />
    </>
  )
}
