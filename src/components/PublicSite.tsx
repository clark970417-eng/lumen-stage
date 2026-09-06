import { CastGallery } from './CastGallery'
import { SettingsPreview } from './SettingsPreview'
import { useEffect, useRef, useState } from 'react'
import { DEMO_STEP_MOVEMENT_STARTS, demoStepAt } from '../demoTimeline'
import { LOCALES, useLocaleStore, type Locale } from '../i18n'
import { assetHref, routeHref, studioHref, type PublicRoute } from '../routing'
import { SETUP_LIBRARY } from '../setups'
import { BrandMark } from './BrandMark'
import { useDialogFocus } from './DialogFocus'
import '../site.css'
import '../site-demo-video.css'
import '../site-interactions.css'

type Copy = {
  nav: [string, string, string, string, string, string, string]
  open: string
  eyebrow: string
  title: [string, string, string]
  intro: string
  proof: string[]
  demoLink: string
  demoTitle: string
  demoBody: string
  demoSteps: Array<[string, string]>
  demoControls: { play: string; pause: string; replay: string; progress: string; shortcuts: string }
  mode: { title: string; body: string; close: string; simpleTitle: string; simpleBody: string; simpleCta: string; proTitle: string; proBody: string; proCta: string }
  compareTitle: string
  compareBody: string
  compareBefore: string
  compareAfter: string
  compareHint: string
  release: { title: string; status: string; statusBody: string; updated: string; updatedBody: string; included: string; includedBody: string; showcase: string; showcaseBody: string }
  audienceTitle: string
  audienceBody: string
  audiences: Array<[string, string]>
  methodTitle: string
  methodBody: string
  methodPoints: Array<[string, string]>
  midCtaTitle: string
  midCtaBody: string
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
    nav: ['功能', '流程', '成果', '最新', '範例', '常見問題', '支援'], open: '免費開啟攝影棚', eyebrow: '給攝影師與攝影學習者的 3D 攝影棚',
    title: ['進棚拍攝前', '先排好燈位', '再決定畫面'],
    intro: 'LUMEN STAGE 讓你在瀏覽器裡安排燈位、相機、人物與背景，用真實距離與鏡頭參數預演下一次拍攝。',
    proof: ['免安裝', '免帳號', '場景留在你的裝置'], instrument: '不是示意圖 是可以工作的攝影工具',
    demoLink: '觀看 15 秒操作流程', demoTitle: '十五秒 從空白想法到可拍攝的方案', demoBody: '同一個即時場景裡主燈＋補光、取景、比較與輸出，不用在紙上猜測每一次調整。',
    demoSteps: [['選擇配置', '從經典布光開始。'], ['安排主體', '確認人物位置與姿勢。'], ['移動燈位', '調整距離、角度與功率。'], ['確認相機', '檢查焦段、光圈與取景。'], ['檢視平面配置', '從上方確認人、燈與相機位置。'], ['匯出到現場', '儲存並輸出燈位工作表。']],
    demoControls: { play: '播放', pause: '暫停', replay: '重新播放', progress: '操作影片進度', shortcuts: '快捷鍵：左右箭頭前後移動，空白鍵播放或暫停' },
    mode: { title: '選擇你的工作方式', body: '兩種模式使用同一個場景格式，隨時可以切換。', close: '關閉模式選擇', simpleTitle: '簡易模式', simpleBody: '適合第一次使用、攝影學習與手機觸控操作。精簡人物、燈光、相機與配置控制，在小螢幕上也能輕鬆調整。', simpleCta: '開啟簡易版', proTitle: '專業模式', proBody: '完整燈光、相機、測光、連戲、預設與匯出控制。', proCta: '開啟專業版' },
    compareTitle: '不只看介面 直接比較畫面結果', compareBody: '同一位男性、同一個構圖，拖曳比較單燈基礎光與主燈、補光全開的主燈＋補光。', compareBefore: '基礎光', compareAfter: '主燈＋補光', compareHint: '拖曳以比較佈光前後',
    release: { title: '現在就能使用 也會持續改善', status: '公開測試中', statusBody: '網站可直接開啟，不需申請邀請。', updated: '最近更新', updatedBody: '首頁流程案例、受眾與模擬說明。', included: '免費版包含', includedBody: '15 組配置、簡易／專業工作區、本機儲存、備份與分享。', showcase: '產品展示 Repo', showcaseBody: '查看英文產品介紹、功能重點與精選畫面，不包含原始碼。' },
    audienceTitle: '給需要在開拍前先把決定說清楚的人', audienceBody: '不論你是在學習佈光、準備個人拍攝，或需要讓團隊看懂同一份計畫，都可以從相同場景開始。', audiences: [['攝影師', '在進棚前確認燈位、鏡頭與構圖。'], ['攝影助理', '把距離、方向與器材配置整理成可執行資訊。'], ['攝影學習者', '用即時畫面理解每次調整如何改變結果。'], ['前期製作團隊', '在拍攝前共享一致的視覺與空間方案。']],
    methodTitle: '它是規劃工具 不是假裝取代現場', methodBody: 'LUMEN STAGE 使用攝影常用的距離、焦段、光圈、照度與色溫建立可比較的預演；最終曝光、顏色與安全仍以現場器材和測量為準。', methodPoints: [['物理估算', '距離、光線衰減、鏡頭與景深用一致的參數關係計算。'], ['視覺預覽', '算圖用來比較方向、比例與相對差異，不是校色或測光證明。'], ['現場確認', '正式拍攝仍需使用實際燈具、相機、測光表與安全規範。']],
    midCtaTitle: '先載入一組配置 再把它改成你的拍攝', midCtaBody: '不用從空白場景開始；選擇簡易或專業模式，所有範例都能繼續調整。',
    setupsTitle: '不要從零開始 先點亮一組經典配置', setupsBody: '每組範例都會直接載入人物、燈光、相機與背景；你可以從可工作的基礎上繼續調整。', setupCta: '載入這組燈位',
    setupNames: { rembrandt: ['林布蘭光', '45° 高位主光，在遠側臉頰留下標誌性的光三角。'], 'three-point': ['三點布光', '主光、補光與逆光組成清楚、可靠的訪談配置。'], clamshell: ['蚌殼光', '鏡頭軸線上下各一盞光，適合美容與妝髮畫面。'] },
    outcomeTitle: '一個場景 留下三種能帶走的成果', outcomeBody: '規劃不只停在畫面裡。從空間配置到最後取景，再把有效決策整理成現場可讀的資料。', outcomes: [['燈位配置', '看清人物、燈具、相機與背景之間的空間關係。'], ['畫面預演', '在拍攝前確認光線方向、景深與構圖。'], ['拍攝交接', '保存、分享並輸出燈位工作表，讓團隊照著執行。']],
    trustTitle: '為真正的拍攝準備 而不是只做漂亮示意圖', trust: [['內建經典配置', '以可直接調整的燈位、相機與背景參數建立。'], ['真實攝影語言', '支援距離、焦段、光圈、照度、色溫與塑光附件。'], ['本機優先', '免帳號、無廣告追蹤；專案預設留在你的瀏覽器。'], ['免費使用', '不需信用卡，開啟網站即可開始規劃。'], ['簡易與專業模式', '可從簡易介面開始，也能切換完整專業控制。']],
    instrumentBody: '人物、佈光、相機、配置四個模式共用同一個即時場景。桌機負責精準控制與預設管理，手機保留人物、燈光、取景與物件定位的核心操作。',
    capabilities: [['把抽象燈位變成空間', '以公尺、角度、照度與塑光附件建立可重現的配置。'], ['在拍攝前確認鏡頭', '切換片幅、焦段、光圈、景深與構圖，降低現場試錯。'], ['把方案帶到片場', '儲存、備份、分享場景並輸出燈位工作表與成品預覽。']],
    galleryTitle: '每一個決定 都看得到它對畫面的影響', galleryBody: '介面會跟著目前工作切換，但燈光、相機與空間位置始終留在同一個場景中。',
    gallery: [['佈光', '逐盞調整功率、角度、距離、色溫與塑光附件。'], ['相機', '用實際焦段、曝光與取景框確認最終照片。'], ['配置', '從俯視畫面精確安排人物、燈具、相機與背景。']],
    workflowTitle: '從虛擬規劃 到現場能照著執行', workflow: [['規劃空間', '先安排人物、燈具、相機與背景的相對位置。'], ['預演畫面', '用焦段、光圈、曝光與高畫質算圖比較拍攝方向。'], ['帶到現場', '保存有效決策並匯出燈位工作表，讓團隊快速重現。']],
    localTitle: 'Local-first 不把你的場景當成資料來源', localBody: '專案預設儲存在你的瀏覽器，沒有帳號、廣告或行為追蹤。只有匿名技術錯誤會送出，且不包含場景與照片。',
    finalTitle: '下一次拍攝 先在 LUMEN STAGE 裡亮燈', finalBody: '免費、免安裝、免信用卡。現在就從一組燈位開始。', faqTitle: '正式開拍前 先回答幾個問題',
    faq: [['需要安裝嗎？', '不用。現代瀏覽器與支援 WebGL 的裝置即可使用。'], ['手機和桌機一樣嗎？', '共用同一種場景格式；手機保留排光、人物、相機與拍照的核心流程，桌機提供完整控制。'], ['場景會上傳嗎？', '不會。場景與匯入素材預設留在你的瀏覽器。'], ['可以分享嗎？', '可以。分享連結會把壓縮後的場景放在網址中，不需要帳號。'], ['能取代現場測光嗎？', '不能。它是規劃與溝通工具；正式拍攝仍應以現場器材與測光為準。'], ['需要付費嗎？', '目前公開版本可直接使用，不需要信用卡。']],
    privacyTitle: '隱私說明', privacyBody: ['LUMEN STAGE 不要求帳號，也不使用廣告追蹤或行為分析 cookie。', '場景、偏好、匯入素材與照片預設保存在你的瀏覽器。清除網站資料可能移除這些內容，因此請定期匯出備份。', '為了發現當機，網站可能送出匿名技術錯誤，包括錯誤訊息、程式位置、頁面路徑與版本；不包含場景內容、照片、專案名稱或匯入檔案。', '你主動送出的回饋與選填聯絡信箱，會透過 Web3Forms 寄送服務交給創作者，僅供回覆與產品改善。', '網站由 Vercel 與 GitHub 提供服務，供應商可能依其政策處理必要的網路與部署紀錄。'],
    termsTitle: '使用條款', termsBody: ['LUMEN STAGE 以現況提供，供攝影規劃、教育與視覺溝通使用。', '模擬結果會受到瀏覽器、螢幕、GPU、器材差異與環境條件影響，不構成曝光、色彩或安全保證；實際拍攝請以現場測量與器材規範為準。', '使用者應保留重要專案的匯出備份，並對匯入素材與分享內容擁有適當權利。', '介面、品牌與原創內容版權屬 YuYing；未經許可不得重製或重新散布原始碼與品牌資產。'],
    supportTitle: '支援與回報', supportBody: ['遇到載入、儲存、算圖或裝置相容問題時，請先重新載入網站，並確認瀏覽器已更新。', '「建立問題回報」會先開啟一份可檢查的草稿；請補上發生情況與重現步驟，確認內容後再自行送出。', '草稿只會填入 LUMEN STAGE 版本、目前頁面、畫面尺寸與瀏覽器版本，不會讀取或附上場景、照片、專案名稱或匯入檔案。', 'LUMEN STAGE 目前由 YuYing 維護。請勿在公開回報中加入私人照片或未公開專案檔。'], issues: '建立問題回報', back: '返回首頁',
  },
  en: {
    nav: ['Capabilities', 'Workflow', 'Outcomes', 'Latest', 'Setups', 'FAQ', 'Support'], open: 'Open the studio free', eyebrow: 'A 3D studio for photographers and learners',
    title: ['Plan the light.', 'Frame the shot.', 'Before the shoot.'], intro: 'LUMEN STAGE lets you arrange lights, camera, subject and backdrop with real distances and lens settings—right in your browser.',
    proof: ['No install', 'No account', 'Scenes stay on your device'], instrument: 'Not a mock-up. A working photographic instrument.', instrumentBody: 'Person, Light, Camera and Layout share one live scene. Desktop adds precise control and preset management; phone keeps the essential subject, lighting, framing and object-position tools.',
    demoLink: 'Watch the 15-second workflow', demoTitle: 'From a blank idea to a shootable plan in fifteen seconds.', demoBody: 'Light, frame, compare and hand off from one live scene instead of guessing what every adjustment will do.', demoSteps: [['Choose a setup', 'Start with a classic lighting pattern.'], ['Place the subject', 'Confirm position and pose.'], ['Move the lights', 'Tune distance, angle and output.'], ['Confirm the camera', 'Check focal length, aperture and frame.'], ['Review the layout', 'See subject, lights and camera from above.'], ['Export for set', 'Save and export a setup sheet.']],
    demoControls: { play: 'Play', pause: 'Pause', replay: 'Replay', progress: 'Demo video progress', shortcuts: 'Shortcuts: left and right arrows to seek, Space to play or pause' },
    mode: { title: 'Choose your workspace', body: 'Both modes use the same scene format, so you can switch at any time.', close: 'Close mode chooser', simpleTitle: 'Simple mode', simpleBody: 'For beginners, photography learners and mobile touch controls. Essential subject, light, camera and layout settings stay easy to adjust on a small screen.', simpleCta: 'Open simple mode', proTitle: 'Professional mode', proBody: 'Complete lighting, camera, metering, continuity, preset and export controls.', proCta: 'Open professional mode' },
    compareTitle: 'Compare the picture, not just the interface.', compareBody: 'With the same male subject and framing, drag the split to compare a single-light base with the finished key-and-fill setup.', compareBefore: 'Base light', compareAfter: 'Key + fill', compareHint: 'Drag to compare the lighting',
    release: { title: 'Ready to use, and still improving.', status: 'Public beta', statusBody: 'Open the site directly. No invitation or application required.', updated: 'Latest update', updatedBody: 'Homepage workflow case, audience and simulation notes.', included: 'Free version includes', includedBody: '15 setups, simple and pro workspaces, local saves, backups and sharing.', showcase: 'Product showcase', showcaseBody: 'View the English product overview, feature highlights and selected visuals. Source code is not included.' },
    audienceTitle: 'For anyone who needs the decisions clear before call time.', audienceBody: 'Learn light, prepare a personal shoot, or align a crew around one shared scene before equipment reaches the set.', audiences: [['Photographers', 'Confirm lighting, lens and composition before entering the studio.'], ['Photo assistants', 'Turn distance, direction and equipment placement into an actionable plan.'], ['Photography learners', 'See how each adjustment changes the image in real time.'], ['Pre-production teams', 'Share one visual and spatial plan before the shoot.']],
    methodTitle: 'A planning instrument, not a substitute for the set.', methodBody: 'LUMEN STAGE uses photographic distance, focal length, aperture, illuminance and colour temperature for consistent previews. Final exposure, colour and safety still depend on real equipment and on-set measurement.', methodPoints: [['Physical estimates', 'Distance, falloff, lens and depth of field follow a consistent parameter model.'], ['Visual preview', 'Renders compare direction, proportion and relative change; they are not a colour or meter certificate.'], ['On-set verification', 'Confirm the final setup with real lights, camera, meter and safety practice.']],
    midCtaTitle: 'Load a proven setup, then make it yours.', midCtaBody: 'Skip the empty scene. Choose Simple or Professional mode and keep adjusting every example.',
    setupsTitle: 'Do not start from zero. Light a proven pattern first.', setupsBody: 'Each example loads its subject, lights, camera and backdrop so you can begin with a working foundation.', setupCta: 'Load this setup', setupNames: { rembrandt: ['Rembrandt light', 'A high 45° key leaves the signature triangle on the far cheek.'], 'three-point': ['Three-point light', 'Key, fill and back light form a clear, dependable interview setup.'], clamshell: ['Clamshell beauty', 'Two sources on the lens axis create clean beauty and makeup light.'] },
    outcomeTitle: 'One scene. Three useful outcomes.', outcomeBody: 'The plan does not stay trapped on screen. Move from spatial layout to the final frame, then package the decisions for set.', outcomes: [['Lighting layout', 'Understand the spatial relationship between subject, lights, camera and backdrop.'], ['Frame preview', 'Confirm direction, depth of field and composition before the shoot.'], ['Crew handoff', 'Save, share and export a setup sheet the crew can follow.']],
    trustTitle: 'Built for real shoot preparation, not just a pretty diagram.', trust: [['Classic setups included', 'Every pattern comes with editable light, camera and backdrop settings.'], ['Photographic language', 'Work with distance, focal length, aperture, illuminance, colour and modifiers.'], ['Local-first', 'No account or ad tracking; projects stay in your browser by default.'], ['Free to use', 'No credit card required. Open the site and start planning.'], ['Simple and Pro modes', 'Start with a simple interface, then switch to full professional controls.']],
    capabilities: [['Turn diagrams into space', 'Build repeatable setups with metres, angles, illuminance and real modifiers.'], ['Confirm the lens before call time', 'Compare sensor, focal length, aperture, depth of field and composition before the shoot.'], ['Carry the plan to set', 'Save, back up and share scenes, then export a lighting sheet and frame preview.']],
    galleryTitle: 'See what every decision changes.', galleryBody: 'The controls change with the job at hand, while light, camera and spatial placement remain in one continuous scene.',
    gallery: [['Light', 'Tune output, angle, distance, colour and modifiers one light at a time.'], ['Camera', 'Confirm the photograph with real focal length, exposure and framing controls.'], ['Layout', 'Place subject, lights, camera and backdrop precisely from the plan view.']],
    workflowTitle: 'From virtual planning to a setup the crew can follow.', workflow: [['Plan the space', 'Arrange the subject, lights, camera and backdrop in measurable positions.'], ['Preview the frame', 'Compare focal length, aperture, exposure and a high-quality render.'], ['Take it to set', 'Keep the useful decisions and export a lighting sheet the crew can rebuild.']],
    localTitle: 'Local-first. Your scene is not our dataset.', localBody: 'Projects stay in your browser by default. There are no accounts, ads or behaviour analytics. Anonymous technical errors may be sent without scene or photo data.', finalTitle: 'Light your next shoot in LUMEN STAGE first.', finalBody: 'Free to use, with no install and no card. Start with one lighting setup now.', faqTitle: 'A few answers before call time.',
    faq: [['Do I install anything?', 'No. Use a modern browser on a device that supports WebGL.'], ['Are phone and desktop the same?', 'They share the same scene format. Phone keeps the essential lighting and framing flow; desktop provides complete control.'], ['Are scenes uploaded?', 'No. Scenes and imported assets stay in your browser by default.'], ['Can I share a setup?', 'Yes. A compressed scene travels inside the share URL, with no account required.'], ['Does it replace a light meter?', 'No. It is a planning and communication tool; use real equipment and measurements on set.'], ['Does it cost anything?', 'The current public release is available without a card.']],
    privacyTitle: 'Privacy', privacyBody: ['LUMEN STAGE requires no account and uses no advertising trackers, behaviour analytics or analytics cookies.', 'Scenes, preferences, imported assets and photos stay in your browser by default. Clearing site data can remove them, so export important backups.', 'To detect crashes, anonymous technical errors may include an error message, code location, route and release. They exclude scenes, photos, project names and imported files.', 'Feedback you choose to submit, including an optional reply email, is forwarded to the creator through Web3Forms for replies and product improvements.', 'Vercel and GitHub provide hosting and source services and may process necessary network and deployment logs under their own policies.'],
    termsTitle: 'Terms of use', termsBody: ['LUMEN STAGE is provided as-is for photographic planning, education and visual communication.', 'Simulation results vary with browsers, displays, GPUs, equipment and physical conditions. They are not an exposure, colour or safety guarantee; verify with real equipment on set.', 'Keep exported backups of important work and hold the appropriate rights to imported and shared material.', 'The interface, brand and original content are © YuYing. Source and brand assets may not be redistributed without permission.'],
    supportTitle: 'Support', supportBody: ['For loading, storage, rendering or compatibility problems, reload first and confirm your browser is current.', '“Create an issue report” opens a draft you can review. Add what happened and the steps to reproduce, then submit it yourself when the content is ready.', 'The draft includes only the LUMEN STAGE version, current page, viewport and browser version. It does not read or attach scenes, photographs, project names or imported files.', 'LUMEN STAGE is maintained by YuYing. Do not include private photographs or unreleased project files in a public report.'], issues: 'Create an issue report', back: 'Back to home',
  },
  ja: {
    nav: ['機能', '工程', '成果', '更新', 'セット例', 'FAQ', 'サポート'], open: '無料でスタジオを開く', eyebrow: '撮影者と学習者のための 3D スタジオ',
    title: ['撮影の前に', '光を整え', '構図を決める'], intro: 'LUMEN STAGE はライト、カメラ、人物、背景を、実際の距離とレンズ設定でブラウザ上に組み立てる撮影設計ツールです。',
    proof: ['インストール不要', 'アカウント不要', 'シーンは端末内に保存'], instrument: 'イメージ図ではなく、実際に操作できる撮影ツール。', instrumentBody: '人物、照明、カメラ、配置の 4 モードが 1 つのライブシーンを共有。デスクトップは精密操作とプリセット管理、スマートフォンは人物・照明・構図・位置の中核操作に対応します。',
    demoLink: '15 秒の操作を見る', demoTitle: '十五秒で、アイデアを撮影可能なプランへ。', demoBody: '1 つのライブシーンで照明、構図、比較、書き出しまで行い、調整の結果を画面で確認できます。', demoSteps: [['セットを選ぶ', '定番の照明から開始。'], ['主体を配置', '位置とポーズを確認。'], ['ライトを動かす', '距離、角度、出力を調整。'], ['カメラを確認', '焦点距離、絞り、フレームを確認。'], ['レイアウトを確認', '主体、ライト、カメラを上から確認。'], ['現場用に書き出す', '保存してセットアップ表を書き出し。']],
    demoControls: { play: '再生', pause: '一時停止', replay: '最初から再生', progress: 'デモ動画の進行', shortcuts: 'ショートカット：左右矢印で移動、Space で再生／一時停止' },
    mode: { title: 'ワークスペースを選ぶ', body: 'どちらも同じシーン形式を使い、いつでも切り替えられます。', close: 'モード選択を閉じる', simpleTitle: 'シンプルモード', simpleBody: '初めての方や写真学習、スマートフォンのタッチ操作に。人物、ライト、カメラ、配置の操作を絞り、小さな画面でも調整しやすく。', simpleCta: 'シンプル版を開く', proTitle: 'プロモード', proBody: '照明、カメラ、測光、連続性、プリセット、書き出しの全操作。', proCta: 'プロ版を開く' },
    compareTitle: 'インターフェースではなく、写真の結果を比較。', compareBody: '同じ男性モデルと構図で、単灯の基礎照明とキー・フィルを使ったキー＋フィルを比較できます。', compareBefore: '基礎照明', compareAfter: 'キー＋フィル', compareHint: 'ドラッグして照明を比較',
    release: { title: '今すぐ使え、継続して改善中。', status: '公開ベータ', statusBody: '招待や申請なしで直接開けます。', updated: '最終更新', updatedBody: 'ホームの工程例、対象者、シミュレーション説明。', included: '無料版に含まれるもの', includedBody: '15 セット、シンプル／プロ画面、ローカル保存、バックアップ、共有。', showcase: '製品ショーケース', showcaseBody: '英語の製品紹介、機能概要、選定ビジュアルを掲載。ソースコードは含みません。' },
    audienceTitle: '撮影前に判断を明確にしたいすべての人へ。', audienceBody: '照明を学ぶ人、個人撮影を準備する人、同じプランを共有するチームが、1 つのシーンから始められます。', audiences: [['フォトグラファー', 'スタジオ入り前に照明、レンズ、構図を確認。'], ['撮影アシスタント', '距離、方向、機材配置を実行可能な情報に整理。'], ['写真学習者', '各調整が画像をどう変えるかリアルタイムで理解。'], ['プリプロダクション', '撮影前に共通の視覚・空間プランを共有。']],
    methodTitle: '現場を置き換えるのではなく、準備を強くする道具。', methodBody: 'LUMEN STAGE は距離、焦点距離、絞り、照度、色温度で一貫したプレビューを作ります。最終露出、色、安全性は実機材と現場測定で確認してください。', methodPoints: [['物理的な推定', '距離、減衰、レンズ、被写界深度を一貫したパラメータで計算。'], ['視覚プレビュー', '方向、比率、相対変化を比較するための表示で、測光・色校正の証明ではありません。'], ['現場での確認', '実際のライト、カメラ、露出計、安全基準で最終セットを確認。']],
    midCtaTitle: '定番セットを読み込み、自分の撮影へ。', midCtaBody: '空のシーンから始めず、シンプル／プロを選び、すべての例をそのまま調整できます。',
    setupsTitle: 'ゼロから始めず、定番の照明を点ける。', setupsBody: '人物、ライト、カメラ、背景をまとめて読み込み、すぐに調整できる状態から始められます。', setupCta: 'このセットを読み込む', setupNames: { rembrandt: ['レンブラント光', '45° の高いキーで、反対側の頬に特徴的な三角形を作ります。'], 'three-point': ['三点照明', 'キー、フィル、バックライトによる安定したインタビュー照明。'], clamshell: ['クラムシェル', 'レンズ軸の上下 2 灯で、美容・メイク向けの光を作ります。'] },
    outcomeTitle: '1 つのシーンから、3 つの成果を持ち出す。', outcomeBody: '空間配置から最終フレームを確認し、撮影現場で使える情報として整理できます。', outcomes: [['照明配置', '人物、ライト、カメラ、背景の空間関係を確認。'], ['画面プレビュー', '撮影前に光の方向、被写界深度、構図を確認。'], ['チーム共有', '保存、共有、照明シートの書き出しで現場へ引き継ぎ。']],
    trustTitle: '美しい図ではなく、本番の準備のために。', trust: [['定番セットを収録', 'ライト、カメラ、背景の値をすべて編集できます。'], ['写真の実用単位', '距離、焦点距離、絞り、照度、色温度、モディファイアに対応。'], ['Local-first', 'アカウント・広告追跡なし。プロジェクトはブラウザ内に保存。'], ['無料で利用', 'クレジットカード不要。サイトを開いてすぐ開始。'], ['シンプル・プロ両対応', 'シンプル表示から始め、必要に応じてプロ向け操作へ切り替え。']],
    capabilities: [['照明図を空間にする', '距離、角度、照度、モディファイアで再現可能なセットを設計。'], ['撮影前にレンズを決める', 'センサー、焦点距離、絞り、被写界深度、構図を比較。'], ['プランを現場へ持ち出す', 'シーンを保存、バックアップ、共有し、照明シートを出力。']],
    galleryTitle: 'すべての判断を、画で確認。', galleryBody: '作業に合わせて操作は変わっても、光、カメラ、空間配置は 1 つのシーンに残ります。',
    gallery: [['照明', 'ライトごとに出力、角度、距離、色、モディファイアを調整。'], ['カメラ', '実際の焦点距離、露出、フレームで最終写真を確認。'], ['配置', '俯視表示から人物、ライト、カメラ、背景を正確に配置。']],
    workflowTitle: 'バーチャル設計から、現場で再現できるセットへ。', workflow: [['空間を設計', '人物、ライト、カメラ、背景を測定可能な位置に配置。'], ['画面をプレビュー', '焦点距離、絞り、露出、高品質レンダーを比較。'], ['現場へ持ち出す', '有効な判断を保存し、チームが再現できる照明シートを書き出す。']],
    localTitle: 'Local-first。シーンを学習データにしません。', localBody: 'プロジェクトはブラウザ内に保存され、アカウント、広告、行動解析はありません。匿名の技術エラーのみ、シーンや写真を含めず送信される場合があります。', finalTitle: '次の撮影は、まず LUMEN STAGE で点灯。', finalBody: '無料、インストール不要、カード不要。今すぐ 1 つの照明から始めましょう。', faqTitle: '撮影前によくある質問。',
    faq: [['インストールは必要ですか？', '不要です。WebGL 対応のモダンブラウザで利用できます。'], ['スマホとデスクトップは同じですか？', '同じシーン形式を使います。スマホは中核フロー、デスクトップは全機能を提供します。'], ['シーンはアップロードされますか？', 'いいえ。シーンと素材は既定でブラウザ内に残ります。'], ['共有できますか？', 'はい。圧縮シーンを URL に含めるため、アカウント不要です。'], ['露出計の代わりになりますか？', 'いいえ。計画と共有のためのツールです。本番では実機で確認してください。'], ['料金はかかりますか？', '現在の公開版はカードなしで利用できます。']],
    privacyTitle: 'プライバシー', privacyBody: ['LUMEN STAGE はアカウント不要で、広告追跡、行動解析、解析 Cookie を使用しません。', 'シーン、設定、素材、写真は既定でブラウザ内に保存されます。サイトデータを削除すると失われるため、重要なデータは書き出してください。', '障害検知のため、エラー内容、コード位置、ページ、版を含む匿名技術エラーを送る場合があります。シーン、写真、プロジェクト名、素材は含みません。', '送信したご意見と任意のメールアドレスは、Web3Forms を通じて制作者に届き、返信と製品改善に使用されます。', 'Vercel と GitHub がサービスを提供し、各ポリシーに従って必要なネットワーク・配備ログを処理する場合があります。'],
    termsTitle: '利用規約', termsBody: ['LUMEN STAGE は撮影計画、教育、視覚コミュニケーション向けに現状のまま提供されます。', '結果はブラウザ、画面、GPU、機材、現場条件で変わり、露出、色、安全を保証しません。本番では実機で確認してください。', '重要な作業は書き出して保管し、読み込み・共有する素材の権利を確保してください。', 'UI、ブランド、オリジナルコンテンツの著作権は YuYing に帰属します。'],
    supportTitle: 'サポート', supportBody: ['読み込み、保存、レンダリング、互換性の問題は、再読み込みとブラウザ更新を最初に確認してください。', '「問題を報告」を押すと、送信前に確認できる下書きが開きます。発生内容と再現手順を追記し、内容を確認してからご自身で送信してください。', '下書きに入るのは LUMEN STAGE のバージョン、現在のページ、画面サイズ、ブラウザ版だけです。シーン、写真、プロジェクト名、読み込みファイルは取得も添付もしません。', 'LUMEN STAGE は YuYing が管理しています。公開報告には非公開の写真やプロジェクトを含めないでください。'], issues: '問題を報告', back: 'ホームへ戻る',
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

const DEMO_VIDEOS: Record<Locale, { src: string; mobile: string; poster: string }> = {
  zh: { src: assetHref('site-demo/zh.mp4'), mobile: assetHref('site-demo/zh-mobile.mp4'), poster: assetHref('site-demo/zh.jpg') },
  en: { src: assetHref('site-demo/en.mp4'), mobile: assetHref('site-demo/en-mobile.mp4'), poster: assetHref('site-demo/en.jpg') },
  ja: { src: assetHref('site-demo/ja.mp4'), mobile: assetHref('site-demo/ja-mobile.mp4'), poster: assetHref('site-demo/ja.jpg') },
}

const DEMO_LIVE_LABEL: Record<Locale, string> = {
  zh: '即時場景',
  en: 'LIVE SCENE',
  ja: 'ライブシーン',
}


const TRUST_MARKS = ['15', '1:1', 'LOCAL', 'FREE', '2 MODES'] as const

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

function ScreenshotCrop({ src, size, crop, id, label }: { src: string; size: [number, number]; crop: [number, number, number, number]; id: string; label: string }) {
  return <svg viewBox={crop.join(' ')} width={crop[2]} height={crop[3]} preserveAspectRatio="xMidYMid slice" role="img" aria-label={label}><defs><clipPath id={id}><rect x={crop[0]} y={crop[1]} width={crop[2]} height={crop[3]} /></clipPath></defs><image href={assetHref(src)} width={size[0]} height={size[1]} clipPath={`url(#${id})`} /></svg>
}

function SiteHeader({ copy, onOpenStudio }: { copy: Copy; onOpenStudio?: () => void }) {
  const home = routeHref('home')
  const sectionHref = (id: string) => onOpenStudio ? `#${id}` : `${home}#${id}`
  const links = <><a href={sectionHref('capabilities')}>{copy.nav[0]}</a><a href={sectionHref('setups')}>{copy.nav[4]}</a><a href={sectionHref('workflow')}>{copy.nav[1]}</a><a href={sectionHref('outcomes')}>{copy.nav[2]}</a><a href={sectionHref('release')}>{copy.nav[3]}</a><a href={sectionHref('faq')}>{copy.nav[5]}</a><a href={routeHref('support')}>{copy.nav[6]}</a></>
  return <header className="site-header"><div className="site-header-shell"><a className="site-brand" href={home} aria-label="Lumen Stage home"><BrandMark /><span><b>LUMEN</b><small>STAGE / WEB</small></span></a><nav aria-label="Primary">{links}</nav><details className="site-menu"><summary aria-label="Navigation">☰</summary><nav aria-label="Mobile" onClick={(event) => { if ((event.target as HTMLElement).closest('a')) event.currentTarget.parentElement?.removeAttribute('open') }}>{links}</nav></details><div className="site-actions"><LocaleSwitch />{onOpenStudio ? <button className="site-cta compact" type="button" onClick={onOpenStudio}><span>{copy.open}</span><b aria-hidden="true">↗</b></button> : <a className="site-cta compact" href={studioHref()}><span>{copy.open}</span><b aria-hidden="true">↗</b></a>}</div></div></header>
}

function SiteFooter({ copy }: { copy: Copy }) {
  return <footer className="site-footer"><span>© {new Date().getFullYear()} YuYing · LUMEN STAGE</span><nav><a href={routeHref('privacy')}>{copy.privacyTitle}</a><a href={routeHref('terms')}>{copy.termsTitle}</a><a href={routeHref('support')}>{copy.supportTitle}</a><a href="https://github.com/clark970417-eng" target="_blank" rel="noreferrer" aria-label="YuYing on GitHub">GitHub</a><a href="https://x.com/4yuying" target="_blank" rel="noreferrer" aria-label="YuYing on X">X</a></nav></footer>
}

const RELEASE_VERSION = '0.1.0'

function reportIssueHref(locale: Locale) {
  const labels = {
    zh: { title: '[問題回報] ', intro: '請描述發生了什麼，以及可以如何重現：', environment: '自動填入的技術資訊（送出前可刪除）', privacy: '此草稿不包含場景、照片、專案名稱或匯入檔案。' },
    en: { title: '[Issue] ', intro: 'Describe what happened and how to reproduce it:', environment: 'Automatically added technical details (remove any line before submitting)', privacy: 'This draft does not contain scenes, photographs, project names or imported files.' },
    ja: { title: '[問題報告] ', intro: '発生内容と再現手順を記入してください：', environment: '自動入力された技術情報（送信前に削除できます）', privacy: 'この下書きにはシーン、写真、プロジェクト名、読み込みファイルは含まれません。' },
  }[locale]
  const body = [labels.intro, '', '', `## ${labels.environment}`, `- LUMEN STAGE: ${RELEASE_VERSION}`, `- Page: ${location.pathname}`, `- Viewport: ${window.innerWidth} × ${window.innerHeight}`, `- Browser: ${navigator.userAgent}`, '', labels.privacy].join('\n')
  const params = new URLSearchParams({ title: labels.title, body })
  return `https://github.com/clark970417-eng/lumen-stage-showcase/issues/new?${params}`
}

function FeedbackSection({ locale }: { locale: Locale }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const copy = {
    zh: { title: '下一版，想讓它更適合你。', body: '哪裡不好操作？希望多什麼功能？把你的使用感受告訴 YuYing。', message: '你的回饋', email: '聯絡信箱（選填）', hint: '希望收到回覆時再填寫。', send: '送出回饋', sending: '正在送出…', success: '回饋已送出，謝謝你的分享！', error: '目前無法送出，內容已保留，請稍後重試。', note: '免登入，可以匿名。回饋只會用於改善 Lumen Stage。' },
    en: { title: 'Help shape the next version.', body: 'Something feels awkward? Missing a feature? Tell YuYing how it went.', message: 'Your feedback', email: 'Email (optional)', hint: 'Leave an email if you would like a reply.', send: 'Send feedback', sending: 'Sending…', success: 'Feedback sent. Thank you for sharing!', error: 'Could not send. Your message is still here; please try again later.', note: 'No sign-in needed. Anonymous feedback is welcome and used to improve Lumen Stage.' },
    ja: { title: '次のバージョンを、一緒に。', body: '使いにくいところや欲しい機能を、YuYing に教えてください。', message: 'フィードバック', email: 'メールアドレス（任意）', hint: '返信をご希望の場合のみご入力ください。', send: '送信する', sending: '送信中…', success: '送信しました。ありがとうございます！', error: '送信できませんでした。入力内容は残っています。後でもう一度お試しください。', note: 'ログイン不要・匿名で送信できます。ご意見は Lumen Stage の改善に使用します。' },
  }[locale]
  return <section className="site-feedback" id="feedback" aria-labelledby="feedback-title">
    <div className="feedback-intro"><span>FEEDBACK / V1</span><h2 id="feedback-title">{copy.title}</h2><p>{copy.body}</p><small>{copy.note}</small></div>
    <form className="feedback-form" onSubmit={async (event) => {
      event.preventDefault()
      if (status === 'sending') return
      const form = event.currentTarget
      const data = new FormData(form)
      setStatus('sending')
      try {
        const message = String(data.get('message') ?? '').trim()
        if (!message || data.get('website')) throw new Error('Invalid feedback')
        const configResponse = await fetch('/api/feedback', { signal: AbortSignal.timeout(10000) })
        const config = await configResponse.json()
        if (!configResponse.ok || typeof config.accessKey !== 'string' || !config.accessKey) throw new Error('Feedback unavailable')
        const email = String(data.get('email') ?? '').trim()
        const response = await fetch('https://api.web3forms.com/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ access_key: config.accessKey, message, ...(email ? { email } : {}), locale, subject: 'Lumen Stage — website feedback', from_name: 'Lumen Stage' }), signal: AbortSignal.timeout(20000) })
        const result = await response.json()
        if (!response.ok || result.success !== true) throw new Error('Feedback unavailable')
        form.reset()
        setStatus('success')
      } catch { setStatus('error') }
    }}>
      <label htmlFor="feedback-message">{copy.message}</label>
      <textarea id="feedback-message" name="message" required minLength={1} maxLength={4000} rows={5} disabled={status === 'sending'} />
      <label htmlFor="feedback-email">{copy.email}</label>
      <small id="feedback-email-hint">{copy.hint}</small>
      <input id="feedback-email" name="email" type="email" maxLength={254} autoComplete="email" aria-describedby="feedback-email-hint" disabled={status === 'sending'} />
      <div className="feedback-trap" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <button className="site-cta" type="submit" disabled={status === 'sending'}>{status === 'sending' ? copy.sending : copy.send}</button>
      <p className="feedback-status" role="status" aria-live="polite">{status === 'success' ? copy.success : status === 'error' ? copy.error : ''}</p>
    </form>
  </section>
}

function LegalPage({ route, copy, locale }: { route: Exclude<PublicRoute, 'home' | 'studio'>; copy: Copy; locale: Locale }) {
  const title = route === 'privacy' ? copy.privacyTitle : route === 'terms' ? copy.termsTitle : copy.supportTitle
  const paragraphs = route === 'privacy' ? copy.privacyBody : route === 'terms' ? copy.termsBody : copy.supportBody
  return <><SiteHeader copy={copy} /><main className="legal-page"><span>LUMEN STAGE / {route.toUpperCase()}</span><h1>{title}</h1><div>{paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>{route === 'support' && <a className="site-cta" href={reportIssueHref(locale)} target="_blank" rel="noreferrer"><span>{copy.issues}</span><b aria-hidden="true">↗</b></a>}<a className="legal-back" href={routeHref('home')}>← {copy.back}</a></main><SiteFooter copy={copy} /></>
}

function ModeChooser({ copy, onClose }: { copy: Copy; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null)
  useDialogFocus(panel, true, onClose)
  return <div className="mode-gate" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={panel} className="mode-gate-panel" role="dialog" aria-modal="true" aria-labelledby="mode-gate-title">
      <button className="mode-gate-close" type="button" onClick={onClose} aria-label={copy.mode.close}>×</button>
      <header><span>CHOOSE / WORKSPACE</span><h2 id="mode-gate-title">{copy.mode.title}</h2><p>{copy.mode.body}</p></header>
      <div className="mode-gate-options">
        <article><span>01 / SIMPLE</span><h3>{copy.mode.simpleTitle}</h3><p>{copy.mode.simpleBody}</p><a href={studioHref('mobile')}>{copy.mode.simpleCta}<b aria-hidden="true">↗</b></a></article>
        <article><span>02 / PRO</span><h3>{copy.mode.proTitle}</h3><p>{copy.mode.proBody}</p><a href={studioHref('full')}>{copy.mode.proCta}<b aria-hidden="true">↗</b></a></article>
      </div>
    </section>
  </div>
}

function ResultCompare({ copy }: { copy: Copy }) {
  const [split, setSplit] = useState(50)
  return <section className="result-compare" id="outcomes" data-reveal>
    <header><span>05 / LIGHT TEST</span><h2>{copy.compareTitle}</h2><p>{copy.compareBody}</p></header>
    <div className="compare-stage" style={{ '--compare-split': `${split}%` } as React.CSSProperties}>
      <img src={assetHref('onboarding/render-before.webp')} alt={copy.compareBefore} width="1600" height="900" loading="lazy" decoding="async" />
      <div className="compare-after"><img src={assetHref('onboarding/render-after.webp')} alt={copy.compareAfter} width="1600" height="900" loading="lazy" decoding="async" /></div>
      <span className="compare-label before">{copy.compareBefore}</span><span className="compare-label after">{copy.compareAfter}</span>
      <div className="compare-handle" aria-hidden="true"><i>↔</i></div>
      <input type="range" min="0" max="100" value={split} aria-label={copy.compareHint} onInput={(event) => setSplit(Number(event.currentTarget.value))} />
    </div>
  </section>
}

export function PublicSite({ route }: { route: Exclude<PublicRoute, 'studio'> }) {
  const locale = useLocaleStore((state) => state.locale)
  const copy = COPY[locale]
  const studioPreview = STUDIO_PREVIEWS[locale]
  const demoVideo = DEMO_VIDEOS[locale]
  const [demoStep, setDemoStep] = useState(0)
  const [demoProgress, setDemoProgress] = useState(0)
  const [demoPlaying, setDemoPlaying] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const releaseDate = '2026.09.06'
  const heroStage = useRef<HTMLDivElement>(null)
  const demoRef = useRef<HTMLVideoElement>(null)
  const userPaused = useRef(false)
  useEffect(() => {
    const video = demoRef.current
    if (!video || route !== 'home') return
    let visible = false
    const sync = () => {
      if (!visible || document.hidden) video.pause()
      else if (!userPaused.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) void video.play().catch(() => {})
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync() }, { threshold: .15 })
    observer.observe(video)
    document.addEventListener('visibilitychange', sync)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', sync) }
  }, [locale, route])
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
  useEffect(() => {
    if (!modeOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setModeOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [modeOpen])

  const moveHeroLight = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!heroStage.current || event.pointerType === 'touch') return
    const bounds = heroStage.current.getBoundingClientRect()
    heroStage.current.style.setProperty('--pointer-x', `${((event.clientX - bounds.left) / bounds.width) * 100}%`)
    heroStage.current.style.setProperty('--pointer-y', `${((event.clientY - bounds.top) / bounds.height) * 100}%`)
  }
  const seekDemo = (step: number) => {
    const video = demoRef.current
    if (!video) return
    video.currentTime = DEMO_STEP_MOVEMENT_STARTS[step]
    setDemoStep(step)
    setDemoProgress((DEMO_STEP_MOVEMENT_STARTS[step] / (video.duration || 15)) * 100)
    void video.play().catch(() => {})
  }
  const toggleDemo = () => {
    const video = demoRef.current
    if (!video) return
    userPaused.current = !video.paused
    if (video.paused) void video.play().catch(() => {})
    else video.pause()
  }
  const replayDemo = () => {
    const video = demoRef.current
    if (!video) return
    video.currentTime = 0
    setDemoStep(0)
    setDemoProgress(0)
    void video.play().catch(() => {})
  }
  const handleDemoKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === ' ') {
      event.preventDefault()
      toggleDemo()
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const video = demoRef.current
    if (!video) return
    const nextTime = Math.min(video.duration || 15, Math.max(0, video.currentTime + (event.key === 'ArrowRight' ? 2.5 : -2.5)))
    video.currentTime = nextTime
    setDemoStep(demoStepAt(nextTime))
    setDemoProgress((nextTime / (video.duration || 15)) * 100)
  }
  if (route !== 'home') return <LegalPage route={route} copy={copy} locale={locale} />
  return <><SiteHeader copy={copy} onOpenStudio={() => setModeOpen(true)} />{modeOpen && <ModeChooser copy={copy} onClose={() => setModeOpen(false)} />}<main className="landing">
    <section className="site-hero" data-locale={locale} onPointerMove={moveHeroLight} ref={heroStage}>
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-copy">
        <span className="hero-eyebrow"><i /> {copy.eyebrow}</span>
        <h1><span>{copy.title[0]}</span><em><span>{copy.title[1]}</span><span>{copy.title[2]}</span></em></h1>
        <div className="hero-lower"><p>{copy.intro}</p><div className="hero-actions"><button className="site-cta" type="button" onClick={() => setModeOpen(true)}><span>{copy.open}</span><b aria-hidden="true">↗</b></button><a className="hero-demo-link" href="#demo"><i aria-hidden="true">▶</i>{copy.demoLink}</a></div><ul>{copy.proof.map((item) => <li key={item}>{item}</li>)}</ul></div>
      </div>
      <div className="hero-instrument">
        <picture key={locale}>
          <source media="(max-width: 620px)" srcSet={studioPreview.mobile} type="image/png" width="2160" height="3840" />
          <img
            src={studioPreview.desktop}
            alt={studioPreview.alt}
            width="3840"
            height="2160"
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
    <CastGallery />
    <section className="site-demo" id="demo" data-reveal>
      <header><span>01 / QUICK DEMO</span><h2>{copy.demoTitle}</h2><p>{copy.demoBody}</p></header>
      <div className="demo-console">
        <div className="demo-screen" tabIndex={0} aria-label={copy.demoControls.shortcuts} onKeyDown={handleDemoKeys}>
          <video ref={demoRef} key={locale} muted loop playsInline preload="metadata" poster={demoVideo.poster} aria-label={studioPreview.alt}
            onClick={toggleDemo}
            onTimeUpdate={(event) => {
              const video = event.currentTarget
              setDemoStep(demoStepAt(video.currentTime))
              setDemoProgress((video.currentTime / (video.duration || 15)) * 100)
            }}
            onPause={() => setDemoPlaying(false)}
            onPlay={(event) => {
              setDemoPlaying(true)
              const video = event.currentTarget
              if (!video.requestVideoFrameCallback) return
              const syncToFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
                setDemoStep(demoStepAt(metadata.mediaTime))
                if (!video.paused && !video.ended) video.requestVideoFrameCallback(syncToFrame)
              }
              video.requestVideoFrameCallback(syncToFrame)
            }}>
            <source media="(max-width: 620px)" src={demoVideo.mobile} type="video/mp4" />
            <source src={demoVideo.src} type="video/mp4" />
          </video>
          <span className="demo-live"><i /> {DEMO_LIVE_LABEL[locale]}</span>
          <div className="demo-controls">
            <button type="button" onClick={toggleDemo} aria-label={demoPlaying ? copy.demoControls.pause : copy.demoControls.play}><span aria-hidden="true">{demoPlaying ? 'Ⅱ' : '▶'}</span>{demoPlaying ? copy.demoControls.pause : copy.demoControls.play}</button>
            <button type="button" onClick={replayDemo} aria-label={copy.demoControls.replay}><span aria-hidden="true">↺</span>{copy.demoControls.replay}</button>
            <input type="range" min="0" max="100" step="0.1" value={demoProgress} aria-label={copy.demoControls.progress} onChange={(event) => {
              const video = demoRef.current
              if (!video) return
              video.currentTime = (Number(event.currentTarget.value) / 100) * (video.duration || 15)
              setDemoProgress(Number(event.currentTarget.value))
            }} />
            <output>{Math.floor((demoProgress / 100) * 15).toString().padStart(2, '0')} / 15s</output>
            <span className="demo-shortcuts" aria-hidden="true">← −2.5s · → +2.5s · SPACE</span>
          </div>
        </div>
        <ol>{copy.demoSteps.map(([title, body], index) => <li key={title} className={index === demoStep ? 'active' : ''}><button type="button" onClick={() => seekDemo(index)} aria-current={index === demoStep ? 'step' : undefined}><span>0{index + 1}</span><div><strong>{title}</strong><small>{body}</small></div></button></li>)}</ol>
      </div>
    </section>
    <section className="site-intro" id="capabilities" data-reveal><span>02 / THE INSTRUMENT</span><h2>{copy.instrument}</h2><p>{copy.instrumentBody}</p></section>
    <section className="capability-grid" data-reveal>{copy.capabilities.map(([title, body], index) => <article key={title}>
      <div><span>0{index + 1}</span><i aria-hidden="true" /></div>
      <figure className="capability-pair">
        <div className="capability-scene"><span>{locale === 'zh' ? '場景' : locale === 'ja' ? 'シーン' : 'Scene'}</span><ScreenshotCrop src={`site-detail/${locale}/scene-${index}.png`} size={[3840, 2160]} crop={[504, 184, 2712, 1936]} id={`scene-${index}`} label={`${title} — ${locale === 'zh' ? '場景圖' : 'Scene'}`} /></div>
        <div className="capability-settings"><span>{locale === 'en' ? 'Settings preview' : locale === 'ja' ? '設定プレビュー' : '設定預覽'}</span><SettingsPreview index={index} locale={locale} /></div>
      </figure>
      <h3>{title}</h3><p>{body}</p>
    </article>)}</section>
    <section className="audience-strip" data-reveal><header><span>WHO IT IS FOR</span><h2>{copy.audienceTitle}</h2><p>{copy.audienceBody}</p></header><div>{copy.audiences.map(([title, body], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>
    <section className="featured-setups" id="setups">
      <header data-reveal><span>03 / STARTING POINTS</span><h2>{copy.setupsTitle}</h2><p>{copy.setupsBody}</p></header>
      <div className="setup-showcase">{FEATURED_SETUP_IDS.map((id, index) => {
        const setup = SETUP_LIBRARY.find((item) => item.id === id)!
        const [title, body] = copy.setupNames[id]
        return <article key={id} data-reveal>
          <div className="setup-visual" aria-hidden="true"><span>0{index + 1}</span><svg viewBox="-2.8 -2.8 5.6 5.6"><circle className="setup-person" cx="0" cy="0" r=".34" /><path className="setup-camera" d="M-.28 .24h.56l.2.28h-.96z" transform={`translate(${setup.camera.position[0]} ${setup.camera.position[2]}) rotate(180)`} />{setup.lights.map((light) => <g key={light.id} transform={`translate(${light.position[0]} ${light.position[2]})`}><line x1="0" y1="0" x2={-light.position[0]} y2={-light.position[2]} /><rect x="-.2" y="-.2" width=".4" height=".4" rx=".08" /></g>)}</svg><small>{setup.lights.length} LIGHTS · {setup.ratio}</small></div>
          <div className="setup-copy"><span>{setup.category.toUpperCase()}</span><h3>{title}</h3><p>{body}</p><a href={setupHref(id)}>{copy.setupCta}<b aria-hidden="true">↗</b></a></div>
        </article>
      })}</div>
    </section>
    <section className="workflow" id="workflow"><div className="workflow-heading" data-reveal><span>04 / WORKFLOW</span><h2>{copy.workflowTitle}</h2><p>PLAN · PREVIEW · SHOOT</p></div><ol>{copy.workflow.map(([title, body], index) => <li key={title} data-reveal><span>0{index + 1}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol></section>
    <ResultCompare copy={copy} />
    <section className="simulation-method" data-reveal><header><span>SIMULATION / REALITY</span><h2>{copy.methodTitle}</h2><p>{copy.methodBody}</p></header><div>{copy.methodPoints.map(([title, body], index) => <article key={title}><b>0{index + 1}</b><h3>{title}</h3><p>{body}</p></article>)}</div></section>
    <section className="site-trust" data-reveal><header><span>06 / AT A GLANCE</span><h2>{copy.trustTitle}</h2></header><div>{copy.trust.map(([title, body], index) => <article key={title}><b>{TRUST_MARKS[index]}</b><h3>{index < 3 ? <a href={index === 0 ? '#setups' : index === 1 ? '#capabilities' : routeHref('privacy')}>{title}</a> : <button type="button" onClick={() => setModeOpen(true)}>{title}</button>}</h3><p>{body}</p></article>)}</div></section>
    <section className="release-proof" id="release" data-reveal><header><span>07 / RELEASE STATUS</span><h2>{copy.release.title}</h2></header><div><article><i /><span>STATUS</span><h3>{copy.release.status}</h3><p>{copy.release.statusBody}</p></article><article><span>UPDATED</span><h3>{copy.release.updated}</h3><p>{releaseDate} · {copy.release.updatedBody}</p></article><article><span>INCLUDED</span><h3>{copy.release.included}</h3><p>{copy.release.includedBody}</p></article><a href="https://github.com/clark970417-eng/lumen-stage-showcase" target="_blank" rel="noreferrer"><span>SHOWCASE</span><h3>{copy.release.showcase}</h3><p>{copy.release.showcaseBody}</p><b aria-hidden="true">↗</b></a></div></section>
    <section className="faq" id="faq"><div className="faq-heading" data-reveal><span>08 / FAQ</span><h2>{copy.faqTitle}</h2></div><div>{copy.faq.map(([question, answer], index) => <details key={question} data-reveal><summary><span>0{index + 1}</span>{question}</summary><p>{answer}</p></details>)}</div></section>
    <section className="local-first" data-reveal><div className="privacy-orbit" aria-hidden="true"><BrandMark /><i /><i /></div><div><span>09 / DATA PRACTICE</span><h2>{copy.localTitle}</h2><p>{copy.localBody}</p></div><small>DEVICE<br />ONLY</small></section>
    <FeedbackSection locale={locale} />
  </main><SiteFooter copy={copy} /></>
}
