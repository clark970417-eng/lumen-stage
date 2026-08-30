import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { BACKDROPS } from '../backdrops'
import { captureContinuityBaseline, evaluateContinuity, type ContinuityBaseline } from '../continuity'
import { useLocaleStore } from '../i18n'
import { analyzeReferencePixels, type ReferenceLightingAnalysis } from '../referenceLighting'
import { useStudio } from '../store'
import { useWorkflow, type WorkflowStage } from '../workflow'
import { Inspector } from './Inspector'
import { lightWattage } from '../lightProfiles'

const COPY = {
  en: {
    stages: [['intent', 'Define'], ['blocking', 'Block'], ['lighting', 'Shape'], ['framing', 'Frame'], ['verify', 'Verify']] as Array<[WorkflowStage, string]>,
    blueprint: 'Shoot blueprint', material: '+ Add to stage', reference: 'Reference match', continuity: 'Continuity guard',
    target: 'Visual target', targetHint: 'Start from the image you want to make.', subject: 'Subject & blocking', lightRoles: 'Lighting roles', framing: 'Frame plan', verify: 'Preflight',
    mainSubject: 'Main subject', camera: 'Camera A', shots: 'shots', key: 'Key light', fill: 'Fill light', rim: 'Separation light', background: 'Background light', effect: 'Effect light',
    noProps: 'No supporting objects yet', tracked: 'tracking subject', manual: 'manual aim', selected: 'Selected decision', desired: 'Desired effect', impact: 'Current impact', advanced: 'Advanced controls',
    soften: 'Softer light', deepen: 'Deeper shadow', trackFace: 'Track face', headshot: 'Headshot', half: 'Half body', full: 'Full body',
    assetTitle: 'Add to the stage', lights: 'Lights', people: 'People & set', grip: 'Light control', backdrops: 'Backdrops', close: 'Close',
    square: 'Soft key', round: 'Round source', strip: 'Strip source', person: 'Person', product: 'Product', chair: 'Chair', table: 'Table', reflector: 'Reflector', flag: 'Black flag', vflat: 'V-Flat',
    referenceTitle: 'Reference → starting light', referenceIntro: 'A local luminance read suggests a conservative starting point. It does not claim to identify hidden gear.',
    choosePhoto: 'Choose a reference photo', replacePhoto: 'Replace photo', applyStart: 'Build this starting light', direction: 'Probable key direction', ratio: 'Starting key : fill', confidence: 'Confidence',
    left: 'camera left', right: 'camera right', front: 'frontal / even', low: 'low', medium: 'medium', high: 'high',
    continuityTitle: 'Continuity guard', continuityIntro: 'Save a hero shot as the baseline, then watch exposure, distance and subject tracking while you change the scene.',
    setBaseline: 'Set current as baseline', enableGuard: 'Track subject', restore: 'Restore baseline values', noBaseline: 'Set a baseline before moving the camera, subject or lights.',
    match: 'MATCH', drift: 'DRIFT', stable: 'All checked values match the baseline.', viewModes: 'Stage views', studio: 'Studio', top: 'Plan', viewfinder: 'Viewfinder', render: 'Render',
  },
  zh: {
    stages: [['intent', '定調'], ['blocking', '走位'], ['lighting', '塑光'], ['framing', '取景'], ['verify', '驗證']] as Array<[WorkflowStage, string]>,
    blueprint: '拍攝藍圖', material: '＋ 加入舞台', reference: '參考照配光', continuity: '光線連戲',
    target: '視覺目標', targetHint: '先從你想做出的畫面開始。', subject: '人物與走位', lightRoles: '燈光角色', framing: '鏡位計畫', verify: '拍攝前檢查',
    mainSubject: '主要人物', camera: '相機 A', shots: '個鏡位', key: '主光', fill: '補光', rim: '分離光', background: '背景光', effect: '效果光',
    noProps: '尚未加入其他人物或道具', tracked: '跟隨人物', manual: '手動瞄準', selected: '目前決策', desired: '想得到的效果', impact: '當前影響', advanced: '進階器材參數',
    soften: '光線更柔', deepen: '陰影更深', trackFace: '鎖定臉部', headshot: '臉部近景', half: '半身構圖', full: '全身構圖',
    assetTitle: '加入拍攝舞台', lights: '燈光', people: '人物與佈景', grip: '控光附件', backdrops: '背景', close: '關閉',
    square: '柔光主燈', round: '圓形光源', strip: '條形光源', person: '人物', product: '商品', chair: '椅子', table: '桌子', reflector: '反光板', flag: '黑旗', vflat: 'V-Flat',
    referenceTitle: '參考照片 → 起始燈位', referenceIntro: '只在本機讀取大範圍明暗分布，提供保守的起始推測，不會宣稱辨識出照片外的器材。',
    choosePhoto: '選擇參考照片', replacePhoto: '更換照片', applyStart: '建立這組起始燈位', direction: '推測主光方向', ratio: '起始主補光比', confidence: '推測信心',
    left: '鏡頭左側', right: '鏡頭右側', front: '正面／平均', low: '低', medium: '中', high: '高',
    continuityTitle: '光線連戲守門員', continuityIntro: '將主鏡位設為基準，之後移動人物、相機或燈具時，持續檢查曝光、距離與追蹤狀態。',
    setBaseline: '以目前畫面建立基準', enableGuard: '啟用人物追蹤', restore: '恢復基準讀值', noBaseline: '先建立基準，再移動相機、人物或燈具。',
    match: '吻合', drift: '偏移', stable: '目前檢查項目都與基準吻合。', viewModes: '舞台檢視', studio: '棚內', top: '俯視', viewfinder: '取景', render: '成像',
  },
  ja: {
    stages: [['intent', '方向'], ['blocking', '配置'], ['lighting', '光作り'], ['framing', '構図'], ['verify', '検証']] as Array<[WorkflowStage, string]>,
    blueprint: '撮影ブループリント', material: '＋ ステージに追加', reference: '参照写真から配光', continuity: '光の連続性',
    target: 'ビジュアル目標', targetHint: '作りたい写真から始めます。', subject: '人物と配置', lightRoles: 'ライトの役割', framing: 'ショット計画', verify: '撮影前チェック',
    mainSubject: 'メイン人物', camera: 'カメラ A', shots: 'ショット', key: 'キーライト', fill: 'フィルライト', rim: 'セパレーション', background: '背景ライト', effect: 'エフェクト',
    noProps: '人物や小道具はまだありません', tracked: '人物を追従', manual: '手動照準', selected: '現在の判断', desired: '目指す効果', impact: '現在の影響', advanced: '詳細機材設定',
    soften: '光を柔らかく', deepen: '影を深く', trackFace: '顔を追従', headshot: 'ヘッドショット', half: '上半身', full: '全身',
    assetTitle: 'ステージに追加', lights: 'ライト', people: '人物とセット', grip: '遮光・反射', backdrops: '背景', close: '閉じる',
    square: 'ソフトキー', round: '円形光源', strip: 'ストリップ', person: '人物', product: '商品', chair: '椅子', table: 'テーブル', reflector: 'レフ板', flag: '黒旗', vflat: 'V-Flat',
    referenceTitle: '参照写真 → 初期ライティング', referenceIntro: '端末内で明暗分布だけを読み、控えめな開始点を提案します。写っていない機材は断定しません。',
    choosePhoto: '参照写真を選択', replacePhoto: '写真を変更', applyStart: 'この初期配光を作成', direction: '推定キー方向', ratio: 'キー：フィル', confidence: '信頼度',
    left: 'カメラ左', right: 'カメラ右', front: '正面／均等', low: '低', medium: '中', high: '高',
    continuityTitle: '光の連続性ガード', continuityIntro: '基準ショットを保存し、シーン変更中の露出・距離・人物追従を監視します。',
    setBaseline: '現在を基準に設定', enableGuard: '人物追従を有効化', restore: '基準値に戻す', noBaseline: 'カメラやライトを動かす前に基準を設定します。',
    match: '一致', drift: '差異', stable: '確認項目はすべて基準と一致しています。', viewModes: '表示モード', studio: 'スタジオ', top: '平面', viewfinder: 'ファインダー', render: 'レンダー',
  },
}

