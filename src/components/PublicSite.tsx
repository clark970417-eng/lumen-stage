import { useEffect, useRef, useState } from 'react'
import { LOCALES, useLocaleStore, type Locale } from '../i18n'
import { assetHref, routeHref, studioHref, type PublicRoute } from '../routing'
import { SETUP_LIBRARY } from '../setups'
import { BrandMark } from './BrandMark'
import '../site.css'
import '../site-demo-video.css'

type Copy = {
  nav: [string, string, string, string]
  open: string
  eyebrow: string
  title: [string, string, string]
  intro: string
  proof: string[]
  demoLink: string
  demoTitle: string
  demoBody: string
  demoSteps: Array<[string, string]>
  setupsTitle: string
  setupsBody: string
  setupCta: string
  setupNames: Record<string, [string, string]>
  outcomeTitle: string
  outcomeBody: string
  outcomes: Array<[string, string]>
  trustTitle: string
  trust: Array<[string, string]>
  instrument: string
  instrumentBody: string
  capabilities: Array<[string, string]>
  galleryTitle: string
  galleryBody: string
  gallery: Array<[string, string]>
  workflowTitle: string
  workflow: Array<[string, string]>
  localTitle: string
  localBody: string
  finalTitle: string
  finalBody: string
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
    nav: ['功能', '範例', '常見問題', '支援'], open: '免費開啟攝影棚', eyebrow: '給攝影師與攝影學習者的 3D 攝影棚',
    title: ['進棚拍攝前，', '先排好燈位', '再決定畫面。'],
    intro: 'LUMEN STAGE 讓你在瀏覽器裡安排燈位、相機、人物與背景，用真實距離與鏡頭參數預演下一次拍攝。',
    proof: ['免安裝', '免帳號', '場景留在你的裝置'], instrument: '不是示意圖，是可以工作的攝影工具。',
    demoLink: '觀看 15 秒操作流程', demoTitle: '十五秒，從空白想法到可拍攝的方案。', demoBody: '同一個即時場景裡完成佈光、取景、比較與輸出，不用在紙上猜測每一次調整。',
    demoSteps: [['選擇配置', '從經典布光開始。'], ['安排主體', '確認人物位置與姿勢。'], ['移動燈位', '調整距離、角度與功率。'], ['確認相機', '檢查焦段、光圈與取景。'], ['檢視平面配置', '從上方確認人、燈與相機位置。'], ['匯出到現場', '儲存並輸出燈位工作表。']],
    setupsTitle: '不要從零開始。先點亮一組經典配置。', setupsBody: '每組範例都會直接載入人物、燈光、相機與背景；你可以從可工作的基礎上繼續調整。', setupCta: '載入這組燈位',
    setupNames: { rembrandt: ['林布蘭光', '45° 高位主光，在遠側臉頰留下標誌性的光三角。'], 'three-point': ['三點布光', '主光、補光與逆光組成清楚、可靠的訪談配置。'], clamshell: ['蚌殼光', '鏡頭軸線上下各一盞光，適合美容與妝髮畫面。'] },
    outcomeTitle: '一個場景，留下三種能帶走的成果。', outcomeBody: '規劃不只停在畫面裡。從空間配置到最後取景，再把有效決策整理成現場可讀的資料。', outcomes: [['燈位配置', '看清人物、燈具、相機與背景之間的空間關係。'], ['畫面預演', '在拍攝前確認光線方向、景深與構圖。'], ['拍攝交接', '保存、分享並輸出燈位工作表，讓團隊照著執行。']],
    trustTitle: '為真正的拍攝準備，而不是只做漂亮示意圖。', trust: [['內建經典配置', '以可直接調整的燈位、相機與背景參數建立。'], ['真實攝影語言', '支援距離、焦段、光圈、照度、色溫與塑光附件。'], ['本機優先', '免帳號、無廣告追蹤；專案預設留在你的瀏覽器。'], ['免費使用', '不需信用卡，開啟網站即可開始規劃。'], ['簡易與專業模式', '可從簡易介面開始，也能切換完整專業控制。']],
    instrumentBody: '人物、佈光、相機、配置四個模式共用同一個即時場景。桌機負責精準控制與預設管理，手機保留人物、燈光、取景與物件定位的核心操作。',
    capabilities: [['把抽象燈位變成空間', '以公尺、角度、照度與塑光附件建立可重現的配置。'], ['在拍攝前確認鏡頭', '切換片幅、焦段、光圈、景深與構圖，降低現場試錯。'], ['把方案帶到片場', '儲存、備份、分享場景並輸出燈位工作表與成品預覽。']],
    galleryTitle: '每一個決定，都看得到它對畫面的影響。', galleryBody: '介面會跟著目前工作切換，但燈光、相機與空間位置始終留在同一個場景中。',
    gallery: [['佈光', '逐盞調整功率、角度、距離、色溫與塑光附件。'], ['相機', '用實際焦段、曝光與取景框確認最終照片。'], ['配置', '從俯視畫面精確安排人物、燈具、相機與背景。']],
    workflowTitle: '從想法到可重現的拍攝方案。', workflow: [['建立場景', '選擇人物與舞台物件，安排高度、姿勢與空間位置。'], ['完成光線與取景', '逐盞調整燈光，再用實際相機設定確認最終裁切。'], ['保存有效決策', '比較前後、儲存預設，並匯出專案或燈位工作表。']],
    localTitle: 'Local-first，不把你的場景當成資料來源。', localBody: '專案預設儲存在你的瀏覽器，沒有帳號、廣告或行為追蹤。只有匿名技術錯誤會送出，且不包含場景與照片。',
    finalTitle: '下一次拍攝，先在 LUMEN STAGE 裡亮燈。', finalBody: '免費、免安裝、免信用卡。現在就從一組燈位開始。', faqTitle: '正式開拍前，先回答幾個問題。',
    faq: [['需要安裝嗎？', '不用。現代瀏覽器與支援 WebGL 的裝置即可使用。'], ['手機和桌機一樣嗎？', '共用同一種場景格式；手機保留排光、人物、相機與拍照的核心流程，桌機提供完整控制。'], ['場景會上傳嗎？', '不會。場景與匯入素材預設留在你的瀏覽器。'], ['可以分享嗎？', '可以。分享連結會把壓縮後的場景放在網址中，不需要帳號。'], ['能取代現場測光嗎？', '不能。它是規劃與溝通工具；正式拍攝仍應以現場器材與測光為準。'], ['需要付費嗎？', '目前公開版本可直接使用，不需要信用卡。']],
    privacyTitle: '隱私說明', privacyBody: ['LUMEN STAGE 不要求帳號，也不使用廣告追蹤或行為分析 cookie。', '場景、偏好、匯入素材與照片預設保存在你的瀏覽器。清除網站資料可能移除這些內容，因此請定期匯出備份。', '為了發現當機，網站可能送出匿名技術錯誤，包括錯誤訊息、程式位置、頁面路徑與版本；不包含場景內容、照片、專案名稱或匯入檔案。', '網站由 Vercel 與 GitHub 提供服務，供應商可能依其政策處理必要的網路與部署紀錄。'],
    termsTitle: '使用條款', termsBody: ['LUMEN STAGE 以現況提供，供攝影規劃、教育與視覺溝通使用。', '模擬結果會受到瀏覽器、螢幕、GPU、器材差異與環境條件影響，不構成曝光、色彩或安全保證；實際拍攝請以現場測量與器材規範為準。', '使用者應保留重要專案的匯出備份，並對匯入素材與分享內容擁有適當權利。', '介面、品牌與原創內容版權屬 YuYing；未經許可不得重製或重新散布原始碼與品牌資產。'],
    supportTitle: '支援與回報', supportBody: ['遇到載入、儲存、算圖或裝置相容問題時，請先重新載入網站，並確認瀏覽器已更新。', '回報問題時，請附上裝置、瀏覽器版本、畫面尺寸、重現步驟與截圖；不要附上私人照片或未公開專案檔。', 'LUMEN STAGE 目前由 YuYing 維護。你可以從 GitHub 個人主頁查看公開資訊，或透過 X 聯絡。'], issues: '前往 YuYing 的 GitHub', back: '返回首頁',
  },
  en: {
    nav: ['Capabilities', 'Setups', 'FAQ', 'Support'], open: 'Open the studio free', eyebrow: 'A 3D studio for photographers and learners',
    title: ['Plan the lights, lens', 'and frame before', 'you enter the studio.'], intro: 'LUMEN STAGE lets you arrange lights, camera, subject and backdrop with real distances and lens settings—right in your browser.',
    proof: ['No install', 'No account', 'Scenes stay on your device'], instrument: 'Not a mock-up. A working photographic instrument.', instrumentBody: 'Person, Light, Camera and Layout share one live scene. Desktop adds precise control and preset management; phone keeps the essential subject, lighting, framing and object-position tools.',
    demoLink: 'Watch the 15-second workflow', demoTitle: 'From a blank idea to a shootable plan in fifteen seconds.', demoBody: 'Light, frame, compare and hand off from one live scene instead of guessing what every adjustment will do.', demoSteps: [['Choose a setup', 'Start with a classic lighting pattern.'], ['Place the subject', 'Confirm position and pose.'], ['Move the lights', 'Tune distance, angle and output.'], ['Confirm the camera', 'Check focal length, aperture and frame.'], ['Review the layout', 'See subject, lights and camera from above.'], ['Export for set', 'Save and export a setup sheet.']],
    setupsTitle: 'Do not start from zero. Light a proven pattern first.', setupsBody: 'Each example loads its subject, lights, camera and backdrop so you can begin with a working foundation.', setupCta: 'Load this setup', setupNames: { rembrandt: ['Rembrandt light', 'A high 45° key leaves the signature triangle on the far cheek.'], 'three-point': ['Three-point light', 'Key, fill and back light form a clear, dependable interview setup.'], clamshell: ['Clamshell beauty', 'Two sources on the lens axis create clean beauty and makeup light.'] },
    outcomeTitle: 'One scene. Three useful outcomes.', outcomeBody: 'The plan does not stay trapped on screen. Move from spatial layout to the final frame, then package the decisions for set.', outcomes: [['Lighting layout', 'Understand the spatial relationship between subject, lights, camera and backdrop.'], ['Frame preview', 'Confirm direction, depth of field and composition before the shoot.'], ['Crew handoff', 'Save, share and export a setup sheet the crew can follow.']],
    trustTitle: 'Built for real shoot preparation, not just a pretty diagram.', trust: [['Classic setups included', 'Every pattern comes with editable light, camera and backdrop settings.'], ['Photographic language', 'Work with distance, focal length, aperture, illuminance, colour and modifiers.'], ['Local-first', 'No account or ad tracking; projects stay in your browser by default.'], ['Free to use', 'No credit card required. Open the site and start planning.'], ['Simple and Pro modes', 'Start with a simple interface, then switch to full professional controls.']],
    capabilities: [['Turn diagrams into space', 'Build repeatable setups with metres, angles, illuminance and real modifiers.'], ['Confirm the lens before call time', 'Compare sensor, focal length, aperture, depth of field and composition before the shoot.'], ['Carry the plan to set', 'Save, back up and share scenes, then export a lighting sheet and frame preview.']],
    galleryTitle: 'See what every decision changes.', galleryBody: 'The controls change with the job at hand, while light, camera and spatial placement remain in one continuous scene.',
    gallery: [['Light', 'Tune output, angle, distance, colour and modifiers one light at a time.'], ['Camera', 'Confirm the photograph with real focal length, exposure and framing controls.'], ['Layout', 'Place subject, lights, camera and backdrop precisely from the plan view.']],
    workflowTitle: 'From an idea to a repeatable shoot plan.', workflow: [['Build the scene', 'Choose a subject and stage objects, then set height, pose and spatial position.'], ['Shape light and frame', 'Tune one light at a time, then confirm the final crop with real camera settings.'], ['Keep the decisions', 'Compare before and after, save a preset, then export the project or setup sheet.']],
    localTitle: 'Local-first. Your scene is not our dataset.', localBody: 'Projects stay in your browser by default. There are no accounts, ads or behaviour analytics. Anonymous technical errors may be sent without scene or photo data.', finalTitle: 'Light your next shoot in LUMEN STAGE first.', finalBody: 'Free to use, with no install and no card. Start with one lighting setup now.', faqTitle: 'A few answers before call time.',
    faq: [['Do I install anything?', 'No. Use a modern browser on a device that supports WebGL.'], ['Are phone and desktop the same?', 'They share the same scene format. Phone keeps the essential lighting and framing flow; desktop provides complete control.'], ['Are scenes uploaded?', 'No. Scenes and imported assets stay in your browser by default.'], ['Can I share a setup?', 'Yes. A compressed scene travels inside the share URL, with no account required.'], ['Does it replace a light meter?', 'No. It is a planning and communication tool; use real equipment and measurements on set.'], ['Does it cost anything?', 'The current public release is available without a card.']],
    privacyTitle: 'Privacy', privacyBody: ['LUMEN STAGE requires no account and uses no advertising trackers, behaviour analytics or analytics cookies.', 'Scenes, preferences, imported assets and photos stay in your browser by default. Clearing site data can remove them, so export important backups.', 'To detect crashes, anonymous technical errors may include an error message, code location, route and release. They exclude scenes, photos, project names and imported files.', 'Vercel and GitHub provide hosting and source services and may process necessary network and deployment logs under their own policies.'],
    termsTitle: 'Terms of use', termsBody: ['LUMEN STAGE is provided as-is for photographic planning, education and visual communication.', 'Simulation results vary with browsers, displays, GPUs, equipment and physical conditions. They are not an exposure, colour or safety guarantee; verify with real equipment on set.', 'Keep exported backups of important work and hold the appropriate rights to imported and shared material.', 'The interface, brand and original content are © YuYing. Source and brand assets may not be redistributed without permission.'],
    supportTitle: 'Support', supportBody: ['For loading, storage, rendering or compatibility problems, reload first and confirm your browser is current.', 'Include device, browser version, viewport, reproduction steps and a screenshot. Do not attach private photographs or unreleased project files.', 'LUMEN STAGE is maintained by YuYing. Visit the GitHub profile for public information or get in touch on X.'], issues: "Open YuYing's GitHub", back: 'Back to home',
  },
  ja: {
    nav: ['機能', 'セット例', 'よくある質問', 'サポート'], open: '無料でスタジオを開く', eyebrow: '撮影者と学習者のための 3D スタジオ',
    title: ['スタジオに入る前に、', 'ライト、レンズ、', '画づくりを決める。'], intro: 'LUMEN STAGE はライト、カメラ、人物、背景を、実際の距離とレンズ設定でブラウザ上に組み立てる撮影設計ツールです。',
    proof: ['インストール不要', 'アカウント不要', 'シーンは端末内に保存'], instrument: 'イメージ図ではなく、実際に操作できる撮影ツール。', instrumentBody: '人物、照明、カメラ、配置の 4 モードが 1 つのライブシーンを共有。デスクトップは精密操作とプリセット管理、スマートフォンは人物・照明・構図・位置の中核操作に対応します。',
    demoLink: '15 秒の操作を見る', demoTitle: '十五秒で、アイデアを撮影可能なプランへ。', demoBody: '1 つのライブシーンで照明、構図、比較、書き出しまで行い、調整の結果を画面で確認できます。', demoSteps: [['セットを選ぶ', '定番の照明から開始。'], ['主体を配置', '位置とポーズを確認。'], ['ライトを動かす', '距離、角度、出力を調整。'], ['カメラを確認', '焦点距離、絞り、フレームを確認。'], ['レイアウトを確認', '主体、ライト、カメラを上から確認。'], ['現場用に書き出す', '保存してセットアップ表を書き出し。']],
    setupsTitle: 'ゼロから始めず、定番の照明を点ける。', setupsBody: '人物、ライト、カメラ、背景をまとめて読み込み、すぐに調整できる状態から始められます。', setupCta: 'このセットを読み込む', setupNames: { rembrandt: ['レンブラント光', '45° の高いキーで、反対側の頬に特徴的な三角形を作ります。'], 'three-point': ['三点照明', 'キー、フィル、バックライトによる安定したインタビュー照明。'], clamshell: ['クラムシェル', 'レンズ軸の上下 2 灯で、美容・メイク向けの光を作ります。'] },
    outcomeTitle: '1 つのシーンから、3 つの成果を持ち出す。', outcomeBody: '空間配置から最終フレームを確認し、撮影現場で使える情報として整理できます。', outcomes: [['照明配置', '人物、ライト、カメラ、背景の空間関係を確認。'], ['画面プレビュー', '撮影前に光の方向、被写界深度、構図を確認。'], ['チーム共有', '保存、共有、照明シートの書き出しで現場へ引き継ぎ。']],
    trustTitle: '美しい図ではなく、本番の準備のために。', trust: [['定番セットを収録', 'ライト、カメラ、背景の値をすべて編集できます。'], ['写真の実用単位', '距離、焦点距離、絞り、照度、色温度、モディファイアに対応。'], ['Local-first', 'アカウント・広告追跡なし。プロジェクトはブラウザ内に保存。'], ['無料で利用', 'クレジットカード不要。サイトを開いてすぐ開始。'], ['シンプル・プロ両対応', 'シンプル表示から始め、必要に応じてプロ向け操作へ切り替え。']],
    capabilities: [['照明図を空間にする', '距離、角度、照度、モディファイアで再現可能なセットを設計。'], ['撮影前にレンズを決める', 'センサー、焦点距離、絞り、被写界深度、構図を比較。'], ['プランを現場へ持ち出す', 'シーンを保存、バックアップ、共有し、照明シートを出力。']],
    galleryTitle: 'すべての判断を、画で確認。', galleryBody: '作業に合わせて操作は変わっても、光、カメラ、空間配置は 1 つのシーンに残ります。',
    gallery: [['照明', 'ライトごとに出力、角度、距離、色、モディファイアを調整。'], ['カメラ', '実際の焦点距離、露出、フレームで最終写真を確認。'], ['配置', '俯視表示から人物、ライト、カメラ、背景を正確に配置。']],
    workflowTitle: 'アイデアから再現できる撮影プランへ。', workflow: [['シーンを作る', '人物と舞台オブジェクトを選び、身長、ポーズ、空間位置を設定。'], ['光と構図を整える', 'ライトを 1 灯ずつ調整し、実際のカメラ設定で最終クロップを確認。'], ['判断を保存する', '前後比較、プリセット保存、プロジェクトまたは照明シートの書き出し。']],
    localTitle: 'Local-first。シーンを学習データにしません。', localBody: 'プロジェクトはブラウザ内に保存され、アカウント、広告、行動解析はありません。匿名の技術エラーのみ、シーンや写真を含めず送信される場合があります。', finalTitle: '次の撮影は、まず LUMEN STAGE で点灯。', finalBody: '無料、インストール不要、カード不要。今すぐ 1 つの照明から始めましょう。', faqTitle: '撮影前によくある質問。',
    faq: [['インストールは必要ですか？', '不要です。WebGL 対応のモダンブラウザで利用できます。'], ['スマホとデスクトップは同じですか？', '同じシーン形式を使います。スマホは中核フロー、デスクトップは全機能を提供します。'], ['シーンはアップロードされますか？', 'いいえ。シーンと素材は既定でブラウザ内に残ります。'], ['共有できますか？', 'はい。圧縮シーンを URL に含めるため、アカウント不要です。'], ['露出計の代わりになりますか？', 'いいえ。計画と共有のためのツールです。本番では実機で確認してください。'], ['料金はかかりますか？', '現在の公開版はカードなしで利用できます。']],
    privacyTitle: 'プライバシー', privacyBody: ['LUMEN STAGE はアカウント不要で、広告追跡、行動解析、解析 Cookie を使用しません。', 'シーン、設定、素材、写真は既定でブラウザ内に保存されます。サイトデータを削除すると失われるため、重要なデータは書き出してください。', '障害検知のため、エラー内容、コード位置、ページ、版を含む匿名技術エラーを送る場合があります。シーン、写真、プロジェクト名、素材は含みません。', 'Vercel と GitHub がサービスを提供し、各ポリシーに従って必要なネットワーク・配備ログを処理する場合があります。'],
    termsTitle: '利用規約', termsBody: ['LUMEN STAGE は撮影計画、教育、視覚コミュニケーション向けに現状のまま提供されます。', '結果はブラウザ、画面、GPU、機材、現場条件で変わり、露出、色、安全を保証しません。本番では実機で確認してください。', '重要な作業は書き出して保管し、読み込み・共有する素材の権利を確保してください。', 'UI、ブランド、オリジナルコンテンツの著作権は YuYing に帰属します。'],
    supportTitle: 'サポート', supportBody: ['読み込み、保存、レンダリング、互換性の問題は、再読み込みとブラウザ更新を最初に確認してください。', '端末、ブラウザ版、画面サイズ、再現手順、スクリーンショットを添えてください。非公開の写真やプロジェクトは添付しないでください。', 'LUMEN STAGE は YuYing が管理しています。公開情報は GitHub プロフィールで確認し、X から連絡できます。'], issues: 'YuYing の GitHub を開く', back: 'ホームへ戻る',
  },
}

