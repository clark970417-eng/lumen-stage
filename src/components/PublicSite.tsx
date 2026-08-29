import { useEffect, useRef } from 'react'
import preview from '../../assets/lumen-stage-preview.png'
import { LOCALES, useLocaleStore, type Locale } from '../i18n'
import type { PublicRoute } from '../routing'
import { BrandMark } from './BrandMark'
import '../site.css'

type Copy = {
  nav: [string, string, string, string]
  open: string
  eyebrow: string
  title: [string, string, string]
  intro: string
  proof: string[]
  instrument: string
  instrumentBody: string
  capabilities: Array<[string, string]>
  showcaseTitle: string
  showcaseBody: string
  showcase: Array<{ title: string; body: string; alt: string }>
  photoBy: string
  workflowTitle: string
  workflow: Array<[string, string]>
  localTitle: string
  localBody: string
  finalTitle: string
  faqTitle: string
  faq: Array<[string, string]>
  privacyTitle: string
  privacyBody: string[]
  termsTitle: string
  termsBody: string[]
  supportTitle: string
  supportBody: string[]
  issues: string
  back: string
}

const COPY: Record<Locale, Copy> = {
  zh: {
    nav: ['功能', '流程', '常見問題', '支援'], open: '開啟攝影棚', eyebrow: '瀏覽器內的虛擬攝影棚',
    title: ['在燈亮起以前，', '先把畫面', '拍完一遍。'],
    intro: 'LUMEN STAGE 讓攝影師在瀏覽器裡安排燈位、相機、人物與背景，先看懂光線，再走進真正的棚。',
    proof: ['免安裝', '免帳號', '場景留在你的裝置'], instrument: '不是示意圖，是可以工作的攝影工具。',
    instrumentBody: '從林布蘭光到多燈商業棚拍，調整真實器材、曝光、色溫、鏡頭與姿勢；桌機負責精準控制，手機負責快速排光與取景。',
    capabilities: [['把抽象燈位變成空間', '以公尺、角度、照度與塑光附件建立可重現的配置。'], ['在拍攝前確認鏡頭', '切換片幅、焦段、光圈、景深與構圖，降低現場試錯。'], ['把方案帶到片場', '儲存、備份、分享場景並輸出燈位工作表與成品預覽。']],
    showcaseTitle: '一個攝影棚，先對應三種真實任務。', showcaseBody: '從人像主光、商業商品到色光實驗，先在同一套工具裡確認光比、材質反光與色彩關係。', photoBy: '攝影',
    showcase: [{ title: '色光人像', body: '用分離色塑造臉部輪廓與情緒層次。', alt: '紅藍色光交錯的棚內女性人像' }, { title: '商業商品', body: '控制包裝反光、陰影方向與品牌色。', alt: '黃色背景上的保養品商業攝影' }, { title: '雙色靜物', body: '在深色場景中分配輪廓光與產品焦點。', alt: '紅藍雙色光照明的專業耳機產品照' }],
    workflowTitle: '從想法到燈位，只要三個動作。', workflow: [['選一個起點', '使用經典燈位預設，或從空棚開始。'], ['調整畫面', '移動燈、人物與相機，查看曝光與景深。'], ['帶走方案', '分享連結、匯出專案，或下載燈位工作表。']],
    localTitle: 'Local-first，不把你的場景當成資料來源。', localBody: '專案預設儲存在你的瀏覽器，沒有帳號、廣告或行為追蹤。只有匿名技術錯誤會送出，且不包含場景與照片。',
    finalTitle: '下一次拍攝，先在 LUMEN STAGE 裡亮燈。', faqTitle: '正式開拍前，先回答幾個問題。',
    faq: [['需要安裝嗎？', '不用。現代瀏覽器與支援 WebGL 的裝置即可使用。'], ['手機和桌機一樣嗎？', '共用同一種場景格式；手機保留排光、人物、相機與拍照的核心流程，桌機提供完整控制。'], ['場景會上傳嗎？', '不會。場景與匯入素材預設留在你的瀏覽器。'], ['可以分享嗎？', '可以。分享連結會把壓縮後的場景放在網址中，不需要帳號。'], ['能取代現場測光嗎？', '不能。它是規劃與溝通工具；正式拍攝仍應以現場器材與測光為準。'], ['需要付費嗎？', '目前公開版本可直接使用，不需要信用卡。']],
    privacyTitle: '隱私說明', privacyBody: ['LUMEN STAGE 不要求帳號，也不使用廣告追蹤或行為分析 cookie。', '場景、偏好、匯入素材與照片預設保存在你的瀏覽器。清除網站資料可能移除這些內容，因此請定期匯出備份。', '為了發現當機，網站可能送出匿名技術錯誤，包括錯誤訊息、程式位置、頁面路徑與版本；不包含場景內容、照片、專案名稱或匯入檔案。', '網站由 Vercel 與 GitHub 提供服務，供應商可能依其政策處理必要的網路與部署紀錄。'],
    termsTitle: '使用條款', termsBody: ['LUMEN STAGE 以現況提供，供攝影規劃、教育與視覺溝通使用。', '模擬結果會受到瀏覽器、螢幕、GPU、器材差異與環境條件影響，不構成曝光、色彩或安全保證；實際拍攝請以現場測量與器材規範為準。', '使用者應保留重要專案的匯出備份，並對匯入素材與分享內容擁有適當權利。', '介面、品牌與原創內容版權屬 YuYing；未經許可不得重製或重新散布原始碼與品牌資產。'],
    supportTitle: '支援與回報', supportBody: ['遇到載入、儲存、算圖或裝置相容問題時，請先重新載入網站，並確認瀏覽器已更新。', '回報問題時，請附上裝置、瀏覽器版本、畫面尺寸、重現步驟與截圖；不要附上私人照片或未公開專案檔。', 'LUMEN STAGE 目前由 YuYing 維護。你可以從 GitHub 個人主頁查看公開資訊，或透過 X 聯絡。'], issues: '前往 YuYing 的 GitHub', back: '返回首頁',
  },
  en: {
    nav: ['Capabilities', 'Workflow', 'FAQ', 'Support'], open: 'Open the studio', eyebrow: 'A virtual photography studio in your browser',
    title: ['Make the photograph', 'before the lights', ' turn on.'], intro: 'LUMEN STAGE lets photographers arrange lights, camera, subject and backdrop in the browser—so the light makes sense before the real studio clock starts.',
    proof: ['No install', 'No account', 'Scenes stay on your device'], instrument: 'Not a mock-up. A working photographic instrument.', instrumentBody: 'Build anything from Rembrandt light to a multi-light commercial set with real gear, exposure, colour, lenses and posing. Desktop delivers precision; phone delivers fast planning and framing.',
    capabilities: [['Turn diagrams into space', 'Build repeatable setups with metres, angles, illuminance and real modifiers.'], ['Confirm the lens before call time', 'Compare sensor, focal length, aperture, depth of field and composition before the shoot.'], ['Carry the plan to set', 'Save, back up and share scenes, then export a lighting sheet and frame preview.']],
    showcaseTitle: 'One studio, three real assignments.', showcaseBody: 'Move from portrait key light to commercial product work and colour experiments—checking ratios, material reflections and colour relationships in the same instrument.', photoBy: 'Photo',
    showcase: [{ title: 'Gel-lit portrait', body: 'Separate colour channels to shape facial contours and mood.', alt: 'Studio portrait of a woman shaped by intersecting red and blue light' }, { title: 'Commercial product', body: 'Control packaging reflections, shadow direction and brand colour.', alt: 'Commercial skincare products photographed on a yellow set' }, { title: 'Two-tone still life', body: 'Balance rim light and product focus in a dark set.', alt: 'Professional headphones photographed under blue and red studio light' }],
    workflowTitle: 'From idea to lighting plan in three moves.', workflow: [['Choose a starting point', 'Use a classic lighting setup or begin with an empty studio.'], ['Shape the frame', 'Move lights, subject and camera while checking exposure and depth.'], ['Take the plan with you', 'Share a link, export the project or download a setup sheet.']],
    localTitle: 'Local-first. Your scene is not our dataset.', localBody: 'Projects stay in your browser by default. There are no accounts, ads or behaviour analytics. Anonymous technical errors may be sent without scene or photo data.', finalTitle: 'Light your next shoot in LUMEN STAGE first.', faqTitle: 'A few answers before call time.',
    faq: [['Do I install anything?', 'No. Use a modern browser on a device that supports WebGL.'], ['Are phone and desktop the same?', 'They share the same scene format. Phone keeps the essential lighting and framing flow; desktop provides complete control.'], ['Are scenes uploaded?', 'No. Scenes and imported assets stay in your browser by default.'], ['Can I share a setup?', 'Yes. A compressed scene travels inside the share URL, with no account required.'], ['Does it replace a light meter?', 'No. It is a planning and communication tool; use real equipment and measurements on set.'], ['Does it cost anything?', 'The current public release is available without a card.']],
    privacyTitle: 'Privacy', privacyBody: ['LUMEN STAGE requires no account and uses no advertising trackers, behaviour analytics or analytics cookies.', 'Scenes, preferences, imported assets and photos stay in your browser by default. Clearing site data can remove them, so export important backups.', 'To detect crashes, anonymous technical errors may include an error message, code location, route and release. They exclude scenes, photos, project names and imported files.', 'Vercel and GitHub provide hosting and source services and may process necessary network and deployment logs under their own policies.'],
    termsTitle: 'Terms of use', termsBody: ['LUMEN STAGE is provided as-is for photographic planning, education and visual communication.', 'Simulation results vary with browsers, displays, GPUs, equipment and physical conditions. They are not an exposure, colour or safety guarantee; verify with real equipment on set.', 'Keep exported backups of important work and hold the appropriate rights to imported and shared material.', 'The interface, brand and original content are © YuYing. Source and brand assets may not be redistributed without permission.'],
    supportTitle: 'Support', supportBody: ['For loading, storage, rendering or compatibility problems, reload first and confirm your browser is current.', 'Include device, browser version, viewport, reproduction steps and a screenshot. Do not attach private photographs or unreleased project files.', 'LUMEN STAGE is maintained by YuYing. Visit the GitHub profile for public information or get in touch on X.'], issues: "Open YuYing's GitHub", back: 'Back to home',
  },
  ja: {
    nav: ['機能', '流れ', 'よくある質問', 'サポート'], open: 'スタジオを開く', eyebrow: 'ブラウザで動くバーチャル撮影スタジオ',
    title: ['ライトを点ける', '前に、一度、', '撮り終える。'], intro: 'LUMEN STAGE はライト、カメラ、人物、背景をブラウザ上で組み立て、本番前に光を理解するための撮影設計ツールです。',
    proof: ['インストール不要', 'アカウント不要', 'シーンは端末内に保存'], instrument: 'イメージ図ではなく、実際に操作できる撮影ツール。', instrumentBody: 'レンブラントから多灯の商品撮影まで、実在機材、露出、色温度、レンズ、ポーズを調整。デスクトップは精密操作、スマートフォンは素早いライティングとフレーミングに対応します。',
    capabilities: [['照明図を空間にする', '距離、角度、照度、モディファイアで再現可能なセットを設計。'], ['撮影前にレンズを決める', 'センサー、焦点距離、絞り、被写界深度、構図を比較。'], ['プランを現場へ持ち出す', 'シーンを保存、バックアップ、共有し、照明シートを出力。']],
    showcaseTitle: 'ひとつのスタジオで、3 つの実案件へ。', showcaseBody: 'ポートレートのキーライトから商品撮影、カラーライトまで。光比、素材の反射、色の関係を同じツールで確認できます。', photoBy: '撮影',
    showcase: [{ title: 'カラーポートレート', body: '分離した色光で顔の輪郭とムードを設計。', alt: '赤と青のライトが交差する女性のスタジオポートレート' }, { title: '商業商品撮影', body: 'パッケージの反射、影の向き、ブランドカラーを制御。', alt: '黄色のセットで撮影されたスキンケア商品' }, { title: 'ツートーン静物', body: '暗いセットでリムライトと商品の焦点を調整。', alt: '赤と青のスタジオライトで撮影されたヘッドホン' }],
    workflowTitle: 'アイデアから照明プランまで、3 ステップ。', workflow: [['起点を選ぶ', '定番ライティング、または空のスタジオから開始。'], ['画を整える', 'ライト、人物、カメラを動かし露出と被写界深度を確認。'], ['プランを持ち出す', 'リンク共有、プロジェクト書き出し、照明シートを利用。']],
    localTitle: 'Local-first。シーンを学習データにしません。', localBody: 'プロジェクトはブラウザ内に保存され、アカウント、広告、行動解析はありません。匿名の技術エラーのみ、シーンや写真を含めず送信される場合があります。', finalTitle: '次の撮影は、まず LUMEN STAGE で点灯。', faqTitle: '撮影前によくある質問。',
    faq: [['インストールは必要ですか？', '不要です。WebGL 対応のモダンブラウザで利用できます。'], ['スマホとデスクトップは同じですか？', '同じシーン形式を使います。スマホは中核フロー、デスクトップは全機能を提供します。'], ['シーンはアップロードされますか？', 'いいえ。シーンと素材は既定でブラウザ内に残ります。'], ['共有できますか？', 'はい。圧縮シーンを URL に含めるため、アカウント不要です。'], ['露出計の代わりになりますか？', 'いいえ。計画と共有のためのツールです。本番では実機で確認してください。'], ['料金はかかりますか？', '現在の公開版はカードなしで利用できます。']],
    privacyTitle: 'プライバシー', privacyBody: ['LUMEN STAGE はアカウント不要で、広告追跡、行動解析、解析 Cookie を使用しません。', 'シーン、設定、素材、写真は既定でブラウザ内に保存されます。サイトデータを削除すると失われるため、重要なデータは書き出してください。', '障害検知のため、エラー内容、コード位置、ページ、版を含む匿名技術エラーを送る場合があります。シーン、写真、プロジェクト名、素材は含みません。', 'Vercel と GitHub がサービスを提供し、各ポリシーに従って必要なネットワーク・配備ログを処理する場合があります。'],
    termsTitle: '利用規約', termsBody: ['LUMEN STAGE は撮影計画、教育、視覚コミュニケーション向けに現状のまま提供されます。', '結果はブラウザ、画面、GPU、機材、現場条件で変わり、露出、色、安全を保証しません。本番では実機で確認してください。', '重要な作業は書き出して保管し、読み込み・共有する素材の権利を確保してください。', 'UI、ブランド、オリジナルコンテンツの著作権は YuYing に帰属します。'],
    supportTitle: 'サポート', supportBody: ['読み込み、保存、レンダリング、互換性の問題は、再読み込みとブラウザ更新を最初に確認してください。', '端末、ブラウザ版、画面サイズ、再現手順、スクリーンショットを添えてください。非公開の写真やプロジェクトは添付しないでください。', 'LUMEN STAGE は YuYing が管理しています。公開情報は GitHub プロフィールで確認し、X から連絡できます。'], issues: 'YuYing の GitHub を開く', back: 'ホームへ戻る',
  },
}