function useCopy() {
  const locale = useLocaleStore((state) => state.locale)
  return COPY[locale]
}

const lightRole = (index: number, copy: (typeof COPY)['en']) => [copy.key, copy.fill, copy.rim, copy.background][index] ?? copy.effect

export function WorkflowNavigation() {
  const copy = useCopy()
  const stage = useWorkflow((state) => state.stage)
  const setStage = useWorkflow((state) => state.setStage)
  const studio = useStudio()

  const chooseStage = (next: WorkflowStage) => {
    setStage(next)
    if (next === 'blocking') { studio.selectObject('model'); studio.openStudioView() }
    if (next === 'lighting') { const light = studio.lights.find((item) => item.enabled) ?? studio.lights[0]; if (light) studio.selectObject(light.id); studio.openStudioView() }
    if (next === 'framing') { studio.selectObject('camera'); studio.openCameraView() }
  }

  return <nav className="workflow-navigation" aria-label="Shoot workflow">
    {copy.stages.map(([id, label], index) => <button key={id} className={stage === id ? 'active' : ''} aria-current={stage === id ? 'step' : undefined} onClick={() => chooseStage(id)}><i>{index + 1}</i><span>{label}</span></button>)}
  </nav>
}

export function ViewModeDock() {
  const copy = useCopy()
  const state = useStudio()
  return <div className="view-mode-dock" role="group" aria-label={copy.viewModes}>
    <button className={state.view === 'studio' && state.renderMode === 'preview' ? 'active' : ''} onClick={state.openStudioView}>{copy.studio}<kbd>1</kbd></button>
    <button className={state.view === 'top' && state.renderMode === 'preview' ? 'active' : ''} onClick={state.openTopView}>{copy.top}<kbd>2</kbd></button>
    <button className={state.view === 'camera' && state.renderMode === 'preview' ? 'active' : ''} onClick={state.openCameraView}>{copy.viewfinder}<kbd>3</kbd></button>
    <button className={state.renderMode === 'path' ? 'active render' : ''} onClick={state.startPhotoRender}>{copy.render}<kbd>4</kbd></button>
  </div>
}