const STUDIO_PREVIEWS: Record<Locale, { desktop: string; mobile: string; alt: string }> = {
  zh: {
    desktop: assetHref('site-preview/zh.png'),
    mobile: assetHref('site-preview/zh-mobile.png'),
    alt: 'Lumen Stage 繁體中文虛擬攝影棚，顯示人物、佈光、相機與配置四個模式',
  },
  en: {
    desktop: assetHref('site-preview/en.png'),
    mobile: assetHref('site-preview/en-mobile.png'),
    alt: 'Lumen Stage virtual studio showing the Person, Light, Camera and Layout modes',
  },
  ja: {
    desktop: assetHref('site-preview/ja.png'),
    mobile: assetHref('site-preview/ja-mobile.png'),
    alt: '人物、照明、カメラ、配置の 4 モードを表示する Lumen Stage 日本語版',
  },
}

const DEMO_VIDEOS: Record<Locale, { src: string; poster: string }> = {
  zh: { src: assetHref('site-demo/zh.mp4'), poster: assetHref('site-demo/zh.jpg') },
  en: { src: assetHref('site-demo/en.mp4'), poster: assetHref('site-demo/en.jpg') },
  ja: { src: assetHref('site-demo/ja.mp4'), poster: assetHref('site-demo/ja.jpg') },
}

