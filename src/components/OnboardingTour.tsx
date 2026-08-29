import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useLocaleStore, useT, type MessageKey } from '../i18n'
import '../onboarding.css'

export type OnboardingScope = 'desktop' | 'mobile'

type TourStep = {
  target: string
  title: MessageKey
  body: MessageKey
  image: number
  placement: 'below' | 'left' | 'above'
}

const STORAGE_PREFIX = 'lumen-stage:onboarding:v1:'

const STEPS: Record<OnboardingScope, TourStep[]> = {
  desktop: [
    { target: '.setup-library-button', title: 'tour.desktop.1.title', body: 'tour.desktop.1.body', image: 2, placement: 'below' },
    { target: '.scene-toolbar', title: 'tour.desktop.2.title', body: 'tour.desktop.2.body', image: 4, placement: 'below' },
    { target: '.inspector', title: 'tour.desktop.3.title', body: 'tour.desktop.3.body', image: 5, placement: 'left' },
    { target: '.view-switch', title: 'tour.desktop.4.title', body: 'tour.desktop.4.body', image: 9, placement: 'below' },
  ],
  mobile: [
    { target: '.m-setup', title: 'tour.mobile.1.title', body: 'tour.mobile.1.body', image: 2, placement: 'above' },
    { target: '.m-tabs', title: 'tour.mobile.2.title', body: 'tour.mobile.2.body', image: 5, placement: 'above' },
    { target: '.m-views', title: 'tour.mobile.3.title', body: 'tour.mobile.3.body', image: 6, placement: 'below' },
    { target: '.m-shutter', title: 'tour.mobile.4.title', body: 'tour.mobile.4.body', image: 9, placement: 'above' },
  ],
}

export function shouldShowOnboarding(scope: OnboardingScope) {
  try { return localStorage.getItem(`${STORAGE_PREFIX}${scope}`) !== 'done' } catch { return true }
}

function rememberOnboarding(scope: OnboardingScope) {
  try { localStorage.setItem(`${STORAGE_PREFIX}${scope}`, 'done') } catch { /* private mode */ }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

export function OnboardingTour({ open, scope, onClose, onOpenGuide }: {
  open: boolean
  scope: OnboardingScope
  onClose: () => void
  onOpenGuide?: () => void
}) {
  const t = useT()
  const locale = useLocaleStore((state) => state.locale)
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLElement>(null)
  const steps = STEPS[scope]
  const step = steps[stepIndex]

  useEffect(() => {
    if (!open) return
    setStepIndex(0)
  }, [open, scope])

  useEffect(() => {
    if (!open) return
    const update = () => {
      const target = document.querySelector<HTMLElement>(step.target)
      setTargetRect(target?.getBoundingClientRect() ?? null)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const frame = window.requestAnimationFrame(update)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, step])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
      if (event.key === 'ArrowRight') setStepIndex((current) => Math.min(steps.length - 1, current + 1))
      if (event.key === 'ArrowLeft') setStepIndex((current) => Math.max(0, current - 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const cardStyle = useMemo<CSSProperties>(() => {
    if (!targetRect) return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
    const width = Math.min(340, window.innerWidth - 32)
    const estimatedHeight = 340
    if (step.placement === 'left') {
      return {
        left: clamp(targetRect.left - width - 16, 16, window.innerWidth - width - 16),
        top: clamp(targetRect.top + 12, 16, window.innerHeight - estimatedHeight - 16),
      }
    }
    if (step.placement === 'above') {
      return {
        left: clamp(targetRect.left, 16, window.innerWidth - width - 16),
        top: clamp(targetRect.top - estimatedHeight - 16, 16, window.innerHeight - estimatedHeight - 16),
      }
    }
    return {
      left: clamp(targetRect.left, 16, window.innerWidth - width - 16),
      top: clamp(targetRect.bottom + 14, 16, window.innerHeight - estimatedHeight - 16),
    }
  }, [step, targetRect])

  if (!open) return null

  const finish = () => {
    rememberOnboarding(scope)
    onClose()
  }
  const openGuide = () => {
    rememberOnboarding(scope)
    onClose()
    onOpenGuide?.()
  }
  const last = stepIndex === steps.length - 1
  const image = `/guide-pages/${locale}/page-${String(step.image).padStart(2, '0')}.jpg`

  return (
    <div className={`onboarding-tour onboarding-${scope}`} aria-live="polite">
      <div className="onboarding-shade" aria-hidden="true" />
      {targetRect && <div className="onboarding-highlight" aria-hidden="true" style={{
        left: targetRect.left - 6,
        top: targetRect.top - 6,
        width: targetRect.width + 12,
        height: targetRect.height + 12,
      }} />}
      <article ref={cardRef} className="onboarding-card" role="dialog" aria-modal="false" aria-label={t('tour.aria')} style={cardStyle}>
        <img src={image} alt="" aria-hidden="true" />
        <div className="onboarding-copy">
          <div className="onboarding-kicker"><span>{t('tour.step', { n: stepIndex + 1, total: steps.length })}</span><button onClick={finish}>{t('tour.skip')}</button></div>
          <h2>{t(step.title)}</h2>
          <p>{t(step.body)}</p>
        </div>
        <footer>
          <div className="onboarding-dots" aria-hidden="true">{steps.map((_, index) => <i key={index} className={index === stepIndex ? 'active' : ''} />)}</div>
          <div>
            {stepIndex > 0 && <button onClick={() => setStepIndex(stepIndex - 1)}>{t('tour.back')}</button>}
            {last && onOpenGuide && <button className="secondary" onClick={openGuide}>{t('tour.fullGuide')}</button>}
            <button className="primary" onClick={() => last ? finish() : setStepIndex(stepIndex + 1)}>{last ? t('tour.finish') : t('tour.next')}</button>
          </div>
        </footer>
      </article>
    </div>
  )
}
