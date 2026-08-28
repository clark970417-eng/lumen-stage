import { LENS_PROFILES } from './cameraProfiles'
import { captureCurrentShot } from './shotCapture'
import { useStudio, type CompositionGuide, type ExposureOverlay, type StudioState } from './store'

export const IS_APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
const MOD = IS_APPLE ? '⌘' : 'Ctrl'
const ALT = IS_APPLE ? '⌥' : 'Alt'

export type ShortcutSection = '檢視與渲染' | '面板' | '選取與編輯' | '相機參數' | '移動物件'

export type Shortcut = {
  id: string
  section: ShortcutSection
  label: string
  keys: string[]
  hint?: string
  allowInInput?: boolean
  match: (event: KeyboardEvent) => boolean
  available?: (state: StudioState) => boolean
  /** 回傳的字串會以浮動提示顯示，讓使用者知道按鍵做了什麼 */
  run: (state: StudioState, event: KeyboardEvent) => string | void
}

type Combo = { key: string; mod?: boolean; shift?: boolean; alt?: boolean }

const combo = (spec: Combo) => (event: KeyboardEvent) =>
  event.key.toLowerCase() === spec.key.toLowerCase()
  && (event.metaKey || event.ctrlKey) === !!spec.mod
  && event.shiftKey === !!spec.shift
  && event.altKey === !!spec.alt

const APERTURE_STOPS = [1.2, 1.4, 1.8, 2, 2.8, 4, 5.6, 8, 11, 16]
const ISO_STOPS = [100, 200, 400, 800, 1600, 3200, 6400, 12800]
const SHUTTER_STOPS = [8, 15, 30, 60, 125, 250, 500, 1000, 2000]
const COMPOSITION_GUIDES: CompositionGuide[] = ['none', 'thirds', 'golden', 'safe']
const COMPOSITION_LABELS: Record<CompositionGuide, string> = { none: '關閉', thirds: '三分法', golden: '黃金比例', safe: '安全框' }
const EXPOSURE_OVERLAYS: ExposureOverlay[] = ['none', 'false-color', 'clipping']
const EXPOSURE_LABELS: Record<ExposureOverlay, string> = { none: '關閉', 'false-color': '偽色', clipping: '過曝斑馬紋' }

/** 在標準級數中往前／往後跳一格，超出範圍就停在邊界 */
function stepStop(stops: number[], current: number, direction: 1 | -1, min = -Infinity, max = Infinity) {
  const allowed = stops.filter((stop) => stop >= min && stop <= max)
  if (!allowed.length) return current
  const nearest = allowed.reduce((best, stop) => Math.abs(stop - current) < Math.abs(best - current) ? stop : best, allowed[0])
  const index = allowed.indexOf(nearest)
  const next = allowed[Math.min(allowed.length - 1, Math.max(0, index + direction))]
  return next
}

function cycle<T>(values: T[], current: T, direction: 1 | -1 = 1) {
  const index = values.indexOf(current)
  return values[(index + direction + values.length) % values.length]
}

const selectedLight = (state: StudioState) => state.lights.find((light) => light.id === state.selected)
const selectedModifier = (state: StudioState) => state.modifiers.find((modifier) => modifier.id === state.selected)
const selectedStudioObject = (state: StudioState) => state.studioObjects.find((object) => object.id === state.selected)

function selectionName(state: StudioState) {
  return selectedLight(state)?.name
    ?? selectedModifier(state)?.name
    ?? selectedStudioObject(state)?.name
    ?? (state.selected === 'camera' ? '相機' : state.selected === 'meter' ? '測光表' : '模特兒')
}

const NUDGE_AXIS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

const add = (position: [number, number, number], delta: [number, number, number]): [number, number, number] =>
  [position[0] + delta[0], position[1] + delta[1], position[2] + delta[2]]

const positionLabel = (position: [number, number, number]) =>
  `X ${position[0].toFixed(2)} · Y ${position[1].toFixed(2)} · Z ${position[2].toFixed(2)} M`