const DEMO_LIVE_LABEL: Record<Locale, string> = {
  zh: '即時場景',
  en: 'LIVE SCENE',
  ja: 'ライブシーン',
}

const demoStepAt = (time: number) => time < 2.5 ? 0 : time < 5 ? 1 : time < 7.5 ? 2 : time < 10 ? 3 : time < 12.5 ? 4 : 5

const TRUST_MARKS = ['15', '01:1', 'LOCAL', 'FREE', '2 MODES'] as const

const FEATURED_SETUP_IDS = ['rembrandt', 'three-point', 'clamshell'] as const

function setupHref(id: string) {
  const href = studioHref()
  return `${href}${href.includes('?') ? '&' : '?'}setup=${encodeURIComponent(id)}`
}

function LocaleSwitch() {
  const locale = useLocaleStore((state) => state.locale)
  const setLocale = useLocaleStore((state) => state.setLocale)
  return <div className="site-locale" role="group" aria-label="Language">{LOCALES.map((item) => <button key={item.id} className={locale === item.id ? 'active' : ''} aria-pressed={locale === item.id} aria-label={item.native} onClick={() => setLocale(item.id)}>{item.short}</button>)}</div>
}

function SiteHeader({ copy }: { copy: Copy }) {
  const home = routeHref('home')
  return <header className="site-header"><div className="site-header-shell"><a className="site-brand" href={home} aria-label="Lumen Stage home"><BrandMark /><span><b>LUMEN</b><small>STAGE / WEB</small></span></a><nav aria-label="Primary"><a href={`${home}#capabilities`}>{copy.nav[0]}</a><a href={`${home}#setups`}>{copy.nav[1]}</a><a href={`${home}#faq`}>{copy.nav[2]}</a><a href={routeHref('support')}>{copy.nav[3]}</a></nav><div className="site-actions"><LocaleSwitch /><a className="site-cta compact" href={studioHref()}><span>{copy.open}</span><b aria-hidden="true">↗</b></a></div></div></header>
}