export function BlueprintPanel() {
  const copy = useCopy()
  const stage = useWorkflow((state) => state.stage)
  const setAssetOpen = useWorkflow((state) => state.setAssetDrawerOpen)
  const setReferenceOpen = useWorkflow((state) => state.setReferencePanelOpen)
  const setContinuityOpen = useWorkflow((state) => state.setContinuityPanelOpen)
  const studio = useStudio()
  const supporting = studio.studioObjects.filter((item) => item.type === 'subject' || item.type === 'product' || item.type === 'chair' || item.type === 'table')

  return <aside className="blueprint-panel panel">
    <header className="blueprint-heading"><span>{copy.blueprint}</span><b>{String(studio.shots.length + 1).padStart(2, '0')}</b></header>
    <section className="blueprint-shot">
      <span>SHOT {String(studio.shots.length + 1).padStart(2, '0')}</span>
      <strong>{studio.projectName}</strong>
      <small>{studio.shots.length} {copy.shots} · {studio.frameAspect} · {studio.focalLength} mm</small>
    </section>

    {stage === 'intent' && <section className="blueprint-section intent-card"><div><span>{copy.target}</span><small>{copy.targetHint}</small></div><button onClick={() => setReferenceOpen(true)}>{copy.reference}<b>→</b></button></section>}

    {stage === 'blocking' && <section className="blueprint-section"><h2>{copy.subject}</h2><button className={studio.selected === 'model' ? 'blueprint-row active' : 'blueprint-row'} onClick={() => studio.selectObject('model')}><i className="model-icon" /><span><strong>{copy.mainSubject}</strong><small>{studio.posePreset.replaceAll('-', ' ')} · {studio.modelHeight.toFixed(2)} m</small></span></button>{supporting.map((item) => <button key={item.id} className={studio.selected === item.id ? 'blueprint-row active' : 'blueprint-row'} onClick={() => studio.selectObject(item.id)}><i className={`studio-object-icon ${item.type}`} /><span><strong>{item.name}</strong><small>{item.type}</small></span></button>)}{supporting.length === 0 && <p className="blueprint-empty">{copy.noProps}</p>}</section>}

    {stage === 'lighting' && <section className="blueprint-section"><h2>{copy.lightRoles}</h2>{studio.lights.map((light, index) => <button key={light.id} className={studio.selected === light.id ? 'blueprint-row active' : 'blueprint-row'} onClick={() => studio.selectObject(light.id)}><i className={`light-icon ${light.shape}`} /><span><strong>{lightRole(index, copy)}</strong><small>{light.name} · {light.targetSubjectId ? copy.tracked : copy.manual}</small></span><em>{light.enabled ? `${lightWattage(light)} ${light.operationMode === 'flash' ? 'Ws' : 'W'}` : 'OFF'}</em></button>)}</section>}

    {stage === 'framing' && <section className="blueprint-section"><h2>{copy.framing}</h2><button className="blueprint-row active" onClick={() => studio.selectObject('camera')}><i className="camera-icon" /><span><strong>{copy.camera}</strong><small>{studio.focalLength} mm · ƒ/{studio.aperture} · ISO {studio.iso}</small></span></button><div className="framing-presets"><button onClick={() => studio.frameCameraSubject('model', 'headshot')}>{copy.headshot}</button><button onClick={() => studio.frameCameraSubject('model', 'half')}>{copy.half}</button><button onClick={() => studio.frameCameraSubject('model', 'full')}>{copy.full}</button></div></section>}

    {stage === 'verify' && <section className="blueprint-section verify-actions"><h2>{copy.verify}</h2><button onClick={() => studio.setValue('analysisOpen', true)}>EXPOSURE CHECK <b>→</b></button><button onClick={() => studio.setValue('shotPanelOpen', true)}>SHOT COMPARE <b>→</b></button><button onClick={() => setContinuityOpen(true)}>{copy.continuity}<b>→</b></button></section>}

    <footer className="blueprint-actions"><button onClick={() => setAssetOpen(true)}>{copy.material}</button><button onClick={() => setReferenceOpen(true)} title={copy.reference}>◎</button><button onClick={() => setContinuityOpen(true)} title={copy.continuity}>⌁</button></footer>
  </aside>
}

