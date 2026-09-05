import type { Locale } from '../i18n'

const labels = {
  zh: ['主光', '輸出功率', '色溫', '閃光', '相機', '焦段', '光圈', '儲存與匯出', '儲存場景', '匯出專案', '燈位工作表', '本機儲存', '全身'],
  en: ['Key light', 'Output', 'Temperature', 'Flash', 'Camera', 'Focal length', 'Aperture', 'Save & export', 'Save scene', 'Export project', 'Setup sheet', 'Local storage', 'Full body'],
  ja: ['キーライト', '出力', '色温度', 'フラッシュ', 'カメラ', '焦点距離', '絞り', '保存と書き出し', 'シーンを保存', 'プロジェクト書き出し', 'ライト図', 'ローカル保存', '全身'],
}
export function SettingsPreview({ index, locale }: { index: number; locale: Locale }) {
  const t = labels[locale]
  const rows = index === 0 ? [[t[1], '108', 'Ws'], [t[2], '5600', 'K']] : [[t[5], '50', 'mm'], [t[6], 'f/4.0', ''], ['ISO', '100', '']]
  return <div className="settings-preview" role="img" aria-label={t[index === 0 ? 0 : index === 1 ? 4 : 7]}>
    <header><strong>{t[index === 0 ? 0 : index === 1 ? 4 : 7]}</strong><small>{index === 0 ? t[3] : index === 1 ? t[12] : t[11]}</small></header>
    {index < 2 ? rows.map(([label, value, unit], i) => <div className="settings-preview-row" key={label}><span>{label}</span><b>{value}<small>{unit}</small></b><i style={{ '--position': `${[38, 52, 20][i]}%` } as React.CSSProperties} /></div>) : [8, 9, 10].map((key, i) => <div className="settings-export-row" key={key}><span>{t[key]}</span><small>{['⌘S', 'JSON', 'PDF'][i]}</small></div>)}
  </div>
}
