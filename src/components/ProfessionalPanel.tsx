import { useRef } from 'react'
import { useT } from '../i18n'
import { useStudio, type CameraMode, type OutputResolution } from '../store'

function ProRange({ label, value, min, max, step = 1, unit = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  return <label className="pro-range"><span>{label}</span><output>{Number.isInteger(value) ? value : value.toFixed(1)}{unit}</output><input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>
}

function exportStoryboard() {
  const state = useStudio.getState()
  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = Math.max(1000, 250 + Math.ceil(Math.max(1, state.shots.length) / 3) * 330)
  const context = canvas.getContext('2d')
  if (!context) return
  context.fillStyle = '#111411'; context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#d8ff3e'; context.font = '700 34px Inter, sans-serif'; context.fillText('LUMEN / STORYBOARD', 60, 70)
  context.fillStyle = '#eef1e9'; context.font = '24px Inter, sans-serif'; context.fillText(state.projectName, 60, 108)
  context.fillStyle = '#747c71'; context.font = '14px monospace'; context.fillText(`${state.cameraMode.toUpperCase()} · ${state.cameras.length} CAMERAS · ${state.lights.length} LIGHTS · ${state.shots.length} SHOTS`, 60, 138)
  const jobs = state.shots.map((shot, index) => new Promise<void>((resolve) => {
    const image = new Image()
    image.onload = () => {
      const col = index % 3; const row = Math.floor(index / 3); const x = 60 + col * 510; const y = 190 + row * 330
      context.fillStyle = '#080a08'; context.fillRect(x, y, 460, 258)
      const scale = Math.min(460 / image.width, 258 / image.height)
      context.drawImage(image, x + (460 - image.width * scale) / 2, y + (258 - image.height * scale) / 2, image.width * scale, image.height * scale)
      context.fillStyle = '#eef1e9'; context.font = '600 16px Inter, sans-serif'; context.fillText(`${String(index + 1).padStart(2, '0')}  ${shot.name}`, x, y + 286)
      context.fillStyle = '#70786e'; context.font = '12px monospace'; context.fillText(new Date(shot.createdAt).toLocaleString(), x, y + 306)
      resolve()
    }
    image.onerror = () => resolve(); image.src = shot.thumbnail
  }))
  Promise.all(jobs).then(() => { const link = document.createElement('a'); link.download = `${state.projectName.replace(/[^\w\u3040-\u30ff\u4e00-\u9fff-]+/g, '-')}-storyboard.png`; link.href = canvas.toDataURL('image/png'); link.click() })
}

export function ProfessionalPanel() {
  const state = useStudio()
  const hdriInput = useRef<HTMLInputElement>(null)
  const iesInput = useRef<HTMLInputElement>(null)
  const mergeInput = useRef<HTMLInputElement>(null)
  const t = useT()
  if (!state.professionalPanelOpen) return null
  const set = state.setValue
  return <aside className="professional-panel" aria-label={t('pro.aria')}>
    <header><div><strong>PRODUCTION CONSOLE</strong><small>V22 · PHOTO / CINEMA</small></div><button aria-label={t('pro.close')} onClick={() => set('professionalPanelOpen', false)}>×</button></header>
    <div className="pro-scroll">
      <section><h3>{t('pro.capture')} <small>CAPTURE MODE</small></h3><div className="pro-segments" role="group" aria-label={t('pro.capture')}>{([['photo','PHOTO'],['cinema','CINEMA']] as [CameraMode,string][]).map(([mode,label]) => <button key={mode} className={state.cameraMode === mode ? 'active' : ''} onClick={() => set('cameraMode', mode)}>{label}</button>)}</div>
        {state.cameraMode === 'cinema' && <><ProRange label={t('pro.frameRate')} value={state.frameRate} min={16} max={120} unit=" fps" onChange={(value) => set('frameRate', value)} /><ProRange label={t('pro.shutterAngle')} value={state.shutterAngle} min={5} max={360} unit="°" onChange={(value) => set('shutterAngle', value)} /><ProRange label="T-stop" value={state.tStop} min={0.7} max={22} step={0.1} unit=" T" onChange={(value) => set('tStop', value)} /><ProRange label="ND" value={state.ndStops} min={0} max={10} step={0.3} unit=" stops" onChange={(value) => set('ndStops', value)} /><label className="pro-select"><span>Anamorphic</span><select aria-label="Anamorphic" value={state.anamorphic} onChange={(event) => set('anamorphic', Number(event.target.value))}>{[1,1.33,1.8,2].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label></>}
      </section>

      <section><h3>{t('pro.multicam')} <small>MULTI CAMERA</small></h3><div className="camera-slot-list">{state.cameras.map((camera) => <div key={camera.id} className={camera.id === state.activeCameraId ? 'active' : ''}><button onClick={() => state.activateCameraSlot(camera.id)}><b>{camera.name}</b><small>{camera.focalLength}mm · {camera.focusDistance.toFixed(2)}m</small></button><button aria-label={t('pro.deleteCamera', { name: camera.name })} disabled={state.cameras.length <= 1} onClick={() => state.deleteCameraSlot(camera.id)}>×</button></div>)}</div><div className="pro-actions"><button onClick={state.addCameraSlot}>{t('pro.addCamera')}</button><button onClick={state.saveActiveCameraSlot}>{t('pro.updateCamera')}</button></div></section>

      <section><h3>{t('pro.room')} <small>ROOM / NATURAL LIGHT</small></h3><ProRange label={t('pro.roomWidth')} value={state.roomWidth} min={3} max={30} step={0.5} unit=" m" onChange={(value) => set('roomWidth', value)} /><ProRange label={t('pro.roomDepth')} value={state.roomDepth} min={4} max={40} step={0.5} unit=" m" onChange={(value) => set('roomDepth', value)} /><ProRange label={t('pro.roomHeight')} value={state.roomHeight} min={2.4} max={12} step={0.1} unit=" m" onChange={(value) => set('roomHeight', value)} /><div className="pro-colors"><label><span>{t('pro.wall')}</span><input aria-label={t('pro.wallAria')} type="color" value={state.wallColor} onChange={(event) => set('wallColor', event.target.value)} /></label><label><span>{t('pro.floor')}</span><input aria-label={t('pro.floorAria')} type="color" value={state.floorColor} onChange={(event) => set('floorColor', event.target.value)} /></label></div><div className="pro-toggle-row"><button className={state.windowEnabled ? 'active' : ''} onClick={() => set('windowEnabled', !state.windowEnabled)}>{t('pro.window')}</button><button className={state.sunEnabled ? 'active' : ''} onClick={() => set('sunEnabled', !state.sunEnabled)}>{t('pro.sun')}</button></div>{state.sunEnabled && <><ProRange label={t('pro.sunAzimuth')} value={state.sunAzimuth} min={-180} max={180} unit="°" onChange={(value) => set('sunAzimuth', value)} /><ProRange label={t('pro.sunElevation')} value={state.sunElevation} min={1} max={85} unit="°" onChange={(value) => set('sunElevation', value)} /><ProRange label={t('pro.sunIntensity')} value={state.sunIntensity} min={0} max={100} unit="%" onChange={(value) => set('sunIntensity', value)} /></>}<ProRange label={t('pro.haze')} value={state.haze} min={0} max={100} unit="%" onChange={(value) => set('haze', value)} /></section>

      <section><h3>{t('pro.tracking')} <small>TALENT TRACKING</small></h3><div className="pro-toggle-row"><button className={state.modelLookAtCamera ? 'active' : ''} onClick={() => set('modelLookAtCamera', !state.modelLookAtCamera)}>HEAD LOOK AT</button><button className={state.modelEyesAtCamera ? 'active' : ''} onClick={() => set('modelEyesAtCamera', !state.modelEyesAtCamera)}>EYES AT</button></div></section>

      <section><h3>{t('pro.timeline')} <small>KEYFRAME TIMELINE</small></h3><div className="timeline-readout"><b>{Math.round(state.timelineFrame)}</b><span>/ {state.timelineDuration} F</span><small>{(state.timelineFrame / state.frameRate).toFixed(2)} SEC</small></div><input className="timeline-slider" aria-label={t('pro.timelineAria')} type="range" min={0} max={state.timelineDuration} value={state.timelineFrame} onChange={(event) => state.setTimelineFrame(Number(event.target.value))} /><div className="pro-actions"><button className={state.timelinePlaying ? 'active' : ''} disabled={state.timelineKeyframes.length < 2} onClick={() => { if (!state.timelinePlaying && state.timelineFrame >= state.timelineDuration) state.setTimelineFrame(0); set('timelinePlaying', !state.timelinePlaying) }}>{t(state.timelinePlaying ? 'render.pause' : 'pro.play')}</button><button onClick={state.addTimelineKeyframe}>{t('pro.addKeyframe')}</button></div><div className="keyframe-list">{state.timelineKeyframes.map((key) => <button key={key.id} onClick={() => state.setTimelineFrame(key.frame)}><b>{key.frame}F</b><i onClick={(event) => { event.stopPropagation(); state.deleteTimelineKeyframe(key.id) }}>×</i></button>)}</div></section>

      <section><h3>{t('pro.assets')} <small>HDRI / IES / 3D</small></h3><input ref={hdriInput} hidden type="file" accept=".hdr" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (state.hdriUrl) URL.revokeObjectURL(state.hdriUrl); set('hdriUrl', URL.createObjectURL(file)); set('hdriName', file.name) }} /><input ref={iesInput} hidden type="file" accept=".ies" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (state.iesUrl) URL.revokeObjectURL(state.iesUrl); set('iesUrl', URL.createObjectURL(file)); set('iesName', file.name) }} /><div className="asset-import-grid"><button onClick={() => hdriInput.current?.click()}><b>HDRI</b><small>{state.hdriName ?? t('pro.hdriImport')}</small></button><button onClick={() => iesInput.current?.click()}><b>IES</b><small>{state.iesName ?? t('pro.iesImport')}</small></button><button onClick={() => document.querySelector<HTMLInputElement>('.model-import-input')?.click()}><b>GLB</b><small>{t('pro.glbImport')}</small></button></div></section>

      <section><h3>{t('pro.delivery')} <small>DELIVERY</small></h3><div className="pro-segments three" role="group" aria-label={t('pro.qualityAria')}>{([['performance','quality.performance'],['balanced','quality.balanced'],['ultra','quality.ultra']] as const).map(([quality,key]) => <button key={quality} className={state.qualityPreset === quality ? 'active' : ''} onClick={() => set('qualityPreset', quality)}>{t(key)}</button>)}</div><div className="pro-segments three" role="group" aria-label={t('pro.resolutionAria')}>{([['1080p','1080P'],['2k','2K'],['4k','4K']] as [OutputResolution,string][]).map(([resolution,label]) => <button key={resolution} className={state.outputResolution === resolution ? 'active' : ''} onClick={() => set('outputResolution', resolution)}>{label}</button>)}</div><button className={`pro-master ${state.denoiseEnabled ? 'active' : ''}`} onClick={() => set('denoiseEnabled', !state.denoiseEnabled)}>LIVE DENOISE {state.denoiseEnabled ? 'ON' : 'OFF'}</button><div className="pro-actions"><button onClick={exportStoryboard}>{t('pro.storyboard')}</button><button onClick={() => mergeInput.current?.click()}>{t('pro.merge')}</button></div><input ref={mergeInput} hidden type="file" accept=".json,.lumen.json" onChange={async (event) => { const file = event.target.files?.[0]; if (file) state.mergeProject(await file.text()); event.target.value = '' }} /></section>
    </div>
  </aside>
}
