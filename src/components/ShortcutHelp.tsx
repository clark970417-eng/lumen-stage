import { useEffect, useRef } from 'react'
import { SHORTCUTS, type Shortcut, type ShortcutSection } from '../shortcuts'
import { useStudio } from '../store'

/** 手動分欄，讓三欄高度接近，不必依賴瀏覽器的多欄平衡 */
const SHORTCUT_COLUMNS: ShortcutSection[][] = [
  ['檢視與渲染', '面板'],
  ['選取與編輯'],
  ['相機參數', '移動物件'],
]

function Keys({ shortcut }: { shortcut: Shortcut }) {
  return <span className="shortcut-keys">{shortcut.keys.map((key, index) => <kbd key={`${key}-${index}`}>{key}</kbd>)}</span>
}

/** 右上角常駐入口，讓使用者知道有快捷鍵可用 */
export function ShortcutLauncher() {
  const open = useStudio((state) => state.shortcutHelpOpen)
  const setValue = useStudio((state) => state.setValue)
  return (
    <div className="shortcut-launcher">
      <button className={open ? 'active' : ''} onClick={() => setValue('shortcutHelpOpen', !open)} title="快捷鍵說明（?）">
        快捷鍵 <kbd>?</kbd>
      </button>
    </div>
  )
}

export function ShortcutHelp() {
  const open = useStudio((state) => state.shortcutHelpOpen)
  const setValue = useStudio((state) => state.setValue)
  const state = useStudio()
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => { if (open) closeButton.current?.focus() }, [open])

  if (!open) return null

  return (
    <div className="shortcut-overlay" role="dialog" aria-modal="true" aria-label="鍵盤快捷鍵" onClick={(event) => { if (event.target === event.currentTarget) setValue('shortcutHelpOpen', false) }}>
      <div className="shortcut-dialog">
        <header>
          <div><strong>鍵盤快捷鍵</strong><small>KEYBOARD SHORTCUTS</small></div>
          <button ref={closeButton} aria-label="關閉快捷鍵說明" onClick={() => setValue('shortcutHelpOpen', false)}>×</button>
        </header>
        <div className="shortcut-sections">
          {SHORTCUT_COLUMNS.map((column, columnIndex) => (
            <div className="shortcut-column" key={columnIndex}>
              {column.map((section) => {
                const items = SHORTCUTS.filter((shortcut) => shortcut.section === section)
                if (!items.length) return null
                return (
                  <section key={section}>
                    <h3>{section}</h3>
                    <ul>
                      {items.map((shortcut) => (
                        <li key={shortcut.id} className={shortcut.available && !shortcut.available(state) ? 'unavailable' : ''}>
                          <span className="shortcut-label">{shortcut.label}{shortcut.hint && <small>{shortcut.hint}</small>}</span>
                          <Keys shortcut={shortcut} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          ))}
        </div>
        <footer>
          <span>灰色項目代表目前選取狀態下無法使用</span>
          <span>按 <kbd>Esc</kbd> 或 <kbd>?</kbd> 關閉</span>
        </footer>
      </div>
    </div>
  )
}

/** 按下快捷鍵後的浮動回饋，讓看不到面板的操作也有反應 */
export function ShortcutHint({ hint }: { hint: { id: number; text: string } | null }) {
  if (!hint) return null
  return <div className="shortcut-hint" key={hint.id} role="status" aria-live="polite">{hint.text}</div>
}