export function AssetDrawer() {
  const copy = useCopy()
  const open = useWorkflow((state) => state.assetDrawerOpen)
  const setOpen = useWorkflow((state) => state.setAssetDrawerOpen)
  const studio = useStudio()
  const [tab, setTab] = useState<'lights' | 'people' | 'grip' | 'backdrops'>('lights')
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open, setOpen])
  if (!open) return null

  const finish = (action: () => void) => { action(); setOpen(false) }
  return <div className="workspace-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}><section className="asset-drawer" role="dialog" aria-modal="true" aria-label={copy.assetTitle}>
    <header><div><span>STAGE LIBRARY</span><h2>{copy.assetTitle}</h2></div><button onClick={() => setOpen(false)} aria-label={copy.close}>×</button></header>
    <nav>{(['lights', 'people', 'grip', 'backdrops'] as const).map((id) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{copy[id]}</button>)}</nav>
    <div className="asset-drawer-grid">
      {tab === 'lights' && <><button onClick={() => finish(() => studio.addLight('square'))}><i className="light-icon square" /><strong>{copy.square}</strong><small>SOFT / PORTRAIT</small></button><button onClick={() => finish(() => studio.addLight('round'))}><i className="light-icon round" /><strong>{copy.round}</strong><small>BEAUTY / OPEN</small></button><button onClick={() => finish(() => studio.addLight('strip'))}><i className="light-icon strip" /><strong>{copy.strip}</strong><small>EDGE / SEPARATION</small></button></>}
      {tab === 'people' && <>{([['subject', copy.person], ['product', copy.product], ['chair', copy.chair], ['table', copy.table]] as const).map(([id, label]) => <button key={id} onClick={() => finish(() => studio.addStudioObject(id))}><i className={`studio-object-icon ${id}`} /><strong>{label}</strong><small>STAGE OBJECT</small></button>)}</>}
      {tab === 'grip' && <>{([['reflector', copy.reflector], ['flag', copy.flag], ['vflat', copy.vflat]] as const).map(([id, label]) => <button key={id} onClick={() => finish(() => studio.addModifier(id))}><i className={`grip-icon ${id}`} /><strong>{label}</strong><small>LIGHT CONTROL</small></button>)}</>}
      {tab === 'backdrops' && BACKDROPS.filter((item) => item.family === 'paper').slice(0, 12).map((item) => <button key={item.id} className={studio.backdropId === item.id ? 'active' : ''} onClick={() => finish(() => studio.selectBackdrop(item.id))}><i className="backdrop-dot" style={{ background: item.color }} /><strong>{item.label}</strong><small>{Math.round(item.reflectance * 100)}% REFLECTANCE</small></button>)}
    </div>
  </section></div>
}

