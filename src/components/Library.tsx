import { useRef, useState } from 'react'
import { useT } from '../i18n'
import { useStudio } from '../store'
import { LIGHT_PROFILES } from '../lightProfiles'
import { BACKDROP_FAMILIES, BACKDROPS, getBackdrop, type BackdropFamily } from '../backdrops'
import { useCatalogT, type MessageKey } from '../i18n'

/**
 * Backdrop picker.
 *
 * Swatches rather than a dropdown, because the choice is a colour decision —
 * and the reflectance readout underneath is the part a dropdown could never
 * carry: it says how far under the face the background will land before you
 * have lit anything.
 */
function BackdropPicker() {
  const t = useT()
  const ct = useCatalogT()
  const backdropId = useStudio((state) => state.backdropId)
  const backdropWidth = useStudio((state) => state.backdropWidth)
  const backdropDistance = useStudio((state) => state.backdropDistance)
  const selectBackdrop = useStudio((state) => state.selectBackdrop)
  const setValue = useStudio((state) => state.setValue)
  const active = getBackdrop(backdropId)
  const [family, setFamily] = useState<BackdropFamily>(active.family === 'none' ? 'paper' : active.family)
  const entries = BACKDROPS.filter((item) => item.family === family)

  return (
    <div className="backdrop-picker">
      <div className="backdrop-family-tabs" role="tablist">
        {BACKDROP_FAMILIES.map((item) => (
          <button key={item} role="tab" aria-selected={family === item} className={family === item ? 'active' : ''} onClick={() => setFamily(item)}>
            {t(`backdrop.family.${item}` as MessageKey)}
          </button>
        ))}
      </div>
      <div className="backdrop-swatches" role="group" aria-label={t('backdrop.title')}>
        {entries.map((item) => (
          <button key={item.id} className={`backdrop-swatch ${backdropId === item.id ? 'active' : ''}`} title={`${item.maker} ${item.label} — ${item.note}`} onClick={() => selectBackdrop(item.id)}>
            <i style={{ background: item.color }} />
            <span>{ct(`backdrop.${item.id}`, item.label)}</span>
          </button>
        ))}
      </div>
      {active.family !== 'none' && (
        <>
          <div className="backdrop-readout">
            <span>{t('backdrop.reflectance')}</span>
            <strong>{Math.round(active.reflectance * 100)}%</strong>
          </div>
          <label className="control-row">
            <span>{t('backdrop.width')}</span><output>{backdropWidth.toFixed(2)} m</output>
            <input aria-label={t('backdrop.width')} type="range" min={0} max={active.widths.length - 1} step={1}
              value={Math.max(0, active.widths.indexOf(backdropWidth))}
              style={{ '--progress': `${active.widths.length > 1 ? (Math.max(0, active.widths.indexOf(backdropWidth)) / (active.widths.length - 1)) * 100 : 100}%` } as React.CSSProperties}
              onChange={(event) => setValue('backdropWidth', active.widths[Number(event.target.value)])} />
          </label>
          <label className="control-row">
            <span>{t('backdrop.distance')}</span><output>{backdropDistance.toFixed(2)} m</output>
            <input aria-label={t('backdrop.distance')} type="range" min={0.6} max={4} step={0.05} value={backdropDistance}
              style={{ '--progress': `${((backdropDistance - 0.6) / 3.4) * 100}%` } as React.CSSProperties}
              onChange={(event) => setValue('backdropDistance', Number(event.target.value))} />
          </label>
          <p className="pose-note">{active.note}</p>
        </>
      )}
    </div>
  )
}

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
  const t = useT()
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
      <div className="panel-heading"><span>{t('library.title')}</span><b>{String(lights.length + modifiers.length + studioObjects.length + 2).padStart(2, '0')}</b></div>
      <div className="library-actions" role="toolbar" aria-label={t('library.history')}>
        <button className="add-light-button" onClick={() => addLight('square')}>{t('library.addLight')}</button>
        <button onClick={undo} disabled={!canUndo} title={t('library.undo.title')}>↶</button>
        <button onClick={redo} disabled={!canRedo} title={t('library.redo.title')}>↷</button>
      </div>
      <div className="selection-actions" role="toolbar" aria-label={t('library.selection')}>
        <span>{selectedIds.length ? t('library.selected', { count: selectedIds.length }) : t('library.shiftHint')}</span>
        <button onClick={groupSelected} disabled={selectedIds.length < 2}>{t('library.group')}</button>
        <button onClick={ungroupSelected} disabled={!hasSelectedGroup}>{t('library.ungroup')}</button>
      </div>
      <div className="library-filter">
        <input aria-label={t('library.search')} type="search" placeholder={t('library.search.placeholder')} value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className={favoritesOnly ? 'active' : ''} aria-label={t('library.favorites')} title={t('library.favorites.title')} onClick={() => setFavoritesOnly((value) => !value)}>★</button>
      </div>
      <nav className="object-list" aria-label={t('library.title')}>
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

      <div className="panel-heading prop-heading"><span>{t('library.props')}</span><b>{String(studioObjects.length).padStart(2, '0')}</b></div>
      <div className="prop-add-grid" role="toolbar" aria-label={t('library.props.add')}>
        <button onClick={() => addStudioObject('subject')}><i className="subject" />{t('object.subject')}</button>
        <button onClick={() => addStudioObject('dog')}><i className="dog" />{t('object.dog')}</button>
        <button onClick={() => addStudioObject('cat')}><i className="cat" />{t('object.cat')}</button>
        <button onClick={() => addStudioObject('product')}><i className="product" />{t('object.product')}</button>
        <button onClick={() => addStudioObject('chair')}><i className="chair" />{t('object.chair')}</button>
        <button onClick={() => addStudioObject('table')}><i className="table" />{t('object.table')}</button>
        <button onClick={() => addStudioObject('plinth')}><i className="plinth" />{t('object.plinth')}</button>
        <button onClick={() => addStudioObject('cube')}><i className="cube" />{t('object.cube')}</button>
        <button onClick={() => addStudioObject('sphere')}><i className="sphere" />{t('object.sphere')}</button>
      </div>

      <div className="panel-heading grip-heading"><span>{t('library.grip')}</span><b>{String(modifiers.length).padStart(2, '0')}</b></div>
      <div className="grip-add-grid" role="toolbar" aria-label={t('library.grip.add')}>
        <button onClick={() => addModifier('reflector')}><i className="reflector" />{t('grip.reflector')}</button>
        <button onClick={() => addModifier('flag')}><i className="flag" />{t('grip.flag')}</button>
        <button onClick={() => addModifier('vflat')}><i className="vflat" />V-Flat</button>
      </div>

      <div className="panel-heading backdrop-heading"><span>{t('backdrop.title')}</span><b>{BACKDROPS.length - 1}</b></div>
      <BackdropPicker />

      <div className="panel-heading asset-heading"><span>{t('library.asset')}</span><b>GLB</b></div>
      <input ref={fileInput} className="asset-input model-import-input" type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={(event) => importModel(event.target.files?.[0])} />
      <button className="import-model" onClick={() => fileInput.current?.click()}><span>＋</span><p><strong>{t('library.import')}</strong><small>{t('library.import.sub')}</small></p></button>
      <div className="library-note"><span>↗</span><p><strong>{t('library.note')}</strong><small>{t('library.note.sub')}</small></p></div>
    </aside>
  )
}