function SiteFooter({ copy }: { copy: Copy }) {
  return <footer className="site-footer"><span>© {new Date().getFullYear()} YuYing · LUMEN STAGE</span><nav><a href={routeHref('privacy')}>{copy.privacyTitle}</a><a href={routeHref('terms')}>{copy.termsTitle}</a><a href={routeHref('support')}>{copy.supportTitle}</a><a href="https://github.com/clark970417-eng" target="_blank" rel="noreferrer" aria-label="YuYing on GitHub">GitHub</a><a href="https://x.com/4yuying" target="_blank" rel="noreferrer" aria-label="YuYing on X">X</a></nav></footer>
}

function LegalPage({ route, copy }: { route: Exclude<PublicRoute, 'home' | 'studio'>; copy: Copy }) {
  const title = route === 'privacy' ? copy.privacyTitle : route === 'terms' ? copy.termsTitle : copy.supportTitle
  const paragraphs = route === 'privacy' ? copy.privacyBody : route === 'terms' ? copy.termsBody : copy.supportBody
  return <><SiteHeader copy={copy} /><main className="legal-page"><span>LUMEN STAGE / {route.toUpperCase()}</span><h1>{title}</h1><div>{paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>{route === 'support' && <a className="site-cta" href="https://github.com/clark970417-eng" target="_blank" rel="noreferrer">{copy.issues}</a>}<a className="legal-back" href={routeHref('home')}>← {copy.back}</a></main><SiteFooter copy={copy} /></>
}

export function PublicSite({ route }: { route: Exclude<PublicRoute, 'studio'> }) {
  const locale = useLocaleStore((state) => state.locale)
  const copy = COPY[locale]
  const studioPreview = STUDIO_PREVIEWS[locale]
  const demoVideo = DEMO_VIDEOS[locale]
  const [demoStep, setDemoStep] = useState(0)
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
    <section className="site-hero" data-locale={locale} onPointerMove={moveHeroLight} ref={heroStage}>
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-copy">
        <span className="hero-eyebrow"><i /> {copy.eyebrow}</span>
        <h1><span>{copy.title[0]}</span><em><span>{copy.title[1]}</span><span>{copy.title[2]}</span></em></h1>
        <div className="hero-lower"><p>{copy.intro}</p><div className="hero-actions"><a className="site-cta" href={studioHref()}><span>{copy.open}</span><b aria-hidden="true">↗</b></a><a className="hero-demo-link" href="#demo"><i aria-hidden="true">▶</i>{copy.demoLink}</a></div><ul>{copy.proof.map((item) => <li key={item}>{item}</li>)}</ul></div>
      </div>
      <div className="hero-instrument">
        <picture key={locale}>
          <source media="(max-width: 620px)" srcSet={studioPreview.mobile} type="image/png" width="780" height="844" />
          <img
            src={studioPreview.desktop}
            alt={studioPreview.alt}
            width="1920"
            height="1080"
            sizes="(max-width: 620px) 100vw, (max-width: 900px) 96vw, 40vw"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            draggable={false}
          />
        </picture>
      </div>
      <a className="scroll-cue" href="#capabilities"><span>SCROLL TO FOCUS</span><i /></a>
    </section>
    <section className="site-demo" id="demo" data-reveal>
      <header><span>01 / QUICK DEMO</span><h2>{copy.demoTitle}</h2><p>{copy.demoBody}</p></header>
      <div className="demo-console">
        <div className="demo-screen">
          <video key={locale} autoPlay muted loop playsInline preload="metadata" poster={demoVideo.poster} aria-label={studioPreview.alt}
            onTimeUpdate={(event) => setDemoStep(demoStepAt(event.currentTarget.currentTime))}
            onPlay={(event) => {
              const video = event.currentTarget
              if (!video.requestVideoFrameCallback) return
              const syncToFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
                setDemoStep(demoStepAt(metadata.mediaTime))
                if (!video.paused && !video.ended) video.requestVideoFrameCallback(syncToFrame)
              }
              video.requestVideoFrameCallback(syncToFrame)
            }}>
            <source src={demoVideo.src} type="video/mp4" />
          </video>
          <span className="demo-live"><i /> {DEMO_LIVE_LABEL[locale]}</span>
        </div>
        <ol>{copy.demoSteps.map(([title, body], index) => <li key={title} className={index === demoStep ? 'active' : ''}><span>0{index + 1}</span><div><strong>{title}</strong><small>{body}</small></div></li>)}</ol>
      </div>
    </section>
    <section className="site-intro" id="capabilities" data-reveal><span>02 / THE INSTRUMENT</span><h2>{copy.instrument}</h2><p>{copy.instrumentBody}</p></section>
    <section className="capability-grid" data-reveal>{copy.capabilities.map(([title, body], index) => <article key={title}>
      <div><span>0{index + 1}</span><i aria-hidden="true" /></div>
      <picture>
        <img src={assetHref(`site-detail/${locale}/${['light', 'camera', 'handoff'][index]}.png`)} alt={`${title} — ${body}`} width="780" height="438" loading="lazy" decoding="async" />
      </picture>
      <h3>{title}</h3><p>{body}</p>
    </article>)}</section>
    <section className="site-proof" aria-labelledby="site-proof-title" data-reveal>
      <header><span>03 / LIVE WORKSPACE</span><h2 id="site-proof-title">{copy.galleryTitle}</h2><p>{copy.galleryBody}</p></header>
      <div className="site-proof-grid">{copy.gallery.map(([title, body], index) => <figure key={title} className={index === 0 ? 'feature' : ''}>
        <picture>
          <source media="(max-width: 620px)" srcSet={assetHref(`onboarding/${locale}/mobile-${index + 1}.png`)} type="image/png" width="780" height="438" />
          <img src={assetHref(`onboarding/${locale}/desktop-${index + 1}.png`)} alt={`${title} — ${body}`} width="1920" height="1080" loading="lazy" decoding="async" />
        </picture>
        <figcaption><span>0{index + 1}</span><div><h3>{title}</h3><p>{body}</p></div></figcaption>
      </figure>)}</div>
    </section>
    <section className="featured-setups" id="setups">
      <header data-reveal><span>04 / STARTING POINTS</span><h2>{copy.setupsTitle}</h2><p>{copy.setupsBody}</p></header>
      <div className="setup-showcase">{FEATURED_SETUP_IDS.map((id, index) => {
        const setup = SETUP_LIBRARY.find((item) => item.id === id)!
        const [title, body] = copy.setupNames[id]
        return <article key={id} data-reveal>
          <div className="setup-visual" aria-hidden="true"><span>0{index + 1}</span><svg viewBox="-2.8 -2.8 5.6 5.6"><circle className="setup-person" cx="0" cy="0" r=".34" /><path className="setup-camera" d="M-.28 .24h.56l.2.28h-.96z" transform={`translate(${setup.camera.position[0]} ${setup.camera.position[2]}) rotate(180)`} />{setup.lights.map((light) => <g key={light.id} transform={`translate(${light.position[0]} ${light.position[2]})`}><line x1="0" y1="0" x2={-light.position[0]} y2={-light.position[2]} /><rect x="-.2" y="-.2" width=".4" height=".4" rx=".08" /></g>)}</svg><small>{setup.lights.length} LIGHTS · {setup.ratio}</small></div>
          <div className="setup-copy"><span>{setup.category.toUpperCase()}</span><h3>{title}</h3><p>{body}</p><a href={setupHref(id)}>{copy.setupCta}<b aria-hidden="true">↗</b></a></div>
        </article>
      })}</div>
    </section>
    <section className="workflow" id="workflow"><div className="workflow-heading" data-reveal><span>05 / WORKFLOW</span><h2>{copy.workflowTitle}</h2><p>PLAN · SHAPE · CAPTURE</p></div><ol>{copy.workflow.map(([title, body], index) => <li key={title} data-reveal><span>0{index + 1}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol></section>
    <section className="site-outcomes">
      <header data-reveal><span>06 / FROM PLAN TO SET</span><h2>{copy.outcomeTitle}</h2><p>{copy.outcomeBody}</p></header>
      <div>{copy.outcomes.map(([title, body], index) => <figure key={title} data-reveal><picture><img src={assetHref(`site-detail/${locale}/${['light', 'camera', 'handoff'][index]}.png`)} alt={`${title} — ${body}`} width="780" height="438" loading="lazy" decoding="async" /></picture><figcaption><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></figcaption></figure>)}</div>
    </section>
    <section className="site-trust" data-reveal><header><span>07 / BUILT-IN PROOF</span><h2>{copy.trustTitle}</h2></header><div>{copy.trust.map(([title, body], index) => <article key={title}><b>{TRUST_MARKS[index]}</b><h3>{title}</h3><p>{body}</p></article>)}</div></section>
    <section className="local-first" data-reveal><div className="privacy-orbit" aria-hidden="true"><BrandMark /><i /><i /></div><div><span>08 / DATA PRACTICE</span><h2>{copy.localTitle}</h2><p>{copy.localBody}</p></div><small>DEVICE<br />ONLY</small></section>
    <section className="faq" id="faq"><div className="faq-heading" data-reveal><span>09 / FAQ</span><h2>{copy.faqTitle}</h2></div><div>{copy.faq.map(([question, answer], index) => <details key={question} data-reveal><summary><span>0{index + 1}</span>{question}</summary><p>{answer}</p></details>)}</div></section>
    <section className="final-cta" data-reveal><span>READY / SET / LIGHT</span><h2>{copy.finalTitle}</h2><p>{copy.finalBody}</p><a className="site-cta" href={studioHref()}><span>{copy.open}</span><b aria-hidden="true">↗</b></a></section>
  </main><SiteFooter copy={copy} /></>
}
