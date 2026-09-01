import { useRef } from 'react'
import { useT } from '../i18n'
import { useDialogFocus } from './DialogFocus'
import { assetHref } from '../routing'
import { COPYRIGHT_BUTTON_LABEL } from '../copyright'

export const SITE_OWNER = 'YuYing'

export function CopyrightMark({ onOpen, compact = false }: { onOpen: () => void; compact?: boolean }) {
  const t = useT()

  return (
    <button className={compact ? 'copyright-mark compact' : 'copyright-mark'} onClick={onOpen} aria-label={t('about.open')}>
      <span aria-hidden="true">{COPYRIGHT_BUTTON_LABEL}</span>
    </button>
  )
}

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const closeButton = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const year = new Date().getFullYear()
  useDialogFocus(dialog, open, onClose)

  if (!open) return null

  return (
    <div className="about-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialog} className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <header>
          <div>
            <span>{t('about.eyebrow')}</span>
            <h2 id="about-title">LUMEN STAGE</h2>
          </div>
          <button ref={closeButton} onClick={onClose} aria-label={t('about.close')}>×</button>
        </header>

        <div className="about-owner">
          <span>{t('about.creator')}</span>
          <img className="creator-avatar" src={assetHref('yuying-avatar.png')} alt={`${SITE_OWNER} ${t('about.creator')}`} />
          <strong>{SITE_OWNER}</strong>
          <small>{t('about.role')}</small>
        </div>

        <div className="about-copy">
          <section>
            <span>01 / {t('about.copyrightTitle')}</span>
            <p>{t('about.copyright', { year, owner: SITE_OWNER })}</p>
          </section>
          <section>
            <span>02 / {t('about.dataTitle')}</span>
            <p>{t('about.data')}</p>
          </section>
          <section>
            <span>03 / {t('about.sharingTitle')}</span>
            <p>{t('about.sharing')}</p>
          </section>
        </div>

        <footer>
          <span>© {year} {SITE_OWNER}</span>
          <span>ALL RIGHTS RESERVED</span>
        </footer>
      </section>
    </div>
  )
}