function nudgeSelection(state: StudioState, event: KeyboardEvent): string | void {
  const axis = NUDGE_AXIS[event.key]
  if (!axis) return
  const [x, z] = axis
  const step = event.shiftKey ? 0.5 : 0.1
  // ⌥ + 上下鍵改成調整高度
  if (event.altKey && !z) return
  const delta: [number, number, number] = event.altKey ? [0, -z * step, 0] : [x * step, 0, z * step]

  const light = selectedLight(state)
  if (light) {
    if (light.locked) return `${light.name} 已鎖定`
    const next = add(light.position, delta)
    state.setLightPosition(light.id, next)
    const moved = state.selectedIds.length > 1 ? `${state.selectedIds.length} 盞燈` : light.name
    return `${moved} · ${positionLabel(next)}`
  }
  const modifier = selectedModifier(state)
  if (modifier) {
    if (modifier.locked) return `${modifier.name} 已鎖定`
    const next = add(modifier.position, delta)
    state.setModifierTransform(modifier.id, next)
    return `${modifier.name} · ${positionLabel(next)}`
  }
  const object = selectedStudioObject(state)
  if (object) {
    if (object.locked) return `${object.name} 已鎖定`
    const next = add(object.position, delta)
    state.setStudioObjectTransform(object.id, next)
    return `${object.name} · ${positionLabel(next)}`
  }
  if (state.selected === 'camera') {
    const next = add(state.cameraPosition, delta)
    state.setCameraPosition(next)
    return `相機 · ${positionLabel(next)}`
  }
  if (state.selected === 'meter') {
    const next = add(state.meterPosition, delta)
    state.setMeterPosition(next)
    return `測光表 · ${positionLabel(next)}`
  }
  const next = add(state.modelPosition, delta)
  state.setModelTransform(next)
  return `模特兒 · ${positionLabel(next)}`
}

