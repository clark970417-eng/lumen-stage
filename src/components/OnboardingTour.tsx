import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useT, type MessageKey } from '../i18n'
import '../onboarding.css'

export type OnboardingScope = 'desktop' | 'mobile'

type TourStep = {
  target: string | string[]
  title: MessageKey
  body: MessageKey
  media: { kind: 'image'; src: string } | { kind: 'compare'; before: string; after: string }
  aspect: 'wide' | 'panel' | 'strip'
  placement: 'below' | 'left' | 'above' | 'right'
}

const STORAGE_PREFIX = 'lumen-stage:onboarding:v1:'

const STEPS: Record<OnboardingScope, TourStep[]> = {
  desktop: [
    { target: '.workflow-navigation', title: 'tour.desktop.1.title', body: 'tour.desktop.1.body', media: { kind: 'image', src: '/onboarding/desktop-workflow.webp' }, aspect: 'strip', placement: 'below' },
    { target: '.blueprint-panel', title: 'tour.desktop.2.title', body: 'tour.desktop.2.body', media: { kind: 'compare', before: '/onboarding/blueprint-before.webp', after: '/onboarding/blueprint-after.webp' }, aspect: 'panel', placement: 'right' },
    { target: '.scene-toolbar', title: 'tour.desktop.3.title', body: 'tour.desktop.3.body', media: { kind: 'image', src: '/onboarding/desktop-stage.webp' }, aspect: 'wide', placement: 'above' },
    { target: '.decision-console', title: 'tour.desktop.4.title', body: 'tour.desktop.4.body', media: { kind: 'image', src: '/onboarding/desktop-decision.webp' }, aspect: 'panel', placement: 'left' },
    { target: '.exposure-launcher', title: 'tour.desktop.5.title', body: 'tour.desktop.5.body', media: { kind: 'image', src: '/onboarding/exposure-after.webp' }, aspect: 'panel', placement: 'above' },
    { target: '.readout', title: 'tour.desktop.6.title', body: 'tour.desktop.6.body', media: { kind: 'image', src: '/onboarding/desktop-readout.webp' }, aspect: 'strip', placement: 'above' },
    { target: '.view-mode-dock', title: 'tour.desktop.7.title', body: 'tour.desktop.7.body', media: { kind: 'compare', before: '/onboarding/render-before.webp', after: '/onboarding/render-after.webp' }, aspect: 'wide', placement: 'below' },
    { target: ['.workflow-next-button', '.file-menu', '.project-actions'], title: 'tour.desktop.8.title', body: 'tour.desktop.8.body', media: { kind: 'image', src: '/onboarding/desktop-save.webp' }, aspect: 'panel', placement: 'below' },
  ],
  mobile: [
    { target: '#m-tab-intent', title: 'tour.mobile.1.title', body: 'tour.mobile.1.body', media: { kind: 'image', src: '/onboarding/mobile-setup.webp' }, aspect: 'wide', placement: 'above' },
    { target: '#m-tab-blocking', title: 'tour.mobile.2.title', body: 'tour.mobile.2.body', media: { kind: 'image', src: '/onboarding/mobile-subject.webp' }, aspect: 'wide', placement: 'above' },
    { target: '#m-tab-lighting', title: 'tour.mobile.3.title', body: 'tour.mobile.3.body', media: { kind: 'image', src: '/onboarding/mobile-light.webp' }, aspect: 'wide', placement: 'above' },
    { target: '#m-tab-framing', title: 'tour.mobile.4.title', body: 'tour.mobile.4.body', media: { kind: 'image', src: '/onboarding/mobile-camera.webp' }, aspect: 'wide', placement: 'above' },
    { target: '#m-tab-verify', title: 'tour.mobile.5.title', body: 'tour.mobile.5.body', media: { kind: 'image', src: '/onboarding/mobile-project.webp' }, aspect: 'wide', placement: 'above' },
  ],
}

const MOBILE_TABS = ['#m-tab-intent', '#m-tab-blocking', '#m-tab-lighting', '#m-tab-framing', '#m-tab-verify']

export function shouldShowOnboarding(scope: OnboardingScope) {
  try { return localStorage.getItem(`${STORAGE_PREFIX}${scope}`) !== 'done' } catch { return true }
}

function rememberOnboarding(scope: OnboardingScope) {
  try { localStorage.setItem(`${STORAGE_PREFIX}${scope}`, 'done') } catch { /* private mode */ }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function visibleArea(rect: DOMRect) {
  const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0))
  const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
  return width * height
}

