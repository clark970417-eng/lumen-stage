import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useT, type MessageKey } from '../i18n'
import '../onboarding.css'

export type OnboardingScope = 'desktop' | 'mobile'

type TourStep = {
  target: string
  title: MessageKey
  body: MessageKey
  media: { kind: 'image'; src: string } | { kind: 'compare'; before: string; after: string }
  placement: 'below' | 'left' | 'above' | 'right'
}

const STORAGE_PREFIX = 'lumen-stage:onboarding:v1:'

const STEPS: Record<OnboardingScope, TourStep[]> = {
  desktop: [
    { target: '.view-switch', title: 'tour.desktop.1.title', body: 'tour.desktop.1.body', media: { kind: 'image', src: '/onboarding/desktop-views.webp' }, placement: 'below' },
    { target: '.library', title: 'tour.desktop.2.title', body: 'tour.desktop.2.body', media: { kind: 'compare', before: '/onboarding/library-before.webp', after: '/onboarding/library-after.webp' }, placement: 'right' },
    { target: '.scene-toolbar', title: 'tour.desktop.3.title', body: 'tour.desktop.3.body', media: { kind: 'image', src: '/onboarding/desktop-scene.webp' }, placement: 'below' },
    { target: '.inspector', title: 'tour.desktop.4.title', body: 'tour.desktop.4.body', media: { kind: 'image', src: '/onboarding/desktop-inspector.webp' }, placement: 'left' },
    { target: '.exposure-launcher', title: 'tour.desktop.5.title', body: 'tour.desktop.5.body', media: { kind: 'compare', before: '/onboarding/exposure-before.webp', after: '/onboarding/exposure-after.webp' }, placement: 'above' },
    { target: '.readout', title: 'tour.desktop.6.title', body: 'tour.desktop.6.body', media: { kind: 'image', src: '/onboarding/desktop-readout.webp' }, placement: 'above' },
    { target: '.view-switch', title: 'tour.desktop.7.title', body: 'tour.desktop.7.body', media: { kind: 'compare', before: '/onboarding/render-before.webp', after: '/onboarding/render-after.webp' }, placement: 'below' },
    { target: '.project-actions', title: 'tour.desktop.8.title', body: 'tour.desktop.8.body', media: { kind: 'image', src: '/onboarding/desktop-save.webp' }, placement: 'below' },
  ],
  mobile: [
    { target: '.m-setup', title: 'tour.mobile.1.title', body: 'tour.mobile.1.body', media: { kind: 'image', src: '/onboarding/mobile-setup.webp' }, placement: 'above' },
    { target: '.m-tabs', title: 'tour.mobile.2.title', body: 'tour.mobile.2.body', media: { kind: 'image', src: '/onboarding/mobile-subject.webp' }, placement: 'above' },
    { target: '.m-tabs', title: 'tour.mobile.3.title', body: 'tour.mobile.3.body', media: { kind: 'image', src: '/onboarding/mobile-light.webp' }, placement: 'above' },
    { target: '.m-tabs', title: 'tour.mobile.4.title', body: 'tour.mobile.4.body', media: { kind: 'image', src: '/onboarding/mobile-camera.webp' }, placement: 'above' },
    { target: '.m-tabs', title: 'tour.mobile.5.title', body: 'tour.mobile.5.body', media: { kind: 'image', src: '/onboarding/mobile-project.webp' }, placement: 'above' },
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
  const [stepIndex, setStepIndex] = useState(0)
  const [showAfter, setShowAfter] = useState(false)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLElement>(null)
  const steps = STEPS[scope]
  const step = steps[stepIndex]

  useEffect(() => {
    if (!open) return
    setStepIndex(0)
  }, [open, scope])

  useEffect(() => {
    setShowAfter(false)
    if (!open || step.media.kind !== 'compare' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setShowAfter((current) => !current), 2200)
    return () => window.clearInterval(timer)
  }, [open, step])

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
    const width = Math.min(410, window.innerWidth - 32)
    const estimatedHeight = 430
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
    if (step.placement === 'right') {
      return {
        left: clamp(targetRect.right + 16, 16, window.innerWidth - width - 16),
        top: clamp(targetRect.top + 12, 16, window.innerHeight - estimatedHeight - 16),
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
  const media = step.media

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
        {media.kind === 'image'
          ? <div className="onboarding-media"><img src={media.src} alt={t(step.title)} /></div>
          : <div className={`onboarding-media onboarding-compare${showAfter ? ' is-after' : ''}`}>
              <img className="before" src={media.before} alt={t('tour.beforeAlt', { title: t(step.title) })} />
              <img className="after" src={media.after} alt={t('tour.afterAlt', { title: t(step.title) })} />
              <div className="onboarding-compare-switch" role="group" aria-label={t('tour.compare')}>
                <button className={!showAfter ? 'active' : ''} onClick={() => setShowAfter(false)}>{t('tour.before')}</button>
                <button className={showAfter ? 'active' : ''} onClick={() => setShowAfter(true)}>{t('tour.after')}</button>
              </div>
            </div>}
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
