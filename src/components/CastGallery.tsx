import { useLocaleStore } from '../i18n'
import { assetHref } from '../routing'
import './CastGallery.css'

const portraits = [
  ['female', 'everyday'], ['male', 'everyday'],
  ['business-female', 'business'], ['business-male', 'business'],
  ['female-adult-07', 'casual'], ['male-adult-04', 'casual'],
] as const
const copy = {
  zh: { title: '不同人物，練習不同的光。', body: '六位棚內人物預覽：日常、商務與休閒服裝。觀察臉部、衣料與輪廓，再到攝影棚調整你的光線。', caption: '3D 人物預覽', everyday: '日常人像', business: '商務肖像', casual: '休閒穿搭' },
  en: { title: 'Different people. Different light studies.', body: 'Six studio character previews, from everyday clothes to business and casual wear. Study the face, fabric and silhouette, then shape your light in the studio.', caption: '3D character preview', everyday: 'Everyday portrait', business: 'Business portrait', casual: 'Casual wardrobe' },
  ja: { title: '人物が変わる。光の練習も変わる。', body: '日常・ビジネス・カジュアルの6人のスタジオ人物プレビュー。顔、布、輪郭を観察して、スタジオで光を調整しましょう。', caption: '3D人物プレビュー', everyday: '日常の人物', business: 'ビジネス', casual: 'カジュアル' },
}
export function CastGallery() {
  const locale = useLocaleStore((state) => state.locale)
  const text = copy[locale]
  return <section className="cast-gallery">
    <header><span>THE CONTACT SHEET</span><h2>{text.title}</h2><p>{text.body}</p></header>
    <div className="cast-contact-sheet">{portraits.map(([id, category], index) => <figure key={id}>
      <div><img src={assetHref(`models/lumen-human/cast/${id}.jpg`)} alt={`${text[category]} · ${text.caption} ${index + 1}`} width="148" height="470" loading="lazy" decoding="async" /><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></div>
      <figcaption><strong>{text[category]}</strong><small>{text.caption}</small></figcaption>
    </figure>)}</div>
  </section>
}