export const SHORTCUTS: Shortcut[] = [
  // ── 檢視與渲染 ──────────────────────────────────────────────
  {
    id: 'view-studio', section: '檢視與渲染', label: '棚內視角', keys: ['1'],
    match: combo({ key: '1' }),
    run: (state) => { state.openStudioView(); return '棚內視角' },
  },
  {
    id: 'view-top', section: '檢視與渲染', label: '俯視燈位', keys: ['2'],
    match: combo({ key: '2' }),
    run: (state) => { state.openTopView(); return '俯視燈位' },
  },
  {
    id: 'view-camera', section: '檢視與渲染', label: '相機取景', keys: ['3'],
    match: combo({ key: '3' }),
    run: (state) => { state.openCameraView(); return '相機取景' },
  },
  {
    id: 'view-render', section: '檢視與渲染', label: '照片渲染', keys: ['4'],
    match: combo({ key: '4' }),
    run: (state) => { state.startPhotoRender(); return '開始照片渲染' },
  },
  {
    id: 'render-pause', section: '檢視與渲染', label: '暫停／繼續取樣', keys: ['Space'],
    match: combo({ key: ' ' }),
    available: (state) => state.renderMode === 'path',
    run: (state) => {
      if (state.renderMode !== 'path') return
      const paused = !state.pathTracingPaused
      state.setValue('pathTracingPaused', paused)
      return paused ? '取樣已暫停' : '取樣繼續'
    },
  },
  {
    id: 'render-restart', section: '檢視與渲染', label: '重新取樣', keys: ['⇧', 'R'],
    match: combo({ key: 'r', shift: true }),
    available: (state) => state.renderMode === 'path',
    run: (state) => {
      if (state.renderMode !== 'path') return
      state.restartPhotoRender()
      return '重新取樣'
    },
  },

  // ── 面板 ───────────────────────────────────────────────────
  {
    id: 'panel-help', section: '面板', label: '快捷鍵說明', keys: ['?'], allowInInput: false,
    match: (event) => !event.metaKey && !event.ctrlKey && !event.altKey && (event.key === '?' || (event.key === '/' && event.shiftKey)),
    run: (state) => { state.setValue('shortcutHelpOpen', !state.shortcutHelpOpen) },
  },
  {
    id: 'panel-analysis', section: '面板', label: '曝光分析', keys: ['M'],
    match: combo({ key: 'm' }),
    run: (state) => { const open = !state.analysisOpen; state.setValue('analysisOpen', open); return `曝光分析 ${open ? '開啟' : '關閉'}` },
  },
  {
    id: 'panel-pro', section: '面板', label: 'PRO 控制台', keys: ['P'],
    match: combo({ key: 'p' }),
    run: (state) => { const open = !state.professionalPanelOpen; state.setValue('professionalPanelOpen', open); return `PRO 控制台 ${open ? '開啟' : '關閉'}` },
  },
  {
    id: 'panel-shots', section: '面板', label: '鏡位庫', keys: ['B'],
    match: combo({ key: 'b' }),
    run: (state) => { const open = !state.shotPanelOpen; state.setValue('shotPanelOpen', open); return `鏡位庫 ${open ? '開啟' : '關閉'}` },
  },
  {
    id: 'panel-escape', section: '面板', label: '關閉面板／取消瞄準', keys: ['Esc'], allowInInput: true,
    match: combo({ key: 'Escape' }),
    run: (state, event) => {
      if (state.shortcutHelpOpen) { state.setValue('shortcutHelpOpen', false); return }
      if (isEditingText(event.target)) { (event.target as HTMLElement).blur(); return }
      if (state.lightAimMode) { state.setValue('lightAimMode', false); return '離開瞄準模式' }
      if (state.shotPanelOpen) { state.setValue('shotPanelOpen', false); return '關閉鏡位庫' }
      if (state.professionalPanelOpen) { state.setValue('professionalPanelOpen', false); return '關閉 PRO 控制台' }
      if (state.analysisOpen) { state.setValue('analysisOpen', false); return '關閉曝光分析' }
    },
  },

  // ── 選取與編輯 ──────────────────────────────────────────────
  {
    id: 'transform-move', section: '選取與編輯', label: '移動模式', keys: ['G'],
    match: combo({ key: 'g' }),
    run: (state) => { state.setValue('lightAimMode', false); state.setValue('transformMode', 'translate'); return '移動模式' },
  },
  {
    id: 'transform-rotate', section: '選取與編輯', label: '旋轉模式', keys: ['R'],
    match: combo({ key: 'r' }),
    available: (state) => state.selected === 'model' || !!selectedModifier(state) || !!selectedStudioObject(state),
    run: (state) => {
      if (state.selected !== 'model' && !selectedModifier(state) && !selectedStudioObject(state)) return '此物件無法旋轉'
      state.setValue('lightAimMode', false)
      state.setValue('transformMode', 'rotate')
      return '旋轉模式'
    },
  },
  {
    id: 'transform-aim', section: '選取與編輯', label: '編輯燈光照射目標', keys: ['T'],
    match: combo({ key: 't' }),
    available: (state) => !!selectedLight(state),
    run: (state) => {
      if (!selectedLight(state)) return '請先選取燈具'
      const aim = !state.lightAimMode
      state.setValue('lightAimMode', aim)
      return aim ? '瞄準模式' : '離開瞄準模式'
    },
  },
  {
    id: 'light-add', section: '選取與編輯', label: '新增燈具', keys: ['⇧', 'A'],
    match: combo({ key: 'a', shift: true }),
    run: (state) => { state.addLight('square'); return '已新增燈具' },
  },
  {
    id: 'light-toggle', section: '選取與編輯', label: '開關選取的燈', keys: ['H'],
    match: combo({ key: 'h' }),
    available: (state) => !!selectedLight(state),
    run: (state) => {
      const light = selectedLight(state)
      if (!light) return '請先選取燈具'
      state.updateLight(light.id, { enabled: !light.enabled })
      return `${light.name} ${light.enabled ? '關閉' : '開啟'}`
    },
  },
  {
    id: 'light-solo', section: '選取與編輯', label: '單燈檢視 SOLO', keys: ['L'],
    match: combo({ key: 'l' }),
    available: (state) => !!selectedLight(state),
    run: (state) => {
      const light = selectedLight(state)
      if (!light) return '請先選取燈具'
      const solo = state.soloLightId === light.id ? null : light.id
      state.setValue('soloLightId', solo)
      return solo ? `SOLO · ${light.name}` : '恢復全部燈光'
    },
  },
  {
    id: 'edit-duplicate', section: '選取與編輯', label: '複製選取物件', keys: [MOD, 'D'],
    match: combo({ key: 'd', mod: true }),
    run: (state) => {
      if (state.selectedIds.length) { state.duplicateSelectedLights(); return `已複製 ${state.selectedIds.length} 盞燈` }
      const modifier = selectedModifier(state)
      if (modifier) { state.duplicateModifier(modifier.id); return `已複製 ${modifier.name}` }
      const object = selectedStudioObject(state)
      if (object) { state.duplicateStudioObject(object.id); return `已複製 ${object.name}` }
      return '沒有可複製的物件'
    },
  },
  {
    id: 'edit-delete', section: '選取與編輯', label: '刪除選取物件', keys: ['Delete'],
    match: (event) => (event.key === 'Backspace' || event.key === 'Delete') && !event.metaKey && !event.ctrlKey,
    run: (state) => {
      if (state.selectedIds.length) { const count = state.selectedIds.length; state.deleteSelectedLights(); return `已刪除 ${count} 盞燈` }
      const modifier = selectedModifier(state)
      if (modifier) { state.deleteModifier(modifier.id); return `已刪除 ${modifier.name}` }
      const object = selectedStudioObject(state)
      if (object) { state.deleteStudioObject(object.id); return `已刪除 ${object.name}` }
      return '沒有可刪除的物件'
    },
  },
  {
    id: 'edit-group', section: '選取與編輯', label: '群組選取的燈', keys: [MOD, 'G'],
    match: combo({ key: 'g', mod: true }),
    available: (state) => state.selectedIds.length > 1,
    run: (state) => {
      if (state.selectedIds.length < 2) return '請先選取兩盞以上的燈'
      state.groupSelectedLights()
      return `已群組 ${state.selectedIds.length} 盞燈`
    },
  },
  {
    id: 'edit-ungroup', section: '選取與編輯', label: '解散群組', keys: ['⇧', MOD, 'G'],
    match: combo({ key: 'g', mod: true, shift: true }),
    run: (state) => { state.ungroupSelectedLights(); return '已解散群組' },
  },
  {
    id: 'edit-undo', section: '選取與編輯', label: '復原', keys: [MOD, 'Z'], allowInInput: true,
    match: combo({ key: 'z', mod: true }),
    available: (state) => state.undoStack.length > 0,
    run: (state) => { if (!state.undoStack.length) return '沒有可復原的步驟'; state.undo(); return '復原' },
  },
  {
    id: 'edit-redo', section: '選取與編輯', label: '重做', keys: ['⇧', MOD, 'Z'], allowInInput: true,
    match: combo({ key: 'z', mod: true, shift: true }),
    available: (state) => state.redoStack.length > 0,
    run: (state) => { if (!state.redoStack.length) return '沒有可重做的步驟'; state.redo(); return '重做' },
  },
  {
    id: 'project-save', section: '選取與編輯', label: '儲存場景', keys: [MOD, 'S'], allowInInput: true,
    match: combo({ key: 's', mod: true }),
    run: (state) => { state.saveProject(); return '場景已儲存' },
  },
  {
    id: 'project-export', section: '選取與編輯', label: '匯出專案檔', keys: [MOD, 'E'], allowInInput: true,
    match: combo({ key: 'e', mod: true }),
    run: (state) => { state.exportProject(); return '已匯出專案' },
  },

  // ── 相機參數 ────────────────────────────────────────────────
  {
    id: 'aperture-open', section: '相機參數', label: '光圈開大一級', keys: ['['],
    match: combo({ key: '[' }),
    run: (state) => {
      const min = LENS_PROFILES[state.lensProfileId].maxAperture
      const next = stepStop(APERTURE_STOPS, state.aperture, -1, min, 16)
      state.setValue('aperture', next)
      return `光圈 ƒ/${next}`
    },
  },
  {
    id: 'aperture-close', section: '相機參數', label: '光圈縮小一級', keys: [']'],
    match: combo({ key: ']' }),
    run: (state) => {
      const min = LENS_PROFILES[state.lensProfileId].maxAperture
      const next = stepStop(APERTURE_STOPS, state.aperture, 1, min, 16)
      state.setValue('aperture', next)
      return `光圈 ƒ/${next}`
    },
  },
  {
    id: 'iso-down', section: '相機參數', label: 'ISO 降一級', keys: ['-'],
    match: combo({ key: '-' }),
    run: (state) => { const next = stepStop(ISO_STOPS, state.iso, -1, 100, 12800); state.setValue('iso', next); return `ISO ${next}` },
  },
  {
    id: 'iso-up', section: '相機參數', label: 'ISO 升一級', keys: ['='],
    match: combo({ key: '=' }),
    run: (state) => { const next = stepStop(ISO_STOPS, state.iso, 1, 100, 12800); state.setValue('iso', next); return `ISO ${next}` },
  },
  {
    id: 'shutter-slow', section: '相機參數', label: '快門變慢一級', keys: [','],
    match: combo({ key: ',' }),
    run: (state) => { const next = stepStop(SHUTTER_STOPS, state.shutter, -1); state.setValue('shutter', next); return `快門 1/${next}s` },
  },
  {
    id: 'shutter-fast', section: '相機參數', label: '快門變快一級', keys: ['.'],
    match: combo({ key: '.' }),
    run: (state) => { const next = stepStop(SHUTTER_STOPS, state.shutter, 1); state.setValue('shutter', next); return `快門 1/${next}s` },
  },
  {
    id: 'composition-guide', section: '相機參數', label: '切換構圖參考線', keys: ['C'],
    match: combo({ key: 'c' }),
    run: (state) => {
      const next = cycle(COMPOSITION_GUIDES, state.compositionGuide)
      state.setValue('compositionGuide', next)
      return `構圖參考線 · ${COMPOSITION_LABELS[next]}`
    },
  },
  {
    id: 'exposure-overlay', section: '相機參數', label: '切換曝光疊圖', keys: ['E'],
    match: combo({ key: 'e' }),
    run: (state) => {
      const next = cycle(EXPOSURE_OVERLAYS, state.exposureOverlay)
      state.setValue('exposureOverlay', next)
      return `曝光疊圖 · ${EXPOSURE_LABELS[next]}`
    },
  },
  {
    id: 'focus-guide', section: '相機參數', label: '對焦輔助框', keys: ['F'],
    match: combo({ key: 'f' }),
    run: (state) => { const on = !state.focusGuide; state.setValue('focusGuide', on); return `對焦輔助 ${on ? '開啟' : '關閉'}` },
  },
  {
    id: 'shot-capture', section: '相機參數', label: '擷取目前鏡位', keys: ['S'],
    match: combo({ key: 's' }),
    run: () => { void captureCurrentShot(); return '已擷取鏡位' },
  },

  // ── 移動物件 ────────────────────────────────────────────────
  {
    id: 'nudge', section: '移動物件', label: '微調選取物件位置', keys: ['←', '→', '↑', '↓'], hint: '每次 0.1 M',
    match: (event) => !!NUDGE_AXIS[event.key] && !event.metaKey && !event.ctrlKey,
    run: nudgeSelection,
  },
  {
    id: 'nudge-large', section: '移動物件', label: '大幅移動選取物件', keys: ['⇧', '方向鍵'], hint: '每次 0.5 M',
    match: () => false,
    run: () => undefined,
  },
  {
    id: 'nudge-height', section: '移動物件', label: '調整選取物件高度', keys: [ALT, '↑', '↓'], hint: '燈架高度',
    match: () => false,
    run: () => undefined,
  },
]

function isEditingText(target: EventTarget | null) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable)
}

/** 找出符合此次按鍵的快捷鍵並執行，回傳要顯示的提示文字 */
export function runShortcut(event: KeyboardEvent): { shortcut: Shortcut; message?: string } | null {
  const editing = isEditingText(event.target)
  const shortcut = SHORTCUTS.find((item) => (item.allowInInput || !editing) && item.match(event))
  if (!shortcut) return null
  event.preventDefault()
  const message = shortcut.run(useStudio.getState(), event)
  return { shortcut, message: message ?? undefined }
}

export const SHORTCUT_SECTIONS: ShortcutSection[] = ['檢視與渲染', '面板', '選取與編輯', '相機參數', '移動物件']