export function DecisionConsole() {
  const copy = useCopy()
  const state = useStudio()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const light = state.lights.find((item) => item.id === state.selected)
  const object = state.studioObjects.find((item) => item.id === state.selected)
  const distance = light ? Math.hypot(light.position[0] - state.modelPosition[0], light.position[1] - state.modelPosition[1], light.position[2] - state.modelPosition[2]) : 0
  const selection = light ? light.name : state.selected === 'camera' ? copy.camera : state.selected === 'model' ? copy.mainSubject : object?.name ?? String(state.selected)

  return <aside className={advancedOpen ? 'decision-console advanced-open' : 'decision-console'}>
    <section className="decision-summary">
      <header><span>{copy.selected}</span><strong>{selection}</strong></header>
      <div><h2>{copy.desired}</h2><div className="decision-actions">{light ? <><button onClick={() => state.updateLight(light.id, { modifierWidth: Math.min(2.4, light.modifierWidth + 0.2), modifierHeight: Math.min(2.4, light.modifierHeight + 0.2), feather: Math.min(100, light.feather + 6) })}>{copy.soften}</button><button onClick={() => { const fill = state.lights[1]; if (fill) state.updateLight(fill.id, { powerPercent: Math.max(1, fill.powerPercent - 2) }) }}>{copy.deepen}</button><button className={light.targetSubjectId === 'model' ? 'active' : ''} onClick={() => state.bindLightToSubject(light.id, 'model', 'face')}>{copy.trackFace}</button></> : state.selected === 'camera' ? <><button onClick={() => state.frameCameraSubject('model', 'headshot')}>{copy.headshot}</button><button onClick={() => state.frameCameraSubject('model', 'half')}>{copy.half}</button><button onClick={() => state.frameCameraSubject('model', 'full')}>{copy.full}</button></> : null}</div></div>
      <div className="impact-readout"><h2>{copy.impact}</h2>{light ? <p><b>{lightWattage(light)} {light.operationMode === 'flash' ? 'Ws' : 'W'}</b><span>{distance.toFixed(2)} m<br />{light.targetSubjectId ? copy.tracked : copy.manual}</span></p> : state.selected === 'camera' ? <p><b>{state.focalLength} mm</b><span>ƒ/{state.aperture} · ISO {state.iso}<br />1/{state.shutter} s</span></p> : <p><b>{state.modelHeight.toFixed(2)} m</b><span>{state.posePreset.replaceAll('-', ' ')}</span></p>}</div>
    </section>
    <button type="button" className="advanced-heading" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)}><span>{copy.advanced}</span><i aria-hidden="true">{advancedOpen ? '−' : '＋'}</i></button>
    {advancedOpen && <Inspector />}
  </aside>
}

