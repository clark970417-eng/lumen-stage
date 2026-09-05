import { useState } from 'react'
import { useCatalogT, useLocaleStore } from '../i18n'
import { CAST } from '../actorCast'
import './CastGallery.css'

const copy = {
  zh: { title: '選好主角，再開始塑光。', body: '從旁邊選擇攝影棚中的人物，放大觀察臉部、衣料與輪廓，再到 Studio 練習你的光線。', caption: '3D 人物預覽', choose: '選擇人物' },
  en: { title: 'Choose your subject. Shape the light.', body: 'Select a studio character to study the face, fabric and silhouette up close, then practise your lighting in Studio.', caption: '3D character preview', choose: 'Choose a character' },
  ja: { title: '主役を選んで、光をつくる。', body: '人物を選び、顔・衣服・輪郭を大きく確認してから、Studioで光を調整しましょう。', caption: '3D人物プレビュー', choose: '人物を選ぶ' },
}
export function CastGallery() {
  const locale = useLocaleStore((state) => state.locale)
  const ct = useCatalogT()
  const [selected, setSelected] = useState(CAST[0].id)
  const person = CAST.find((member) => member.id === selected) ?? CAST[0]
  const text = copy[locale]
  return <section className="cast-gallery" data-reveal>
    <header><span>THE CAST</span><h2>{text.title}</h2><p>{text.body}</p></header>
    <div className="cast-browser">
      <figure className="cast-portrait">
        <div><img key={person.id} src={person.thumb} alt={ct(`cast.${person.id}`, person.label)} width="148" height="470" decoding="async" loading="lazy" /></div>
        <figcaption aria-live="polite"><strong>{ct(`cast.${person.id}`, person.label)}</strong><span>{person.height.toFixed(2)} m · {text.caption}</span></figcaption>
      </figure>
      <div className="cast-picker"><h3>{text.choose}<span>{CAST.length}</span></h3><div role="group" aria-label={text.choose}>{CAST.map((member) => <button key={member.id} type="button" aria-pressed={selected === member.id} onClick={() => setSelected(member.id)}><img src={member.thumb} alt="" width="44" height="80" loading="lazy" decoding="async" /><span>{ct(`cast.${member.id}`, member.label)}<small>{member.height.toFixed(2)} m</small></span></button>)}</div></div>
    </div>
  </section>
}