function findTarget(target: TourStep['target']) {
  const selectors = Array.isArray(target) ? target : [target]
  const elements = selectors.map((selector) => document.querySelector<HTMLElement>(selector)).filter(Boolean) as HTMLElement[]
  return elements.find((element) => {
    const rect = element.getBoundingClientRect()
    return visibleArea(rect) >= Math.min(rect.width * rect.height * .35, 1200)
  }) ?? elements.sort((a, b) => visibleArea(b.getBoundingClientRect()) - visibleArea(a.getBoundingClientRect()))[0]
}

function overlapArea(a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
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
  const [cardSize, setCardSize] = useState({ width: 460, height: 460 })
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
    if (!open || scope !== 'mobile') return
    const tab = document.querySelector<HTMLButtonElement>(MOBILE_TABS[stepIndex])
    if (tab?.getAttribute('aria-selected') !== 'true') tab?.click()
    const update = () => {
      const current = document.querySelector<HTMLElement>(MOBILE_TABS[stepIndex])
      if (current) setTargetRect(current.getBoundingClientRect())
    }
    update()
    const delayed = window.setTimeout(update, 140)
    return () => window.clearTimeout(delayed)
  }, [open, scope, stepIndex])

  useEffect(() => {
    if (!open) return
    const update = () => {
      const target = findTarget(step.target)
      setTargetRect(target?.getBoundingClientRect() ?? null)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const frame = window.requestAnimationFrame(update)
    const delayed = window.setTimeout(update, 120)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(delayed)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, step])

  useLayoutEffect(() => {
    if (!open || !cardRef.current) return
    const update = () => {
      const rect = cardRef.current?.getBoundingClientRect()
      if (rect) setCardSize({ width: rect.width, height: rect.height })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(cardRef.current)
    return () => observer.disconnect()
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
    const margin = scope === 'mobile' ? 12 : 16
    const gap = 18
    const width = Math.min(cardSize.width, window.innerWidth - margin * 2)
    const height = Math.min(cardSize.height, window.innerHeight - margin * 2)
    const target = {
      left: Math.max(0, targetRect.left - 8),
      top: Math.max(0, targetRect.top - 8),
      right: Math.min(window.innerWidth, targetRect.right + 8),
      bottom: Math.min(window.innerHeight, targetRect.bottom + 8),
    }
    const centreTop = targetRect.top + targetRect.height / 2 - height / 2
    const centreLeft = targetRect.left + targetRect.width / 2 - width / 2
    const raw = {
      right: { left: targetRect.right + gap, top: centreTop },
      left: { left: targetRect.left - width - gap, top: centreTop },
      below: { left: centreLeft, top: targetRect.bottom + gap },
      above: { left: centreLeft, top: targetRect.top - height - gap },
    }
    const order = [step.placement, ...(['right', 'left', 'below', 'above'] as const).filter((item) => item !== step.placement)]
    const candidates = order.map((placement, preference) => {
      const left = clamp(raw[placement].left, margin, window.innerWidth - width - margin)
      const top = clamp(raw[placement].top, margin, window.innerHeight - height - margin)
      const card = { left, top, right: left + width, bottom: top + height }
      return { left, top, score: overlapArea(card, target) * 10000 + preference }
    })
    const best = candidates.sort((a, b) => a.score - b.score)[0]
    return { left: best.left, top: best.top }
  }, [cardSize, scope, step, targetRect])

  const highlightRect = useMemo(() => {
    if (!targetRect) return null
    const left = clamp(targetRect.left - 6, 0, window.innerWidth)
    const top = clamp(targetRect.top - 6, 0, window.innerHeight)
    const right = clamp(targetRect.right + 6, 0, window.innerWidth)
    const bottom = clamp(targetRect.bottom + 6, 0, window.innerHeight)
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
  }, [targetRect])

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
      {highlightRect && <div className="onboarding-highlight" aria-hidden="true" style={highlightRect} />}
      <article ref={cardRef} className="onboarding-card" role="dialog" aria-modal="false" aria-label={t('tour.aria')} style={cardStyle}>
        {media.kind === 'image'
          ? <div className={`onboarding-media onboarding-media--${step.aspect}`}><img src={media.src} alt={t(step.title)} /></div>
          : <div className={`onboarding-media onboarding-media--${step.aspect} onboarding-compare${showAfter ? ' is-after' : ''}`}>
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
