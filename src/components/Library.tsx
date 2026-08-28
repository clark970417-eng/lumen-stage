import { useRef, useState } from 'react'
import { useStudio } from '../store'
import { LIGHT_PROFILES } from '../lightProfiles'

export function Library() {
  const selected = useStudio((state) => state.selected)
  const selectedIds = useStudio((state) => state.selectedIds)
  const selectObject = useStudio((state) => state.selectObject)
  const lights = useStudio((state) => state.lights)
  const modifiers = useStudio((state) => state.modifiers)
  const studioObjects = useStudio((state) => state.studioObjects)
  const addLight = useStudio((state) => state.addLight)
  const addModifier = useStudio((state) => state.addModifier)
  const addStudioObject = useStudio((state) => state.addStudioObject)
  const undo = useStudio((state) => state.undo)
  const redo = useStudio((state) => state.redo)
  const canUndo = useStudio((state) => state.undoStack.length > 0)
  const canRedo = useStudio((state) => state.redoStack.length > 0)
  const groupSelected = useStudio((state) => state.groupSelectedLights)
  const ungroupSelected = useStudio((state) => state.ungroupSelectedLights)
  const hasSelectedGroup = useStudio((state) => state.lights.some((light) => state.selectedIds.includes(light.id) && light.groupId))
  const modelAssetName = useStudio((state) => state.modelAssetName)
  const modelImportStatus = useStudio((state) => state.modelImportStatus)
  const setModelAsset = useStudio((state) => state.setModelAsset)
  const sensorFormat = useStudio((state) => state.sensorFormat)
  const frameAspect = useStudio((state) => state.frameAspect)
  const posePreset = useStudio((state) => state.posePreset)
  const modelHeight = useStudio((state) => state.modelHeight)
  const fileInput = useRef<HTMLInputElement>(null)
  const activeUrl = useRef<string | null>(null)
  const [query, setQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matches = (id: string, ...values: string[]) => (!favoritesOnly || favoriteIds.includes(id)) && (!normalizedQuery || values.some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
  const toggleFavorite = (id: string) => setFavoriteIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])

  const importModel = (file?: File) => {
    if (!file) return
    if (activeUrl.current) URL.revokeObjectURL(activeUrl.current)
    const url = URL.createObjectURL(file)
    activeUrl.current = url
    setModelAsset(url, file.name)
  }

  return (
    <aside className="library panel">
      <div className="panel-heading"><span>場景物件</span><b>{String(lights.length + modifiers.length + studioObjects.length + 2).padStart(2, '0')}</b></div>
      <div className="library-actions" role="toolbar" aria-label="場景歷史與新增">
        <button className="add-light-button" onClick={() => addLight('square')}>＋ 新增燈</button>
        <button onClick={undo} disabled={!canUndo} title="復原（⌘Z）">↶</button>
        <button onClick={redo} disabled={!canRedo} title="重做（⇧⌘Z）">↷</button>
      </div>
      <div className="selection-actions" role="toolbar" aria-label="多選與群組">
        <span>{selectedIds.length ? `已選 ${selectedIds.length}` : 'SHIFT 多選'}</span>
        <button onClick={groupSelected} disabled={selectedIds.length < 2}>群組</button>
        <button onClick={ungroupSelected} disabled={!hasSelectedGroup}>解散</button>
      </div>
      <div className="library-filter">
        <input aria-label="搜尋場景器材" type="search" placeholder="搜尋燈具、附件、物件…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className={favoritesOnly ? 'active' : ''} aria-label="只顯示收藏" title="在物件上按兩下可加入收藏" onClick={() => setFavoritesOnly((value) => !value)}>★</button>
      </div>
      <nav className="object-list" aria-label="場景物件">
        <button className={selected === 'camera' ? 'selected' : ''} onClick={() => selectObject('camera')}>
          <span className="object-icon camera-icon" /><span><strong>Camera 01</strong><small>{sensorFormat === 'full-frame' ? 'Full frame' : sensorFormat === 'aps-c' ? 'APS-C' : 'Micro Four Thirds'} · {frameAspect}</small></span><i>C</i>
        </button>
        <button className={selected === 'model' ? 'selected' : ''} onClick={() => selectObject('model')}>
          <span className="object-icon model-icon" /><span><strong>{modelAssetName || 'Model'}</strong><small>{modelImportStatus === 'ready' ? `Imported GLB · ${modelHeight.toFixed(2)} m` : modelImportStatus === 'loading' ? 'Loading model…' : modelImportStatus === 'error' ? 'Import failed' : `${posePreset.replaceAll('-', ' ')} · ${modelHeight.toFixed(2)} m`}</small></span><i>M</i>
        </button>
        {lights.map((light, index) => matches(light.id, light.name, LIGHT_PROFILES[light.profileId].model, light.optic) && (
          <button key={light.id} className={`${selectedIds.includes(light.id) ? 'selected' : ''} ${selected === light.id ? 'primary-object' : ''} ${light.enabled ? '' : 'object-disabled'}`} onClick={(event) => selectObject(light.id, event.shiftKey)} onDoubleClick={() => toggleFavorite(light.id)}>
            <span className={`object-icon light-icon ${light.shape}`} /><span><strong>{favoriteIds.includes(light.id) ? '★ ' : ''}{light.name}</strong><small>{LIGHT_PROFILES[light.profileId].model} · {light.operationMode === 'flash' ? light.hssEnabled ? 'FLASH/HSS' : 'FLASH' : 'CONT'} · {light.optic === 'softbox' ? `${Math.round(light.modifierWidth * 100)}×${Math.round(light.modifierHeight * 100)} cm` : light.optic.toUpperCase()}{light.groupId ? ' · GROUP' : ''}</small></span><i>{light.locked ? 'LOCK' : light.enabled ? `L${index + 1}` : 'OFF'}</i>
          </button>
        ))}
        {modifiers.map((modifier, index) => matches(modifier.id, modifier.name, modifier.type, modifier.surface) && (
          <button key={modifier.id} className={selected === modifier.id ? 'selected primary-object' : ''} onClick={() => selectObject(modifier.id)} onDoubleClick={() => toggleFavorite(modifier.id)}>
            <span className={`object-icon grip-icon ${modifier.type}`} /><span><strong>{favoriteIds.includes(modifier.id) ? '★ ' : ''}{modifier.name}</strong><small>{modifier.type === 'reflector' ? 'Reflector' : modifier.type === 'flag' ? 'Black flag' : 'Foldable V-Flat'} · {modifier.surface}</small></span><i>{modifier.locked ? 'LOCK' : `G${index + 1}`}</i>
          </button>
        ))}
        {studioObjects.map((object, index) => matches(object.id, object.name, object.type, object.material) && (
          <button key={object.id} className={selected === object.id ? 'selected primary-object' : ''} onClick={() => selectObject(object.id)} onDoubleClick={() => toggleFavorite(object.id)}>
            <span className={`object-icon studio-object-icon ${object.type}`} /><span><strong>{favoriteIds.includes(object.id) ? '★ ' : ''}{object.name}</strong><small>{object.type === 'subject' ? `${object.subjectPosePreset.replaceAll('-', ' ')} · ${object.subjectHeight.toFixed(2)} m` : `${object.type.toUpperCase()} · ${object.material} · ${object.scale.toFixed(2)}×`}</small></span><i>{object.locked ? 'LOCK' : `P${index + 1}`}</i>
          </button>
        ))}
      </nav>

      <div className="panel-heading prop-heading"><span>人物與棚拍物件</span><b>{String(studioObjects.length).padStart(2, '0')}</b></div>
      <div className="prop-add-grid" role="toolbar" aria-label="新增人物與棚拍物件">
        <button onClick={() => addStudioObject('subject')}><i className="subject" />人物</button>
        <button onClick={() => addStudioObject('chair')}><i className="chair" />椅子</button>
        <button onClick={() => addStudioObject('table')}><i className="table" />桌子</button>
        <button onClick={() => addStudioObject('plinth')}><i className="plinth" />商品台</button>
        <button onClick={() => addStudioObject('cube')}><i className="cube" />方塊</button>
        <button onClick={() => addStudioObject('sphere')}><i className="sphere" />球體</button>
      </div>

      <div className="panel-heading grip-heading"><span>控光附件</span><b>{String(modifiers.length).padStart(2, '0')}</b></div>
      <div className="grip-add-grid" role="toolbar" aria-label="新增控光附件">
        <button onClick={() => addModifier('reflector')}><i className="reflector" />反光板</button>
        <button onClick={() => addModifier('flag')}><i className="flag" />黑旗</button>
        <button onClick={() => addModifier('vflat')}><i className="vflat" />V-Flat</button>
      </div>

      <div className="panel-heading backdrop-heading"><span>背景</span><b>01</b></div>
      <div className="single-backdrop">
        <span className="backdrop-thumb paper" />
        <div><strong>暖灰無縫紙</strong><small>BG–01 / LOCKED</small></div>
        <i>✓</i>
      </div>

      <div className="panel-heading asset-heading"><span>人物資產</span><b>GLB</b></div>
      <input ref={fileInput} className="asset-input model-import-input" type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={(event) => importModel(event.target.files?.[0])} />
      <button className="import-model" onClick={() => fileInput.current?.click()}><span>＋</span><p><strong>匯入人物模型</strong><small>GLB / GLTF · 自動校正身高</small></p></button>
      <div className="library-note"><span>↗</span><p><strong>直接編輯場景</strong><small>選取物件後拖移彩色軸</small></p></div>
    </aside>
  )
}