function LocaleSwitch() {
  const locale = useLocaleStore((state) => state.locale)
  const setLocale = useLocaleStore((state) => state.setLocale)
  return <div className="site-locale" role="group" aria-label="Language">{LOCALES.map((item) => <button key={item.id} className={locale === item.id ? 'active' : ''} aria-pressed={locale === item.id} aria-label={item.native} onClick={() => setLocale(item.id)}>{item.short}</button>)}</div>
}

function SiteHeader({ copy }: { copy: Copy }) {
  return <header className="site-header"><div className="site-header-shell"><a className="site-brand" href="/" aria-label="Lumen Stage home"><BrandMark /><span><b>LUMEN</b><small>STAGE / WEB</small></span></a><nav aria-label="Primary"><a href="/#capabilities">{copy.nav[0]}</a><a href="/#workflow">{copy.nav[1]}</a><a href="/#faq">{copy.nav[2]}</a><a href="/support">{copy.nav[3]}</a></nav><div className="site-actions"><LocaleSwitch /><a className="site-cta compact" href="/studio"><span>{copy.open}</span><b aria-hidden="true">↗</b></a></div></div></header>
}

function SiteFooter({ copy }: { copy: Copy }) {
  return <footer className="site-footer"><span>© {new Date().getFullYear()} YuYing · LUMEN STAGE</span><nav><a href="/privacy">{copy.privacyTitle}</a><a href="/terms">{copy.termsTitle}</a><a href="/support">{copy.supportTitle}</a><a href="https://github.com/clark970417-eng" target="_blank" rel="noreferrer" aria-label="YuYing on GitHub">GitHub</a><a href="https://x.com/4yuying" target="_blank" rel="noreferrer" aria-label="YuYing on X">X</a></nav></footer>
}

