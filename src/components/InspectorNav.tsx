import { useCallback, useEffect, useState } from 'react'
import { useStudio } from '../store'

const STICKY_OFFSET = 43 + 34 // panel heading + this nav

const panelEl = () => document.querySelector('.inspector')
const sectionEls = () => Array.from(document.querySelectorAll<HTMLElement>('.inspector .inspector-section'))

/**
 * 檢視器面板有六個螢幕高，把裡面的區塊列成可點的地圖。
 * 標題直接從已渲染的 DOM 讀，Inspector 之後新增區塊也會自動出現；
 * 只記住順序不記住節點，避免 React 重繪後指到已被換掉的元素。
 */
export function InspectorNav() {
  const selected = useStudio((state) => state.selected)
  const [labels, setLabels] = useState<string[]>([])
  const [active, setActive] = useState(0)

  const scan = useCallback(() => {
    const found = sectionEls()
      .map((section) => section.querySelector('.section-title span')?.textContent?.trim() ?? '')
      .filter(Boolean)
    setLabels((current) =>
      current.length === found.length && current.every((label, index) => label === found[index]) ? current : found,
    )
  }, [])

  // 區塊會隨選取物件改變，重新掃描
  useEffect(() => {
    scan()
    const panel = panelEl()
    if (!panel) return
    let frame = 0
    const rescan = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(scan)
    }
    const observer = new MutationObserver(rescan)
    observer.observe(panel, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [scan, selected])

  // 跟著面板捲動更新目前所在區塊
  useEffect(() => {
    const panel = panelEl()
    if (!panel || labels.length < 2) return
    const onScroll = () => {
      const threshold = panel.getBoundingClientRect().top + STICKY_OFFSET + 8
      let index = 0
      sectionEls().forEach((section, i) => {
        if (section.getBoundingClientRect().top <= threshold) index = i
      })
      setActive(index)
    }
    onScroll()
    panel.addEventListener('scroll', onScroll, { passive: true })
    return () => panel.removeEventListener('scroll', onScroll)
  }, [labels])

  const jump = (index: number) => {
    const panel = panelEl()
    const section = sectionEls()[index]
    if (!panel || !section) return
    const top = section.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - STICKY_OFFSET
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    panel.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' })
    setActive(index)
  }

  if (labels.length < 2) return null

  return (
    <nav className="inspector-nav" aria-label="Inspector sections">
      {labels.map((label, index) => (
        <button
          key={`${label}-${index}`}
          className={index === active ? 'active' : ''}
          aria-current={index === active ? 'true' : undefined}
          onClick={() => jump(index)}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
