/**
 * The lighting setup library panel.
 *
 * Each card carries the reasoning, not just the name — the point is to be able
 * to read why the key is where it is and then move it, rather than to collect
 * presets.
 */

import { useState } from 'react'
import { SETUP_CATEGORIES, SETUP_LIBRARY, type SetupCategory } from '../setups'
import { getBackdrop } from '../backdrops'
import { useCatalogT, useT, type MessageKey } from '../i18n'
import { useStudio } from '../store'

export function SetupLibrary() {
  const t = useT()
  const ct = useCatalogT()
  const setValue = useStudio((state) => state.setValue)
  const applyLightingSetup = useStudio((state) => state.applyLightingSetup)
  const [category, setCategory] = useState<SetupCategory>('portrait')
  const [applied, setApplied] = useState<string | null>(null)
  const entries = SETUP_LIBRARY.filter((setup) => setup.category === category)

  const apply = (id: string, label: string) => {
    applyLightingSetup(id)
    setApplied(label)
  }

  return (
    <aside className="setup-library" role="dialog" aria-label={t('setups.title')}>
      <header>
        <div>
          <strong>{t('setups.title')}</strong>
          <small>{t('setups.count', { count: SETUP_LIBRARY.length })}</small>
        </div>
        <button aria-label={t('setups.close')} onClick={() => setValue('setupLibraryOpen', false)}>✕</button>
      </header>

      <div className="pose-category-tabs" role="tablist">
        {SETUP_CATEGORIES.map((item) => (
          <button key={item} role="tab" aria-selected={category === item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>
            {t(`setups.category.${item}` as MessageKey)}
          </button>
        ))}
      </div>

      <div className="setup-cards">
        {entries.map((setup) => {
          const label = ct(`setup.${setup.id}`, setup.label)
          const summary = ct(`setup.${setup.id}.summary`, setup.summary)
          const note = ct(`setup.${setup.id}.note`, setup.note)
          const backdrop = setup.backdropId ? getBackdrop(setup.backdropId) : null
          return (
            <article key={setup.id} className="setup-card">
              <div className="setup-card-head">
                <div className="setup-diagram" aria-hidden="true">
                  {/* A plan of the setup: subject at the centre, lights around it. */}
                  <svg viewBox="-3 -3 6 6">
                    <circle cx="0" cy="0" r="0.28" className="setup-subject" />
                    <path d="M -0.42 0.9 L 0.42 0.9 L 0 0.35 Z" className="setup-camera"
                      transform={`translate(${setup.camera.position[0] * 0.55} ${setup.camera.position[2] * 0.55}) rotate(180)`} />
                    {setup.lights.map((light) => (
                      <rect key={light.id} x={-0.22} y={-0.22} width={0.44} height={0.44} rx={0.08} className="setup-light"
                        transform={`translate(${light.position[0] * 0.55} ${light.position[2] * -0.55})`} />
                    ))}
                  </svg>
                </div>
                <div className="setup-card-title">
                  <strong>{label}</strong>
                  <small>{summary}</small>
                </div>
              </div>
              <p className="setup-card-note">{note}</p>
              <div className="setup-card-meta">
                <span>{t('setups.lights')} <b>{setup.lights.length}</b></span>
                <span>{t('setups.ratio')} <b>{setup.ratio}</b></span>
                {backdrop && <span><i style={{ background: backdrop.color }} />{ct(`backdrop.${backdrop.id}`, backdrop.label)}</span>}
              </div>
              <button className="setup-apply" onClick={() => apply(setup.id, label)}>{t('setups.apply')}</button>
            </article>
          )
        })}
      </div>

      <footer>
        <small>{applied ? t('setups.applied', { name: applied }) : t('setups.replaceWarning')}</small>
      </footer>
    </aside>
  )
}
