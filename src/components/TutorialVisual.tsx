import { useState } from 'react'
import { useLocaleStore } from '../i18n'
import { assetHref } from '../routing'
import './TutorialVisual.css'

export type TutorialTask = 'pose' | 'lighting' | 'camera' | 'render' | 'shot'
const COPY = {
  zh: { illustration: '操作示意', before: '操作前', after: '操作後', pose: ['中性站姿', '重心轉移'], lighting: ['正面主光', '斜上方主光'], camera: ['全身', '半身構圖'], render: ['即時預覽', '逐步累積取樣'], shot: ['目前畫面', '儲存拍攝結果'], sample: '示意：相同構圖，增加取樣', save: '儲存', saved: '已儲存', key: '主燈', fill: '補光' },
  en: { illustration: 'Illustrated guide', before: 'Before', after: 'After', pose: ['Neutral stand', 'Weight shift'], lighting: ['Frontal key', 'Angled key'], camera: ['Full body', 'Half-body framing'], render: ['Live preview', 'Accumulate samples'], shot: ['Current frame', 'Save the result'], sample: 'Illustration: same frame, more samples', save: 'Save', saved: 'Saved', key: 'Key', fill: 'Fill' },
  ja: { illustration: '操作イメージ', before: '操作前', after: '操作後', pose: ['自然な立ち姿', '重心を移す'], lighting: ['正面のキー', '斜め上のキー'], camera: ['全身', '上半身の構図'], render: ['リアルタイム', 'サンプルを蓄積'], shot: ['現在の画像', '結果を保存'], sample: '模式図：同じ構図でサンプルを増やす', save: '保存', saved: '保存済み', key: 'キー', fill: 'フィル' },
}

/** Deliberately labelled diagrams, not fabricated screenshots or render claims. */
export function TutorialVisual({ task }: { task: TutorialTask }) {
  const locale = useLocaleStore((state) => state.locale)
  const copy = COPY[locale]
  const [after, setAfter] = useState(false)
  return <div className={`tutorial-visual tutorial-${task}${after ? ' is-after' : ''}`}>
    <header><span>{copy.illustration}</span><strong>{copy[task][after ? 1 : 0]}</strong></header>
    <div className="tutorial-drawing">
      {task === 'pose' && <svg viewBox="0 0 400 190" role="img" aria-label={copy.pose[after ? 1 : 0]}>
        <path d="M60 168H340M200 24V168" className="guide-line" />
        <g className="pose-figure" stroke="currentColor" strokeWidth="8" strokeLinecap="round" fill="none">
          <circle cx="200" cy="39" r="16" /><path d={after ? 'M200 58L190 107L217 163M190 107L174 163M198 70L166 96L178 115M198 70L222 95L212 114' : 'M200 58V109M200 109L177 163M200 109L223 163M200 70L173 108M200 70L227 108'} />
        </g><circle cx={after ? 217 : 200} cy="169" r="4" fill="#e7bc82" />
      </svg>}
      {task === 'lighting' && <svg viewBox="0 0 400 190" role="img" aria-label={copy.lighting[after ? 1 : 0]}>
        <path d="M40 165H360M200 25V165" className="guide-line" />
        <path d={after ? "M91 58L181 85L192 119Z" : "M195 35L181 85L215 85Z"} fill="#e7bc82" opacity=".2" />
        <rect x={after ? 64 : 179} y="39" width="42" height="21" rx="3" transform={after ? "rotate(32 85 49)" : undefined} fill="#e7bc82" />
        <circle cx="200" cy="103" r="22" fill="#697b85" /><path d="M185 91Q200 117 215 91" fill="none" stroke="#d3e6ed" strokeWidth="2" />
        <text x="70" y="23">{copy.key}</text><path d="M192 160H208V175H192Z" fill="#d3e6ed" />
      </svg>}
      {task === 'camera' && <div className="tutorial-framing"><img src={assetHref('models/lumen-human/cast/male-adult-05.jpg')} alt={copy.camera[after ? 1 : 0]} /><div className="crop-frame"><i /><i /><i /><i /></div><span>{after ? '½' : '1:1'}</span></div>}
      {task === 'render' && <div className="tutorial-samples"><div className="sample-frame"><svg viewBox="0 0 180 130" aria-hidden="true"><path d="M0 110L60 43L101 83L128 61L180 116V130H0Z" fill="#739db0"/><circle cx="133" cy="29" r="15" fill="#e7bc82"/></svg><div className="sample-grain" /></div><div className="sample-meter"><i /><i /><i /><i /><i /><i /><i /><i /></div><small>{copy.sample}</small></div>}
      {task === 'shot' && <div className="tutorial-save"><div className="saved-frame"><svg viewBox="0 0 100 100" aria-hidden="true"><rect x="12" y="29" width="76" height="54" rx="8" fill="#455f6e"/><circle cx="50" cy="56" r="19" fill="none" stroke="#9cdcec" strokeWidth="5"/><path d="M33 29V19H65V29" fill="none" stroke="#e7bc82" strokeWidth="6"/></svg>{after && <b>✓</b>}</div><span>{after ? copy.saved : copy.save}</span></div>}
    </div>
    <div className="tutorial-toggle" role="group" aria-label={copy.illustration}>
      <button type="button" aria-pressed={!after} onClick={() => setAfter(false)}>{copy.before}</button>
      <button type="button" aria-pressed={after} onClick={() => setAfter(true)}>{copy.after}<span aria-hidden="true"> ↗</span></button>
    </div>
  </div>
}
