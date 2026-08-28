import { useStudio, type MakeupStyle, type OutfitFabric, type PosePreset } from '../store'
import { calculateDepthOfField } from '../optics'
import { effectiveLightOutput, flashSyncFactor, LIGHT_PROFILES, opticTransmission } from '../lightProfiles'
import { CAMERA_BODIES, LENS_PROFILES } from '../cameraProfiles'
import { COLOR_PROFILES } from '../colorScience'

type RangeProps = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  displayValue?: string
  disabled?: boolean
  onChange: (value: number) => void
}

function Range({ label, value, min, max, step = 1, unit = '', displayValue, disabled = false, onChange }: RangeProps) {
  const progress = ((value - min) / (max - min)) * 100
  return (
    <label className="control-row">
      <span>{label}</span><output>{displayValue ?? `${value}${unit}`}</output>
      <input aria-label={label} disabled={disabled} type="range" min={min} max={max} step={step} value={value} style={{ '--progress': `${progress}%` } as React.CSSProperties} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

type AppearancePanelProps = {
  ariaPrefix: string
  skinRoughness: number
  skinOil: number
  subsurface: number
  makeup: MakeupStyle
  eyeColor: string
  hairColor: string
  hairGloss: number
  outfitFabric: OutfitFabric
  onChange: (patch: { skinRoughness?: number; skinOil?: number; subsurface?: number; makeup?: MakeupStyle; eyeColor?: string; hairColor?: string; hairGloss?: number; outfitFabric?: OutfitFabric }) => void
}

function AppearancePanel({ ariaPrefix, skinRoughness, skinOil, subsurface, makeup, eyeColor, hairColor, hairGloss, outfitFabric, onChange }: AppearancePanelProps) {
  return <div className="subject-material-block">
    <div className="subject-material-heading"><span>人物材質</span><small>SKIN / HAIR / FABRIC</small></div>
    <Range label={`${ariaPrefix}皮膚粗糙度`} value={skinRoughness} min={0} max={100} unit="%" onChange={(value) => onChange({ skinRoughness: value })} />
    <Range label={`${ariaPrefix}皮膚油光`} value={skinOil} min={0} max={100} unit="%" onChange={(value) => onChange({ skinOil: value })} />
    <Range label={`${ariaPrefix}皮下散射`} value={subsurface} min={0} max={100} unit="%" onChange={(value) => onChange({ subsurface: value })} />
    <div className="subject-look-control"><span>妝容</span><div role="group" aria-label={`${ariaPrefix}妝容`}>{([['none','裸妝'],['natural','自然'],['editorial','時尚']] as [MakeupStyle,string][]).map(([value,label]) => <button key={value} className={makeup === value ? 'active' : ''} onClick={() => onChange({ makeup: value })}>{label}</button>)}</div></div>
    <div className="appearance-controls material-colors">
      <label><span>眼睛</span><input aria-label={`${ariaPrefix}眼睛顏色`} type="color" value={eyeColor} onChange={(event) => onChange({ eyeColor: event.target.value })} /></label>
      <label><span>頭髮</span><input aria-label={`${ariaPrefix}頭髮顏色`} type="color" value={hairColor} onChange={(event) => onChange({ hairColor: event.target.value })} /></label>
    </div>
    <Range label={`${ariaPrefix}髮絲光澤`} value={hairGloss} min={0} max={100} unit="%" onChange={(value) => onChange({ hairGloss: value })} />
    <div className="subject-look-control"><span>服裝材質</span><div role="group" aria-label={`${ariaPrefix}服裝材質`}>{([['cotton','棉布'],['silk','絲綢'],['leather','皮革']] as [OutfitFabric,string][]).map(([value,label]) => <button key={value} className={outfitFabric === value ? 'active' : ''} onClick={() => onChange({ outfitFabric: value })}>{label}</button>)}</div></div>
  </div>
}

export function Inspector() {
  const state = useStudio()
  const setValue = state.setValue
  const light = state.lights.find((item) => item.id === state.selected)
  const modifier = state.modifiers.find((item) => item.id === state.selected)
  const studioObject = state.studioObjects.find((item) => item.id === state.selected)
  const subjectObjects = state.studioObjects.filter((item) => item.type === 'subject')
  const isLight = Boolean(light)
  const selectionLabel = light ? `${light.name.toUpperCase()}${state.selectedIds.length > 1 ? ` +${state.selectedIds.length - 1}` : ''}` : modifier ? modifier.name.toUpperCase() : studioObject ? studioObject.name.toUpperCase() : state.selected === 'model' ? 'MODEL' : 'CAM 01'
  const depth = calculateDepthOfField(state.focalLength, state.aperture, state.focusDistance, state.sensorFormat === 'full-frame' ? 0.03 : state.sensorFormat === 'aps-c' ? 0.019 : 0.015)
  const cameraDistance = Math.hypot(state.cameraPosition[0] - state.cameraTarget[0], state.cameraPosition[1] - state.cameraTarget[1], state.cameraPosition[2] - state.cameraTarget[2])
  const lightColor = light ? (light.colorMode === 'rgb' ? light.rgb : `rgb(${kelvinToRgb(light.temperature).join(',')})`) : '#ffffff'
  const outputLumens = light ? effectiveLightOutput(light) : 0
  const syncFactor = light ? flashSyncFactor(light, state.shutter, state.syncSpeed) : 1
  const shapeLabel = light?.shape === 'square' ? '方形' : light?.shape === 'round' ? '圓形' : '長條'
  const lightDistance = light ? Math.hypot(light.position[0] - light.target[0], light.position[1] - light.target[1], light.position[2] - light.target[2]) : 0
  const solidAngle = light ? 2 * Math.PI * (1 - Math.cos((light.beamAngle * Math.PI / 180) / 2)) : 1
  const estimatedLux = light ? Math.round((outputLumens / Math.max(0.08, solidAngle)) / Math.max(0.25, lightDistance * lightDistance) * opticTransmission(light)) : 0
  const cameraBody = CAMERA_BODIES[state.cameraBodyId]
  const lensProfile = LENS_PROFILES[state.lensProfileId]
  const sizedModifier = light ? ['softbox', 'umbrella-shoot', 'umbrella-reflect', 'beauty-dish', 'deep-parabolic', 'lantern'].includes(light.optic) : false

  return (
    <aside className="inspector panel">
      <div className="panel-heading"><span>控制面板</span><b>{selectionLabel}</b></div>
      {isLight && light && <>
        <section className="inspector-section">
          <div className="section-title"><span>燈光物件</span><button onClick={state.resetLighting}>重設全部</button></div>
          {state.selectedIds.length > 1 && <div className="multi-selection-note"><b>{state.selectedIds.length}</b><span>盞燈已多選；移動主燈會同步位移</span></div>}
          <div className="object-management">
            <input aria-label="燈具名稱" value={light.name} maxLength={32} onChange={(event) => state.updateLight(light.id, { name: event.target.value || 'Untitled light' })} />
            <button onClick={state.duplicateSelectedLights}>複製</button>
            <button className="danger" onClick={state.deleteSelectedLights}>刪除</button>
          </div>
          <div className="lock-row"><span>{light.groupId ? `群組 ${light.groupId.slice(-4).toUpperCase()}` : '未群組'}</span><button className={light.locked ? 'locked' : ''} onClick={() => state.updateLight(light.id, { locked: !light.locked })}>{light.locked ? '解除鎖定' : '鎖定位置'}</button></div>
          <div className="light-chip"><span style={{ background: lightColor, color: lightColor }} /><div><strong>{light.name}</strong><small>{shapeLabel} · {light.optic.replace('-', ' ')}{light.grid ? ' · 網格' : ''}</small></div><button className={light.enabled ? 'light-toggle on' : 'light-toggle'} onClick={() => state.updateLight(light.id, { enabled: !light.enabled })}>{light.enabled ? 'ON' : 'OFF'}</button></div>
          <div className="fixture-profile-card"><div><span>{LIGHT_PROFILES[light.profileId].maker}</span><strong>{LIGHT_PROFILES[light.profileId].model}</strong><small>{LIGHT_PROFILES[light.profileId].ratedPower} · {LIGHT_PROFILES[light.profileId].nativeCct}</small></div><b>{Math.round(outputLumens).toLocaleString()}<small> lm EQ</small></b></div>
          <label className="select-row fixture-select"><span>燈具光度預設</span><select aria-label="燈具光度預設" value={light.profileId} onChange={(event) => { const profileId = event.target.value as keyof typeof LIGHT_PROFILES; const profile = LIGHT_PROFILES[profileId]; state.updateLight(light.id, { profileId, headType: profile.headType, operationMode: profile.headType === 'strobe' ? 'flash' : 'continuous' }) }}>{Object.values(LIGHT_PROFILES).map((profile) => <option key={profile.id} value={profile.id}>{profile.maker} · {profile.model}</option>)}</select></label>
          <Range label="輸出功率" value={light.powerPercent} min={1} max={100} step={1} unit="%" onChange={(value) => state.updateLight(light.id, { powerPercent: value })} />
          <div className="sub-control operation-mode-control"><span>發光模式</span><div className="segmented-control" role="group" aria-label="發光模式"><button className={light.operationMode === 'continuous' ? 'active' : ''} onClick={() => state.updateLight(light.id, { operationMode: 'continuous' })}>常亮</button><button className={light.operationMode === 'flash' ? 'active' : ''} onClick={() => state.updateLight(light.id, { operationMode: 'flash', headType: 'strobe' })}>閃光</button></div></div>
          {light.operationMode === 'flash' && <div className="flash-controls">
            <div className={state.shutter > state.syncSpeed && !light.hssEnabled ? 'flash-status sync-error' : 'flash-status'}><div><span>SYNC</span><strong>1/{state.syncSpeed}s</strong></div><div><span>CAPTURE</span><strong>{Math.round(syncFactor * 100)}%</strong></div><div><span>FREEZE</span><strong>1/{Math.round(light.flashDuration)}s</strong></div></div>
            <button className={light.hssEnabled ? 'hss-toggle active' : 'hss-toggle'} onClick={() => state.updateLight(light.id, { hssEnabled: !light.hssEnabled })}><i />HSS 高速同步 {light.hssEnabled ? 'ON' : 'OFF'}</button>
            <Range label="閃光持續時間 t0.1" value={light.flashDuration} min={125} max={20000} step={125} displayValue={`1/${Math.round(light.flashDuration)} s`} onChange={(value) => state.updateLight(light.id, { flashDuration: value })} />
          </div>}
          <div className="sub-control head-type-control"><span>燈頭類型</span><div className="segmented-control" role="group" aria-label="燈頭類型">{([['cob', 'COB'], ['strobe', '閃燈'], ['panel', '平板']] as const).map(([headType, label]) => <button key={headType} className={light.headType === headType ? 'active' : ''} onClick={() => state.updateLight(light.id, { headType })}>{label}</button>)}</div></div>
          <div className="sub-control">
            <span>燈型</span>
            <div className="segmented-control" role="group" aria-label="燈型">
              {([['square', '方形'], ['round', '圓形'], ['strip', '長條']] as const).map(([shape, label]) => <button key={shape} className={light.shape === shape ? 'active' : ''} onClick={() => state.updateLight(light.id, { shape, ...(shape === 'strip' ? { modifierWidth: 0.4, modifierHeight: 1.2 } : shape === 'round' ? { modifierWidth: 0.9, modifierHeight: 0.9 } : { modifierWidth: 0.9, modifierHeight: 0.9 }) })}>{label}</button>)}
            </div>
          </div>
          <div className="optic-heading"><span>專業塑光附件</span><small>LIGHT SHAPER</small></div>
          <div className="optic-grid" role="group" aria-label="專業塑光附件">
            {([['softbox', '柔光箱', 55, 78], ['umbrella-shoot', '柔光傘', 82, 92], ['umbrella-reflect', '反射傘', 68, 82], ['beauty-dish', '美人碟', 50, 58], ['deep-parabolic', '深口拋物罩', 38, 46], ['lantern', '燈籠罩', 110, 96], ['standard', '標準罩', 60, 48], ['fresnel', '菲涅耳', 35, 42], ['snoot', '聚光筒', 16, 22], ['barn-doors', '四葉遮扉', 42, 40], ['projection', '投影筒', 24, 22]] as const).map(([optic, label, beamAngle, feather]) => <button key={optic} className={light.optic === optic ? `active ${optic}` : optic} onClick={() => state.updateLight(light.id, { optic, softbox: optic === 'softbox', beamAngle, feather, shape: optic === 'softbox' ? light.shape : 'round', ...(optic === 'projection' && light.goboPattern === 'none' ? { goboPattern: 'window' as const } : {}) })}><i />{label}</button>)}
          </div>
          <div className="modifier-controls">
            <button className={light.optic === 'softbox' ? 'active' : ''} onClick={() => state.updateLight(light.id, { optic: 'softbox', softbox: true, beamAngle: 55, feather: 78 })}><i />柔光罩</button>
            <button className={light.grid ? 'active' : ''} onClick={() => state.updateLight(light.id, { grid: !light.grid })}><i />蜂巢網格</button>
          </div>
          {light.optic === 'barn-doors' && <Range label="遮扉開角" value={light.barnDoorAngle} min={10} max={85} step={1} unit="°" onChange={(value) => state.updateLight(light.id, { barnDoorAngle: value })} />}
          {light.optic === 'projection' && <div className="gobo-controls">
            <div className="modifier-size-heading"><span>GOBO 投影片</span><small>PROJECTION PATTERN</small></div>
            <div className="gobo-grid" role="group" aria-label="Gobo 圖案">
              {(['none', 'window', 'blinds', 'foliage', 'breakup'] as const).map((pattern) => <button key={pattern} aria-label={`Gobo ${pattern}`} className={light.goboPattern === pattern ? `active ${pattern}` : pattern} onClick={() => state.updateLight(light.id, { goboPattern: pattern })}><i /><span>{pattern === 'none' ? '無' : pattern === 'window' ? '窗格' : pattern === 'blinds' ? '百葉' : pattern === 'foliage' ? '樹葉' : '碎影'}</span></button>)}
            </div>
            <Range label="圖案旋轉" value={light.goboRotation} min={-180} max={180} step={5} unit="°" onChange={(value) => state.updateLight(light.id, { goboRotation: value })} />
            <Range label="圖案比例" value={light.goboScale} min={0.5} max={2.5} step={0.05} displayValue={`${light.goboScale.toFixed(2)}×`} onChange={(value) => state.updateLight(light.id, { goboScale: value })} />
          </div>}
          {sizedModifier && <><div className="modifier-size-heading"><span>塑光附件實際尺寸</span><small>{light.shape === 'round' ? 'Ø ' : ''}{Math.round(light.modifierWidth * 100)} CM</small></div>
          <div className="modifier-size-presets" role="group" aria-label="柔光附件尺寸預設">
            <button onClick={() => state.updateLight(light.id, { shape: 'square', modifierWidth: 0.6, modifierHeight: 0.6 })}>60×60</button>
            <button onClick={() => state.updateLight(light.id, { shape: 'square', modifierWidth: 0.9, modifierHeight: 0.9 })}>90×90</button>
            <button onClick={() => state.updateLight(light.id, { shape: 'strip', modifierWidth: 0.3, modifierHeight: 1.2 })}>30×120</button>
            <button onClick={() => state.updateLight(light.id, { shape: 'round', modifierWidth: 1.2, modifierHeight: 1.2 })}>Ø120</button>
          </div>
          <Range label="附件寬度" value={light.modifierWidth} min={0.18} max={2.4} step={0.02} unit=" m" onChange={(value) => state.updateLight(light.id, { modifierWidth: value })} />
          <Range label="附件高度" value={light.modifierHeight} min={0.18} max={2.4} step={0.02} unit=" m" onChange={(value) => state.updateLight(light.id, { modifierHeight: value })} />
          </>}
          <div className="sub-control color-mode-control">
            <span>發色模式</span>
            <div className="segmented-control" role="group" aria-label="發色模式">
              <button className={light.colorMode === 'kelvin' ? 'active' : ''} onClick={() => state.updateLight(light.id, { colorMode: 'kelvin' })}>色溫</button>
              <button className={light.colorMode === 'rgb' ? 'active' : ''} onClick={() => state.updateLight(light.id, { colorMode: 'rgb' })}>RGB</button>
            </div>
          </div>
          {light.colorMode === 'kelvin' ? (
            <Range label="色溫" value={light.temperature} min={2800} max={7500} step={100} unit=" K" onChange={(value) => state.updateLight(light.id, { temperature: value })} />
          ) : (
            <label className="rgb-control"><span>RGB 顏色</span><input aria-label="RGB 顏色" type="color" value={light.rgb} onChange={(event) => state.updateLight(light.id, { rgb: event.target.value })} /><output>{light.rgb.toUpperCase()}</output></label>
          )}
        </section>
        <section className="inspector-section">
          <div className="section-title"><span>位置</span><small>METERS</small></div>
          <Range label="水平 X" disabled={light.locked} value={light.position[0]} min={-4} max={4} step={0.05} onChange={(value) => state.setLightAxis(light.id, 0, value)} />
          <Range label="高度 Y" disabled={light.locked} value={light.position[1]} min={0.8} max={4.5} step={0.05} onChange={(value) => state.setLightAxis(light.id, 1, value)} />
          <Range label="深度 Z" disabled={light.locked} value={light.position[2]} min={-2} max={5} step={0.05} onChange={(value) => state.setLightAxis(light.id, 2, value)} />
        </section>
        <section className="inspector-section beam-controls">
          <div className="section-title"><span>照射目標</span><small>{light.targetSubjectId ? 'SUBJECT TRACKING' : 'MANUAL'}</small></div>
          <div className="target-binding-panel">
            <label><span>跟隨人物</span><select aria-label="燈光跟隨人物" value={light.targetSubjectId ?? 'manual'} onChange={(event) => state.bindLightToSubject(light.id, event.target.value === 'manual' ? null : event.target.value, light.targetZone ?? 'face')}>
              <option value="manual">手動瞄準</option>
              <option value="model">主角 Model</option>
              {subjectObjects.map((subject, index) => <option key={subject.id} value={subject.id}>{`人物 ${index + 2} · ${subject.name}`}</option>)}
            </select></label>
            <div role="group" aria-label="人物照射區域">
              {([['face','臉部'],['chest','胸口'],['full','全身']] as const).map(([zone,label]) => <button key={zone} disabled={!light.targetSubjectId} className={light.targetZone === zone ? 'active' : ''} onClick={() => light.targetSubjectId && state.bindLightToSubject(light.id, light.targetSubjectId, zone)}>{label}</button>)}
            </div>
            <small>{light.targetSubjectId ? '人物移動或改變身高時，燈光會持續跟隨。拖動目標滑桿將切回手動模式。' : '選擇人物後即可鎖定身體區域。'}</small>
          </div>
          <div className="beam-meter"><div><span>DISTANCE</span><strong>{lightDistance.toFixed(2)} m</strong></div><div><span>EST. AT TARGET</span><strong>{estimatedLux.toLocaleString()} lx</strong></div></div>
          <button className={state.lightAimMode ? 'aim-mode-button active' : 'aim-mode-button'} onClick={() => setValue('lightAimMode', !state.lightAimMode)}><i />{state.lightAimMode ? '正在拖曳瞄準點 · T' : '在 3D 場景拖曳瞄準點 · T'}</button>
          <Range label="目標 X" value={light.target[0]} min={-3} max={3} step={0.05} onChange={(value) => state.setLightTarget(light.id, [value, light.target[1], light.target[2]])} />
          <Range label="目標 Y" value={light.target[1]} min={0.1} max={3} step={0.05} onChange={(value) => state.setLightTarget(light.id, [light.target[0], value, light.target[2]])} />
          <Range label="目標 Z" value={light.target[2]} min={-1.5} max={4} step={0.05} onChange={(value) => state.setLightTarget(light.id, [light.target[0], light.target[1], value])} />
          <Range label="光束角" value={light.beamAngle} min={12} max={90} step={1} unit="°" onChange={(value) => state.updateLight(light.id, { beamAngle: value })} />
          <Range label="邊緣柔度" value={light.feather} min={0} max={100} step={1} unit="%" onChange={(value) => state.updateLight(light.id, { feather: value })} />
        </section>
      </>}

      {modifier && <section className="inspector-section grip-inspector">
        <div className="section-title"><span>控光附件</span><small>GRIP</small></div>
        <div className="object-management">
          <input aria-label="附件名稱" value={modifier.name} maxLength={32} onChange={(event) => state.updateModifier(modifier.id, { name: event.target.value || 'Untitled grip' })} />
          <button onClick={() => state.duplicateModifier(modifier.id)}>複製</button>
          <button className="danger" onClick={() => state.deleteModifier(modifier.id)}>刪除</button>
        </div>
        <div className="lock-row"><span>{modifier.type === 'reflector' ? '反光板' : modifier.type === 'flag' ? '黑旗' : 'V-FLAT'}</span><button className={modifier.locked ? 'locked' : ''} onClick={() => state.updateModifier(modifier.id, { locked: !modifier.locked })}>{modifier.locked ? '解除鎖定' : '鎖定位置'}</button></div>
        <div className="sub-control">
          <span>類型</span>
          <div className="segmented-control" role="group" aria-label="附件類型">
            {([['reflector', '反光'], ['flag', '黑旗'], ['vflat', 'V-Flat']] as const).map(([type, label]) => <button key={type} className={modifier.type === type ? 'active' : ''} onClick={() => state.updateModifier(modifier.id, { type, surface: type === 'flag' ? 'black' : modifier.surface })}>{label}</button>)}
          </div>
        </div>
        <div className="surface-control"><span>表面材質</span><div role="group" aria-label="表面材質">
          {([['white', '白'], ['silver', '銀'], ['gold', '金'], ['black', '黑']] as const).map(([surface, label]) => <button key={surface} title={label} aria-label={`${label}色表面`} className={modifier.surface === surface ? `active ${surface}` : surface} onClick={() => state.updateModifier(modifier.id, { surface })}><i /></button>)}
        </div></div>
        <Range label="寬度" disabled={modifier.locked} value={modifier.width} min={0.3} max={3} step={0.05} unit=" m" onChange={(value) => state.updateModifier(modifier.id, { width: value })} />
        <Range label="高度" disabled={modifier.locked} value={modifier.height} min={0.4} max={3} step={0.05} unit=" m" onChange={(value) => state.updateModifier(modifier.id, { height: value })} />
        <div className="coordinate-label"><span>位置與角度</span><small>METERS / DEG</small></div>
        <Range label="水平 X" disabled={modifier.locked} value={modifier.position[0]} min={-4} max={4} step={0.05} onChange={(value) => state.setModifierTransform(modifier.id, [value, modifier.position[1], modifier.position[2]])} />
        <Range label="高度 Y" disabled={modifier.locked} value={modifier.position[1]} min={0.3} max={3.5} step={0.05} onChange={(value) => state.setModifierTransform(modifier.id, [modifier.position[0], value, modifier.position[2]])} />
        <Range label="深度 Z" disabled={modifier.locked} value={modifier.position[2]} min={-2} max={5} step={0.05} onChange={(value) => state.setModifierTransform(modifier.id, [modifier.position[0], modifier.position[1], value])} />
        <Range label="旋轉 Y" disabled={modifier.locked} value={Math.round(THREE_RAD_TO_DEG * modifier.rotationY)} min={-180} max={180} step={5} unit="°" onChange={(value) => state.setModifierTransform(modifier.id, modifier.position, value / THREE_RAD_TO_DEG)} />
        <p className="grip-note">物理材質會參與即時陰影與 Path Tracing 的反射／吸光計算。</p>
      </section>}

      {studioObject && <section className="inspector-section studio-object-inspector">
        <div className="section-title"><span>棚拍物件</span><small>{studioObject.type.toUpperCase()}</small></div>
        <div className="object-management"><input aria-label="棚拍物件名稱" value={studioObject.name} maxLength={32} onChange={(event) => state.updateStudioObject(studioObject.id, { name: event.target.value || 'Untitled object' })} /><button onClick={() => state.duplicateStudioObject(studioObject.id)}>複製</button><button className="danger" onClick={() => state.deleteStudioObject(studioObject.id)}>刪除</button></div>
        <div className="lock-row"><span>{studioObject.type === 'subject' ? '獨立人物骨架' : '獨立棚拍物件'}</span><button className={studioObject.locked ? 'locked' : ''} onClick={() => state.updateStudioObject(studioObject.id, { locked: !studioObject.locked })}>{studioObject.locked ? '解除鎖定' : '鎖定位置'}</button></div>
        <div className="object-type-grid" role="group" aria-label="棚拍物件類型">{([['subject','人物'],['chair','椅子'],['table','桌子'],['plinth','商品台'],['cube','方塊'],['sphere','球體']] as const).map(([type,label]) => <button key={type} className={studioObject.type === type ? 'active' : ''} onClick={() => state.updateStudioObject(studioObject.id, { type })}>{label}</button>)}</div>
        {studioObject.type !== 'subject' ? <>
          <div className="sub-control"><span>表面材質</span><div className="segmented-control" role="group" aria-label="棚拍物件材質">{([['matte','霧面'],['glossy','亮面'],['metal','金屬']] as const).map(([material,label]) => <button key={material} className={studioObject.material === material ? 'active' : ''} onClick={() => state.updateStudioObject(studioObject.id, { material })}>{label}</button>)}</div></div>
          <label className="object-color-control"><span>物件顏色</span><input aria-label="棚拍物件顏色" type="color" value={studioObject.color} onChange={(event) => state.updateStudioObject(studioObject.id, { color: event.target.value })} /><output>{studioObject.color.toUpperCase()}</output></label>
          <Range label="整體尺寸" disabled={studioObject.locked} value={studioObject.scale} min={0.2} max={3} step={0.05} displayValue={`${studioObject.scale.toFixed(2)}×`} onChange={(value) => state.updateStudioObject(studioObject.id, { scale: value })} />
        </> : <>
          <div className="pose-heading subject-pose-heading"><span>獨立姿勢控制</span><small>PROCEDURAL RIG</small></div>
          <div className="pose-presets" role="group" aria-label="第二人物姿勢預設">
            {([['neutral', '中性'], ['contrapposto', '重心偏移'], ['hands-on-hips', '叉腰'], ['profile', '側身'], ['editorial', '時尚']] as [PosePreset, string][]).map(([preset, label]) => <button key={preset} className={studioObject.subjectPosePreset === preset ? 'active' : ''} onClick={() => state.applyStudioSubjectPose(studioObject.id, preset)}>{label}</button>)}
          </div>
          <div className="appearance-controls subject-appearance-controls">
            <label><span>獨立膚色</span><input aria-label="第二人物膚色" type="color" value={studioObject.subjectSkinColor} onChange={(event) => state.updateStudioObject(studioObject.id, { subjectSkinColor: event.target.value })} /></label>
            <label><span>獨立服裝</span><input aria-label="第二人物服裝顏色" type="color" value={studioObject.subjectOutfitColor} onChange={(event) => state.updateStudioObject(studioObject.id, { subjectOutfitColor: event.target.value })} /></label>
          </div>
          <AppearancePanel ariaPrefix="第二人物" skinRoughness={studioObject.subjectSkinRoughness} skinOil={studioObject.subjectSkinOil} subsurface={studioObject.subjectSubsurface} makeup={studioObject.subjectMakeup} eyeColor={studioObject.subjectEyeColor} hairColor={studioObject.subjectHairColor} hairGloss={studioObject.subjectHairGloss} outfitFabric={studioObject.subjectOutfitFabric} onChange={(patch) => state.updateStudioObject(studioObject.id, {
            ...(patch.skinRoughness !== undefined ? { subjectSkinRoughness: patch.skinRoughness } : {}),
            ...(patch.skinOil !== undefined ? { subjectSkinOil: patch.skinOil } : {}),
            ...(patch.subsurface !== undefined ? { subjectSubsurface: patch.subsurface } : {}),
            ...(patch.makeup ? { subjectMakeup: patch.makeup } : {}),
            ...(patch.eyeColor ? { subjectEyeColor: patch.eyeColor } : {}),
            ...(patch.hairColor ? { subjectHairColor: patch.hairColor } : {}),
            ...(patch.hairGloss !== undefined ? { subjectHairGloss: patch.hairGloss } : {}),
            ...(patch.outfitFabric ? { subjectOutfitFabric: patch.outfitFabric } : {}),
          })} />
          <Range label="人物身高" value={studioObject.subjectHeight} min={1.45} max={2.2} step={0.01} unit=" m" onChange={(value) => state.updateStudioObject(studioObject.id, { subjectHeight: Number(value.toFixed(2)) })} />
          <Range label="頭部左右" value={studioObject.subjectPose.headYaw} min={-75} max={75} step={1} unit="°" onChange={(value) => state.updateStudioSubjectPose(studioObject.id, { headYaw: value })} />
          <Range label="頭部俯仰" value={studioObject.subjectPose.headTilt} min={-30} max={30} step={1} unit="°" onChange={(value) => state.updateStudioSubjectPose(studioObject.id, { headTilt: value })} />
          <Range label="軀幹轉向" value={studioObject.subjectPose.torsoYaw} min={-70} max={70} step={1} unit="°" onChange={(value) => state.updateStudioSubjectPose(studioObject.id, { torsoYaw: value })} />
          <Range label="左上臂" value={studioObject.subjectPose.leftArm} min={-120} max={60} step={1} unit="°" onChange={(value) => state.updateStudioSubjectPose(studioObject.id, { leftArm: value })} />
          <Range label="左手肘" value={studioObject.subjectPose.leftElbow} min={-10} max={125} step={1} unit="°" onChange={(value) => state.updateStudioSubjectPose(studioObject.id, { leftElbow: value })} />
          <Range label="右上臂" value={studioObject.subjectPose.rightArm} min={-60} max={120} step={1} unit="°" onChange={(value) => state.updateStudioSubjectPose(studioObject.id, { rightArm: value })} />
          <Range label="右手肘" value={studioObject.subjectPose.rightElbow} min={-125} max={10} step={1} unit="°" onChange={(value) => state.updateStudioSubjectPose(studioObject.id, { rightElbow: value })} />
          <Range label="髖部偏移" value={studioObject.subjectPose.hipShift} min={-0.16} max={0.16} step={0.01} unit=" m" onChange={(value) => state.updateStudioSubjectPose(studioObject.id, { hipShift: value })} />
        </>}
        <div className="coordinate-label"><span>位置與方向</span><small>METERS / DEG</small></div>
        <Range label="水平 X" disabled={studioObject.locked} value={studioObject.position[0]} min={-4} max={4} step={0.05} onChange={(value) => state.setStudioObjectTransform(studioObject.id, [value, studioObject.position[1], studioObject.position[2]])} />
        <Range label="高度 Y" disabled={studioObject.locked} value={studioObject.position[1]} min={0} max={3} step={0.05} onChange={(value) => state.setStudioObjectTransform(studioObject.id, [studioObject.position[0], value, studioObject.position[2]])} />
        <Range label="深度 Z" disabled={studioObject.locked} value={studioObject.position[2]} min={-1.5} max={5} step={0.05} onChange={(value) => state.setStudioObjectTransform(studioObject.id, [studioObject.position[0], studioObject.position[1], value])} />
        <Range label="旋轉 Y" disabled={studioObject.locked} value={Math.round(THREE_RAD_TO_DEG * studioObject.rotationY)} min={-180} max={180} step={5} unit="°" onChange={(value) => state.setStudioObjectTransform(studioObject.id, studioObject.position, value / THREE_RAD_TO_DEG)} />
      </section>}

      {state.selected === 'model' && <section className="inspector-section model-inspector">
        <div className="section-title"><span>人物位置</span><small>METERS</small></div>
        <div className="selection-chip"><span className="model-silhouette" /><div><strong>{state.modelAssetName || 'Model'}</strong><small>{state.modelImportStatus === 'ready' ? 'Imported · 1.82 m normalized' : state.modelImportStatus === 'error' ? 'Import failed · using proxy' : 'Standing / neutral'}</small></div><b>SELECTED</b></div>
        <Range label="水平 X" value={state.modelPosition[0]} min={-3} max={3} step={0.05} onChange={(value) => state.setModelTransform([value, 0, state.modelPosition[2]])} />
        <Range label="深度 Z" value={state.modelPosition[2]} min={-1} max={4} step={0.05} onChange={(value) => state.setModelTransform([state.modelPosition[0], 0, value])} />
        <Range label="面向" value={Math.round(THREE_RAD_TO_DEG * state.modelRotation)} min={-180} max={180} step={5} unit="°" onChange={(value) => state.setModelTransform(state.modelPosition, value / THREE_RAD_TO_DEG)} />
        <Range label="人物身高" value={state.modelHeight} min={1.45} max={2.2} step={0.01} unit=" m" onChange={(value) => setValue('modelHeight', Number(value.toFixed(2)))} />
        <div className="pose-heading"><span>姿勢控制</span><small>{state.modelAssetUrl ? '外部模型僅支援高度與整體旋轉' : 'PROCEDURAL RIG'}</small></div>
        <div className="pose-presets" role="group" aria-label="姿勢預設">
          {([['neutral', '中性'], ['contrapposto', '重心偏移'], ['hands-on-hips', '叉腰'], ['profile', '側身'], ['editorial', '時尚']] as [PosePreset, string][]).map(([preset, label]) => <button key={preset} className={state.posePreset === preset ? 'active' : ''} disabled={Boolean(state.modelAssetUrl)} onClick={() => state.applyPosePreset(preset)}>{label}</button>)}
        </div>
        {!state.modelAssetUrl && <>
          <div className="appearance-controls">
            <label><span>膚色</span><input aria-label="人物膚色" type="color" value={state.skinColor} onChange={(event) => setValue('skinColor', event.target.value)} /></label>
            <label><span>服裝</span><input aria-label="服裝顏色" type="color" value={state.outfitColor} onChange={(event) => setValue('outfitColor', event.target.value)} /></label>
          </div>
          <AppearancePanel ariaPrefix="人物" skinRoughness={state.skinRoughness} skinOil={state.skinOil} subsurface={state.skinSubsurface} makeup={state.makeupStyle} eyeColor={state.eyeColor} hairColor={state.hairColor} hairGloss={state.hairGloss} outfitFabric={state.outfitFabric} onChange={(patch) => {
            if (patch.skinRoughness !== undefined) setValue('skinRoughness', patch.skinRoughness)
            if (patch.skinOil !== undefined) setValue('skinOil', patch.skinOil)
            if (patch.subsurface !== undefined) setValue('skinSubsurface', patch.subsurface)
            if (patch.makeup) setValue('makeupStyle', patch.makeup)
            if (patch.eyeColor) setValue('eyeColor', patch.eyeColor)
            if (patch.hairColor) setValue('hairColor', patch.hairColor)
            if (patch.hairGloss !== undefined) setValue('hairGloss', patch.hairGloss)
            if (patch.outfitFabric) setValue('outfitFabric', patch.outfitFabric)
          }} />
          <Range label="頭部左右" value={state.modelPose.headYaw} min={-75} max={75} step={1} unit="°" onChange={(value) => state.updateModelPose({ headYaw: value })} />
          <Range label="頭部俯仰" value={state.modelPose.headTilt} min={-30} max={30} step={1} unit="°" onChange={(value) => state.updateModelPose({ headTilt: value })} />
          <Range label="軀幹轉向" value={state.modelPose.torsoYaw} min={-70} max={70} step={1} unit="°" onChange={(value) => state.updateModelPose({ torsoYaw: value })} />
          <Range label="左上臂" value={state.modelPose.leftArm} min={-120} max={60} step={1} unit="°" onChange={(value) => state.updateModelPose({ leftArm: value })} />
          <Range label="左手肘" value={state.modelPose.leftElbow} min={-10} max={125} step={1} unit="°" onChange={(value) => state.updateModelPose({ leftElbow: value })} />
          <Range label="右上臂" value={state.modelPose.rightArm} min={-60} max={120} step={1} unit="°" onChange={(value) => state.updateModelPose({ rightArm: value })} />
          <Range label="右手肘" value={state.modelPose.rightElbow} min={-125} max={10} step={1} unit="°" onChange={(value) => state.updateModelPose({ rightElbow: value })} />
          <Range label="髖部偏移" value={state.modelPose.hipShift} min={-0.16} max={0.16} step={0.01} unit=" m" onChange={(value) => state.updateModelPose({ hipShift: value })} />
        </>}
      </section>}

      {state.selected === 'camera' && <section className="inspector-section camera-body-controls">
        <div className="section-title"><span>相機機位</span><small>{state.cameraTargetSubjectId ? 'SUBJECT TRACKING' : 'MANUAL'}</small></div>
        <div className="target-binding-panel camera-target-panel">
          <label><span>跟隨人物</span><select aria-label="相機跟隨人物" value={state.cameraTargetSubjectId ?? 'manual'} onChange={(event) => state.bindCameraToSubject(event.target.value === 'manual' ? null : event.target.value, state.cameraTargetZone)}>
            <option value="manual">手動構圖</option>
            <option value="model">主角 Model</option>
            {subjectObjects.map((subject, index) => <option key={subject.id} value={subject.id}>{`人物 ${index + 2} · ${subject.name}`}</option>)}
          </select></label>
          <div role="group" aria-label="相機人物區域">
            {([['face','臉部'],['chest','胸口'],['full','全身']] as const).map(([zone,label]) => <button key={zone} disabled={!state.cameraTargetSubjectId} className={state.cameraTargetZone === zone ? 'active' : ''} onClick={() => state.cameraTargetSubjectId && state.bindCameraToSubject(state.cameraTargetSubjectId, zone)}>{label}</button>)}
          </div>
          <button className={state.cameraAutoFocus ? 'camera-af-toggle active' : 'camera-af-toggle'} onClick={() => state.setCameraAutoFocus(!state.cameraAutoFocus)}><i />{state.cameraAutoFocus ? `AF TRACK · ${state.focusDistance.toFixed(2)} M` : '啟用追蹤對焦'}</button>
          <small>人物移動時同步更新構圖；AF TRACK 會同步更新焦平面。</small>
        </div>
        <div className="camera-framing-presets" role="group" aria-label="快速人物構圖">
          {([['headshot','頭像'],['half','半身'],['full','全身']] as const).map(([preset,label]) => <button key={preset} className={state.cameraFramingPreset === preset && state.cameraTargetSubjectId ? 'active' : ''} onClick={() => state.frameCameraSubject(state.cameraTargetSubjectId ?? 'model', preset)}>{label}<small>{preset === 'headshot' ? 'TIGHT' : preset === 'half' ? 'MEDIUM' : 'WIDE'}</small></button>)}
        </div>
        <div className="camera-position-status"><span>CAMERA 01</span><b>{cameraDistance.toFixed(2)} m TO TARGET</b></div>
        <div className="coordinate-label"><span>機身位置</span><small>X / Y / Z</small></div>
        <Range label="相機 X" value={state.cameraPosition[0]} min={-4} max={4} step={0.05} onChange={(value) => state.setCameraPosition([value, state.cameraPosition[1], state.cameraPosition[2]])} />
        <Range label="相機 Y" value={state.cameraPosition[1]} min={0.35} max={3.5} step={0.05} onChange={(value) => state.setCameraPosition([state.cameraPosition[0], value, state.cameraPosition[2]])} />
        <Range label="相機 Z" value={state.cameraPosition[2]} min={1.2} max={9} step={0.05} onChange={(value) => state.setCameraPosition([state.cameraPosition[0], state.cameraPosition[1], value])} />
        <div className="coordinate-label target-label"><span>瞄準點</span><small>X / Y / Z</small></div>
        <Range label="瞄準 X" value={state.cameraTarget[0]} min={-3} max={3} step={0.05} onChange={(value) => state.setCameraTarget([value, state.cameraTarget[1], state.cameraTarget[2]])} />
        <Range label="瞄準 Y" value={state.cameraTarget[1]} min={0.2} max={2.6} step={0.05} onChange={(value) => state.setCameraTarget([state.cameraTarget[0], value, state.cameraTarget[2]])} />
        <Range label="瞄準 Z" value={state.cameraTarget[2]} min={-1.5} max={4} step={0.05} onChange={(value) => state.setCameraTarget([state.cameraTarget[0], state.cameraTarget[1], value])} />
      </section>}

      <section className="inspector-section camera-controls">
        <div className="section-title"><span>相機</span><button onClick={state.openCameraView}>進入取景</button></div>
        <div className="camera-gear-block">
          <label><span>相機機身</span><select aria-label="相機機身" value={state.cameraBodyId} onChange={(event) => state.selectCameraBody(event.target.value as keyof typeof CAMERA_BODIES)}>{Object.values(CAMERA_BODIES).map((body) => <option key={body.id} value={body.id}>{body.brand} · {body.model}</option>)}</select></label>
          <label><span>鏡頭</span><select aria-label="鏡頭型號" value={state.lensProfileId} onChange={(event) => state.selectLensProfile(event.target.value as keyof typeof LENS_PROFILES)}>{Object.values(LENS_PROFILES).map((lens) => <option key={lens.id} value={lens.id}>{lens.brand} · {lens.model}</option>)}</select></label>
          <div><span>{cameraBody.sensor === 'full-frame' ? 'FULL FRAME' : cameraBody.sensor === 'aps-c' ? 'APS-C' : 'MFT'}</span><b>{cameraBody.megapixels} MP</b><small>{lensProfile.blades} BLADES · ƒ/{lensProfile.maxAperture}</small></div>
        </div>
        <div className="lens-character-block">
          <div className="lens-character-heading"><span>鏡頭光學特性</span><small>OPTICAL CHARACTER</small></div>
          <div className="lens-optics-switch-row"><button className={state.lensOpticsEnabled ? 'active' : ''} onClick={() => setValue('lensOpticsEnabled', !state.lensOpticsEnabled)}><i />{state.lensOpticsEnabled ? '光學模擬 ON' : '光學模擬 OFF'}</button><button onClick={() => { setValue('lensVignette', lensProfile.vignette); setValue('lensDistortion', lensProfile.distortion); setValue('lensChromaticAberration', lensProfile.chromaticAberration); setValue('lensBreathing', lensProfile.breathing) }}>鏡頭預設</button></div>
          <Range label="周邊暗角" disabled={!state.lensOpticsEnabled} value={state.lensVignette} min={0} max={100} unit="%" onChange={(value) => setValue('lensVignette', value)} />
          <Range label="鏡頭變形" disabled={!state.lensOpticsEnabled} value={state.lensDistortion} min={-100} max={100} unit="" onChange={(value) => setValue('lensDistortion', value)} />
          <div className="distortion-legend"><span>桶狀</span><i /><span>枕狀</span></div>
          <Range label="色差" disabled={!state.lensOpticsEnabled} value={state.lensChromaticAberration} min={0} max={100} unit="%" onChange={(value) => setValue('lensChromaticAberration', value)} />
          <Range label="對焦呼吸" disabled={!state.lensOpticsEnabled} value={state.lensBreathing} min={0} max={100} unit="%" onChange={(value) => setValue('lensBreathing', value)} />
          <div className="bokeh-blade-readout"><span>散景光圈葉片</span><b>{lensProfile.blades}</b><small>{lensProfile.blades >= 11 ? 'ROUND' : 'DEFINED'}</small></div>
        </div>
        <div className="color-science-block">
          <div className="lens-character-heading"><span>色彩科學</span><small>RAW / COLOR PIPELINE</small></div>
          <div className="image-format-control" role="group" aria-label="影像格式">
            <button className={state.imageFormat === 'raw' ? 'active' : ''} onClick={() => setValue('imageFormat', 'raw')}><b>RAW</b><small>寬容度預覽</small></button>
            <button className={state.imageFormat === 'jpeg' ? 'active' : ''} onClick={() => setValue('imageFormat', 'jpeg')}><b>JPEG</b><small>相機成像</small></button>
          </div>
          <label className="color-profile-select"><span>相機色彩 Profile</span><select aria-label="相機色彩 Profile" value={state.colorProfileId} onChange={(event) => setValue('colorProfileId', event.target.value as keyof typeof COLOR_PROFILES)}>{Object.values(COLOR_PROFILES).map((profile) => <option key={profile.id} value={profile.id}>{profile.code} · {profile.name}</option>)}</select></label>
          <div className="wb-presets" role="group" aria-label="白平衡預設">{[[3200,'鎢絲'],[4300,'棚燈'],[5600,'日光'],[6500,'陰天']] .map(([temperature,label]) => <button key={temperature} className={state.whiteBalance === temperature ? 'active' : ''} onClick={() => setValue('whiteBalance', temperature as number)}>{label}<small>{temperature}K</small></button>)}</div>
          <Range label="白平衡" value={state.whiteBalance} min={2000} max={9000} step={100} unit=" K" onChange={(value) => setValue('whiteBalance', value)} />
          <Range label="Tint" value={state.whiteBalanceTint} min={-100} max={100} onChange={(value) => setValue('whiteBalanceTint', value)} />
          <Range label="高光 Roll-off" value={state.highlightRolloff} min={0} max={100} unit="%" onChange={(value) => setValue('highlightRolloff', value)} />
          <Range label="對比曲線" value={state.toneCurve} min={0} max={100} unit="%" onChange={(value) => setValue('toneCurve', value)} />
          <Range label="LUT 強度" disabled={state.imageFormat === 'raw'} value={state.lutIntensity} min={0} max={100} unit="%" onChange={(value) => setValue('lutIntensity', value)} />
          <div className="raw-pipeline-note"><i /><span>{state.imageFormat === 'raw' ? 'RAW：保留低對比與高光寬容度，LUT 僅作 metadata。' : `${COLOR_PROFILES[state.colorProfileId].code}：完整套用色彩、曲線與 LUT。`}</span></div>
        </div>
        <div className="sensor-simulation-block">
          <div className="lens-character-heading"><span>感光元件與快門</span><small>SENSOR / SHUTTER</small></div>
          <div className="sensor-spec-strip"><span>BASE ISO <b>{cameraBody.nativeIso}</b></span><span>DR <b>{cameraBody.dynamicRange} STOPS</b></span><span>READOUT <b>{cameraBody.readoutMs} MS</b></span></div>
          <button className={state.sensorSimulationEnabled ? 'sensor-master active' : 'sensor-master'} onClick={() => setValue('sensorSimulationEnabled', !state.sensorSimulationEnabled)}><i />{state.sensorSimulationEnabled ? '感光元件模擬 ON' : '感光元件模擬 OFF'}</button>
          <div className="shutter-mode-control" role="group" aria-label="快門類型"><button className={state.shutterMode === 'mechanical' ? 'active' : ''} onClick={() => setValue('shutterMode', 'mechanical')}>機械快門<small>GLOBAL</small></button><button className={state.shutterMode === 'electronic' ? 'active' : ''} onClick={() => setValue('shutterMode', 'electronic')}>電子快門<small>{cameraBody.readoutMs} MS</small></button></div>
          <Range label="動態範圍" disabled={!state.sensorSimulationEnabled} value={state.sensorDynamicRange} min={8} max={16} step={0.1} displayValue={`${state.sensorDynamicRange.toFixed(1)} stops`} onChange={(value) => setValue('sensorDynamicRange', Number(value.toFixed(1)))} />
          <Range label="降噪強度" disabled={!state.sensorSimulationEnabled} value={state.noiseReduction} min={0} max={100} unit="%" onChange={(value) => setValue('noiseReduction', value)} />
          <Range label="彩色噪點" disabled={!state.sensorSimulationEnabled} value={state.colorNoise} min={0} max={100} unit="%" onChange={(value) => setValue('colorNoise', value)} />
          <Range label="動態模糊" disabled={!state.sensorSimulationEnabled} value={state.motionBlur} min={0} max={100} unit="%" onChange={(value) => setValue('motionBlur', value)} />
          <Range label="Rolling Shutter" disabled={!state.sensorSimulationEnabled || state.shutterMode !== 'electronic'} value={state.rollingShutter} min={0} max={100} unit="%" onChange={(value) => setValue('rollingShutter', value)} />
          <div className={`sensor-warning ${state.shutterMode === 'electronic' && state.rollingShutter > 60 ? 'warning' : ''}`}><i /><span>{state.shutterMode === 'electronic' ? `逐行讀出 ${cameraBody.readoutMs} ms · 快速移動可能傾斜` : '機械快門 · 無逐行掃描變形'}</span></div>
        </div>
        <div className="composition-guide-control"><span>構圖輔助</span><div role="group" aria-label="構圖輔助線">{([['none','關閉'],['thirds','三分'],['golden','黃金'],['safe','安全框']] as const).map(([guide,label]) => <button key={guide} className={state.compositionGuide === guide ? 'active' : ''} onClick={() => setValue('compositionGuide', guide)}>{label}</button>)}</div></div>
        <div className="optics-status">
          <div><span>NEAR</span><strong>{depth.near.toFixed(2)} m</strong></div>
          <div><span>FOCUS</span><strong>{state.focusDistance.toFixed(2)} m</strong></div>
          <div><span>FAR</span><strong>{depth.far ? `${depth.far.toFixed(2)} m` : '∞'}</strong></div>
        </div>
        <div className="optics-toggles">
          <button className={state.dofEnabled ? 'active' : ''} onClick={() => setValue('dofEnabled', !state.dofEnabled)}><i />景深預覽</button>
          <button className={state.focusGuide ? 'active' : ''} onClick={() => setValue('focusGuide', !state.focusGuide)}><i />焦點提示</button>
        </div>
        <div className="ambient-control-block">
          <div className="modifier-size-heading"><span>棚內環境光</span><small>AMBIENT / FLASH SYNC</small></div>
          <Range label="環境光強度" value={state.ambientLevel} min={0} max={100} step={1} unit="%" onChange={(value) => setValue('ambientLevel', value)} />
          <Range label="環境光色溫" value={state.ambientTemperature} min={2200} max={7500} step={100} unit=" K" onChange={(value) => setValue('ambientTemperature', value)} />
          <label className="select-row"><span>最高同步速度</span><select aria-label="最高同步速度" value={state.syncSpeed} onChange={(event) => setValue('syncSpeed', Number(event.target.value))}>{[125, 160, 200, 250, 320, 500].map((value) => <option key={value} value={value}>1/{value} s</option>)}</select></label>
          {state.lights.some((item) => item.enabled && item.operationMode === 'flash') && <div className={state.shutter > state.syncSpeed && state.lights.some((item) => item.enabled && item.operationMode === 'flash' && !item.hssEnabled) ? 'global-sync-status error' : 'global-sync-status'}><i /><span>{state.shutter > state.syncSpeed ? '快門超過同步速度' : '閃光同步範圍內'}</span><b>1/{state.shutter}s</b></div>}
        </div>
        <div className="sub-control sensor-control">
          <span>感光元件覆寫</span>
          <div className="segmented-control" role="group" aria-label="感光元件">
            {([['full-frame', 'FF'], ['aps-c', 'APS-C'], ['mft', 'MFT']] as const).map(([format, label]) => <button key={format} className={state.sensorFormat === format ? 'active' : ''} onClick={() => setValue('sensorFormat', format)}>{label}</button>)}
          </div>
        </div>
        <div className="sub-control frame-control">
          <span>畫面比例</span>
          <div className="segmented-control" role="group" aria-label="畫面比例">
            {(['3:2', '4:5', '1:1', '16:9'] as const).map((ratio) => <button key={ratio} className={state.frameAspect === ratio ? 'active' : ''} onClick={() => setValue('frameAspect', ratio)}>{ratio}</button>)}
          </div>
        </div>
        <div className="orientation-control" role="group" aria-label="畫面方向">
          <button className={state.frameOrientation === 'landscape' ? 'active' : ''} onClick={() => setValue('frameOrientation', 'landscape')}><i className="landscape-icon" />橫幅</button>
          <button className={state.frameOrientation === 'portrait' ? 'active' : ''} onClick={() => setValue('frameOrientation', 'portrait')}><i className="portrait-icon" />直幅</button>
        </div>
        <button className="focus-target-button" onClick={() => { state.setCameraAutoFocus(false); setValue('focusDistance', Number(cameraDistance.toFixed(2))) }}>對焦距離設為瞄準點 · {cameraDistance.toFixed(2)} m</button>
        <Range label="焦段" disabled={lensProfile.minFocal === lensProfile.maxFocal} value={state.focalLength} min={lensProfile.minFocal} max={lensProfile.minFocal === lensProfile.maxFocal ? lensProfile.maxFocal + 1 : lensProfile.maxFocal} unit=" mm" onChange={(value) => setValue('focalLength', value)} />
        <Range label="光圈" value={state.aperture} min={lensProfile.maxAperture} max={16} step={0.1} onChange={(value) => setValue('aperture', Number(value.toFixed(1)))} />
        <Range label="對焦距離" value={state.focusDistance} min={1} max={10} step={0.05} displayValue={`${state.focusDistance.toFixed(2)} m`} onChange={(value) => { if (state.cameraAutoFocus) state.setCameraAutoFocus(false); setValue('focusDistance', Number(value.toFixed(2))) }} />
        <div className="shutter-speed-control">
          <div><span>快門</span><output>1/{state.shutter} s</output></div>
          <div role="group" aria-label="快門速度">
            {[8, 15, 30, 60, 125, 250, 500, 1000, 2000].map((value) => <button key={value} aria-label={`快門 1/${value} 秒`} className={state.shutter === value ? 'active' : ''} onClick={() => setValue('shutter', value)}>1/{value}</button>)}
          </div>
        </div>
        <Range label="ISO" value={state.iso} min={100} max={12800} step={100} onChange={(value) => setValue('iso', value)} />
      </section>
    </aside>
  )
}

const THREE_RAD_TO_DEG = 180 / Math.PI

function kelvinToRgb(kelvin: number): [number, number, number] {
  const temp = kelvin / 100
  const red = temp <= 66 ? 255 : 329.698727446 * Math.pow(temp - 60, -0.1332047592)
  const green = temp <= 66 ? 99.4708025861 * Math.log(temp) - 161.1195681661 : 288.1221695283 * Math.pow(temp - 60, -0.0755148492)
  const blue = temp >= 66 ? 255 : temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.044792731
  return [red, green, blue].map((value) => Math.round(Math.max(0, Math.min(255, value)))) as [number, number, number]
}