export function ReferenceMatchPanel() {
  const copy = useCopy()
  const open = useWorkflow((state) => state.referencePanelOpen)
  const setOpen = useWorkflow((state) => state.setReferencePanelOpen)
  const setStage = useWorkflow((state) => state.setStage)
  const state = useStudio()
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ReferenceLightingAnalysis | null>(null)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  if (!open) return null

  const readPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    const image = new Image()
    image.src = url
    await image.decode()
    const scale = Math.min(1, 240 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(2, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(2, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    setAnalysis(analyzeReferencePixels(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height))
  }

  const apply = () => {
    if (!analysis) return
    const key = state.lights[0]
    const fill = state.lights[1]
    const keyX = analysis.direction === 'right' ? 2.35 : analysis.direction === 'left' ? -2.35 : -0.35
    if (key) {
      state.updateLight(key.id, { powerPercent: analysis.keyPower, position: [keyX, 2.65, 2.1] })
      state.bindLightToSubject(key.id, 'model', 'face')
    }
    if (fill) {
      state.updateLight(fill.id, { powerPercent: analysis.fillPower, position: [-keyX || 2.4, 2.05, 0.8] })
      state.bindLightToSubject(fill.id, 'model', 'chest')
    }
    state.openStudioView()
    setStage('lighting')
    setOpen(false)
  }

  return <div className="workspace-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}><section className="reference-panel" role="dialog" aria-modal="true" aria-label={copy.referenceTitle}>
    <header><div><span>REFERENCE MATCH / LOCAL</span><h2>{copy.referenceTitle}</h2><p>{copy.referenceIntro}</p></div><button onClick={() => setOpen(false)}>×</button></header>
    <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(event) => void readPhoto(event)} />
    <div className="reference-workspace">
      <button className={preview ? 'reference-preview has-image' : 'reference-preview'} onClick={() => input.current?.click()}>{preview ? <img src={preview} alt="Reference" /> : <><i>＋</i><strong>{copy.choosePhoto}</strong><small>JPG · PNG · WEBP</small></>}</button>
      <div className="reference-findings">{analysis ? <><div><span>{copy.direction}</span><strong>{copy[analysis.direction]}</strong></div><div><span>{copy.ratio}</span><strong>{analysis.contrastRatio}:1</strong></div><div><span>{copy.confidence}</span><strong>{copy[analysis.confidence]}</strong></div><figure><i style={{ height: `${analysis.keyPower * 2}%` }} /><i style={{ height: `${analysis.fillPower * 2}%` }} /><figcaption>KEY {analysis.keyPower}% · FILL {analysis.fillPower}%</figcaption></figure><button className="apply-reference" onClick={apply}>{copy.applyStart} →</button></> : <p>{copy.targetHint}</p>}</div>
    </div>
    {preview && <button className="replace-reference" onClick={() => input.current?.click()}>{copy.replacePhoto}</button>}
  </section></div>
}

export function ContinuityGuardPanel() {
  const copy = useCopy()
  const open = useWorkflow((state) => state.continuityPanelOpen)
  const setOpen = useWorkflow((state) => state.setContinuityPanelOpen)
  const state = useStudio()
  const [baseline, setBaseline] = useState<ContinuityBaseline | null>(null)
  const report = useMemo(() => baseline ? evaluateContinuity(baseline, state) : null, [baseline, state])
  if (!open) return null

  const track = () => {
    state.lights.filter((light) => light.enabled).forEach((light) => state.bindLightToSubject(light.id, 'model', light.id === state.lights[0]?.id ? 'face' : 'chest'))
    state.bindCameraToSubject('model', 'face')
    state.setCameraAutoFocus(true)
  }
  const restore = () => {
    if (!baseline) return
    state.setValue('focalLength', baseline.focalLength)
    state.setValue('aperture', baseline.aperture)
    state.setValue('iso', baseline.iso)
    state.setValue('shutter', baseline.shutter)
    baseline.lights.forEach((saved) => state.updateLight(saved.id, { powerPercent: saved.power }))
  }

  return <div className="workspace-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}><section className="continuity-panel" role="dialog" aria-modal="true" aria-label={copy.continuityTitle}>
    <header><div><span>CONTINUITY / HERO BASELINE</span><h2>{copy.continuityTitle}</h2><p>{copy.continuityIntro}</p></div><button onClick={() => setOpen(false)}>×</button></header>
    <div className="continuity-score"><strong>{report?.score ?? '—'}</strong><span>{report ? (report.score === 100 ? copy.match : copy.drift) : 'BASELINE'}</span><i style={{ '--score': `${report?.score ?? 0}%` } as React.CSSProperties} /></div>
    <footer><button onClick={() => setBaseline(captureContinuityBaseline(state))}>{copy.setBaseline}</button><button onClick={track}>{copy.enableGuard}</button><button disabled={!baseline} onClick={restore}>{copy.restore}</button></footer>
  </section></div>
}