function LegalPage({ route, copy }: { route: Exclude<PublicRoute, 'home' | 'studio'>; copy: Copy }) {
  const title = route === 'privacy' ? copy.privacyTitle : route === 'terms' ? copy.termsTitle : copy.supportTitle
  const paragraphs = route === 'privacy' ? copy.privacyBody : route === 'terms' ? copy.termsBody : copy.supportBody
  return <><SiteHeader copy={copy} /><main className="legal-page"><span>LUMEN STAGE / {route.toUpperCase()}</span><h1>{title}</h1><div>{paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>{route === 'support' && <a className="site-cta" href="https://github.com/clark970417-eng" target="_blank" rel="noreferrer">{copy.issues}</a>}<a className="legal-back" href="/">← {copy.back}</a></main><SiteFooter copy={copy} /></>
}

export function PublicSite({ route }: { route: Exclude<PublicRoute, 'studio'> }) {
  const locale = useLocaleStore((state) => state.locale)
  const copy = COPY[locale]
  const heroStage = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const titles = { home: 'Lumen Stage — Virtual Photography Studio', privacy: `${copy.privacyTitle} — Lumen Stage`, terms: `${copy.termsTitle} — Lumen Stage`, support: `${copy.supportTitle} — Lumen Stage` }
    document.title = titles[route]
    document.body.classList.add('public-site-body')
    document.documentElement.classList.add('public-site-root')
    return () => { document.body.classList.remove('public-site-body'); document.documentElement.classList.remove('public-site-root') }
  }, [copy, route])
  useEffect(() => {
    if (route !== 'home') return
    const reveals = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })
    reveals.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [locale, route])

  const moveHeroLight = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!heroStage.current || event.pointerType === 'touch') return
    const bounds = heroStage.current.getBoundingClientRect()
    heroStage.current.style.setProperty('--pointer-x', `${((event.clientX - bounds.left) / bounds.width) * 100}%`)
    heroStage.current.style.setProperty('--pointer-y', `${((event.clientY - bounds.top) / bounds.height) * 100}%`)
  }
  if (route !== 'home') return <LegalPage route={route} copy={copy} />
  return <><SiteHeader copy={copy} /><main className="landing">
    <section className="site-hero" onPointerMove={moveHeroLight} ref={heroStage}>
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-copy">
        <span className="hero-eyebrow"><i /> {copy.eyebrow}</span>
        <h1><span>{copy.title[0]}</span><em><span>{copy.title[1]}</span><span>{copy.title[2]}</span></em></h1>
        <div className="hero-lower"><p>{copy.intro}</p><div><a className="site-cta" href="/studio"><span>{copy.open}</span><b aria-hidden="true">↗</b></a><ul>{copy.proof.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
      </div>
      <div className="hero-instrument" aria-label="Lumen Stage product preview">
        <div className="instrument-chrome"><span className="instrument-status"><i /> LIVE STUDIO</span><span>SCENE / 001</span><span>60 FPS</span></div>
        <div className="instrument-picture"><img src={preview} alt="Lumen Stage desktop studio showing a portrait lighting setup" width="1280" height="720" fetchPriority="high" /><div className="focus-mark" aria-hidden="true"><i /><i /><i /><i /></div><span className="light-scan" aria-hidden="true" /></div>
        <div className="instrument-readout"><span>LENS <b>50<small>mm</small></b></span><span>APERTURE <b>ƒ/4</b></span><span>SHUTTER <b>1/125<small>s</small></b></span><span>KEY TEMP <b>5600<small>K</small></b></span></div>
      </div>
      <a className="scroll-cue" href="#capabilities"><span>SCROLL TO FOCUS</span><i /></a>
    </section>
    <section className="site-intro" id="capabilities" data-reveal><span>01 / THE INSTRUMENT</span><h2>{copy.instrument}</h2><p>{copy.instrumentBody}</p></section>
    <section className="capability-grid" data-reveal>{copy.capabilities.map(([title, body], index) => <article key={title}><div><span>0{index + 1}</span><i aria-hidden="true" /></div><h3>{title}</h3><p>{body}</p></article>)}</section>
    <section className="photo-showcase" aria-labelledby="photo-showcase-title">
      <div className="photo-showcase-heading" data-reveal><span>02 / SHOOT RANGE</span><h2 id="photo-showcase-title">{copy.showcaseTitle}</h2><p>{copy.showcaseBody}</p></div>
      <div className="photo-contact-sheet">{copy.showcase.map((item, index) => {
        const photos = [
          { src: '/showcase/gel-portrait.jpg', width: 1200, height: 2133, author: 'Jacquelin Perez', href: 'https://www.pexels.com/photo/studio-portrait-of-a-woman-lit-in-red-and-blue-6343596/', readout: '85 MM · GEL SPLIT' },
          { src: '/showcase/commercial-skincare.jpg', width: 1200, height: 1800, author: 'Nora Topicals', href: 'https://www.pexels.com/photo/cosmetics-studio-shoot-7038148/', readout: '70 MM · HARD KEY' },
          { src: '/showcase/two-tone-product.jpg', width: 1200, height: 1500, author: 'Guillaume Meurice', href: 'https://www.pexels.com/photo/black-headphones-on-blue-background-6587328/', readout: '90 MM · EDGE LIGHT' },
        ][index]
        return <figure key={item.title} className={`photo-frame photo-frame-${index + 1}`} data-reveal>
          <div className="photo-frame-image"><img src={photos.src} alt={item.alt} width={photos.width} height={photos.height} loading="lazy" decoding="async" /><span>{photos.readout}</span></div>
          <figcaption><div><span>0{index + 1}</span><h3>{item.title}</h3></div><p>{item.body}</p><a href={photos.href} target="_blank" rel="noreferrer">{copy.photoBy} / {photos.author} ↗</a></figcaption>
        </figure>
      })}</div>
    </section>
    <section className="workflow" id="workflow"><div className="workflow-heading" data-reveal><span>03 / WORKFLOW</span><h2>{copy.workflowTitle}</h2><p>PLAN · SHAPE · CAPTURE</p></div><ol>{copy.workflow.map(([title, body], index) => <li key={title} data-reveal><span>0{index + 1}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol></section>
    <section className="local-first" data-reveal><div className="privacy-orbit" aria-hidden="true"><BrandMark /><i /><i /></div><div><span>04 / DATA PRACTICE</span><h2>{copy.localTitle}</h2><p>{copy.localBody}</p></div><small>DEVICE<br />ONLY</small></section>
    <section className="faq" id="faq"><div className="faq-heading" data-reveal><span>05 / FAQ</span><h2>{copy.faqTitle}</h2></div><div>{copy.faq.map(([question, answer], index) => <details key={question} data-reveal><summary><span>0{index + 1}</span>{question}</summary><p>{answer}</p></details>)}</div></section>
    <section className="final-cta" data-reveal><span>READY / SET / LIGHT</span><h2>{copy.finalTitle}</h2><a className="site-cta" href="/studio"><span>{copy.open}</span><b aria-hidden="true">↗</b></a></section>
  </main><SiteFooter copy={copy} /></>
}
