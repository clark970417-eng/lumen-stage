import { LENS_PROFILES } from './cameraProfiles'
import { t, localeNative, useLocaleStore, type MessageKey } from './i18n'
import { captureCurrentShot } from './shotCapture'
import { useStudio, type CompositionGuide, type ExposureOverlay, type StudioState } from './store'

export const IS_APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
const MOD = IS_APPLE ? '⌘' : 'Ctrl'
const ALT = IS_APPLE ? '⌥' : 'Alt'

export type ShortcutSection = 'view' | 'panels' | 'edit' | 'camera' | 'move'

export type Shortcut = {
  id: string
  section: ShortcutSection
  /** 顯示用的字串一律存 i18n key，換語言時說明面板會跟著更新 */
  label: MessageKey
  keys: string[]
  hint?: MessageKey
  allowInInput?: boolean
  match: (event: KeyboardEvent) => boolean
  available?: (state: StudioState) => boolean
  /** 回傳的字串會以浮動提示顯示，讓使用者知道按鍵做了什麼（已翻譯） */
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
const COMPOSITION_LABELS: Record<CompositionGuide, MessageKey> = { none: 'guide.none', thirds: 'guide.thirds', golden: 'guide.golden', safe: 'guide.safe' }
const EXPOSURE_OVERLAYS: ExposureOverlay[] = ['none', 'false-color', 'clipping']
const EXPOSURE_LABELS: Record<ExposureOverlay, MessageKey> = { none: 'guide.none', 'false-color': 'exposure.falseColor', clipping: 'overlay.clipping' }

const onOff = (on: boolean) => t(on ? 'common.on' : 'common.off')

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
    ?? (state.selected === 'camera' ? t('sel.camera') : state.selected === 'meter' ? t('sel.meter') : t('sel.model'))
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
    if (light.locked) return t('msg.locked', { name: light.name })
    const next = add(light.position, delta)
    state.setLightPosition(light.id, next)
    const moved = state.selectedIds.length > 1 ? t('msg.lightCount', { count: state.selectedIds.length }) : light.name
    return `${moved} · ${positionLabel(next)}`
  }
  const modifier = selectedModifier(state)
  if (modifier) {
    if (modifier.locked) return t('msg.locked', { name: modifier.name })
    const next = add(modifier.position, delta)
    state.setModifierTransform(modifier.id, next)
    return `${modifier.name} · ${positionLabel(next)}`
  }
  const object = selectedStudioObject(state)
  if (object) {
    if (object.locked) return t('msg.locked', { name: object.name })
    const next = add(object.position, delta)
    state.setStudioObjectTransform(object.id, next)
    return `${object.name} · ${positionLabel(next)}`
  }
  if (state.selected === 'camera') {
    const next = add(state.cameraPosition, delta)
    state.setCameraPosition(next)
    return `${t('sel.camera')} · ${positionLabel(next)}`
  }
  if (state.selected === 'meter') {
    const next = add(state.meterPosition, delta)
    state.setMeterPosition(next)
    return `${t('sel.meter')} · ${positionLabel(next)}`
  }
  const next = add(state.modelPosition, delta)
  state.setModelTransform(next)
  return `${t('sel.model')} · ${positionLabel(next)}`
}

export const SHORTCUTS: Shortcut[] = [
  // ── 檢視與渲染 ──────────────────────────────────────────────
  {
    id: 'view-studio', section: 'view', label: 'view.studio', keys: ['1'],
    match: combo({ key: '1' }),
    run: (state) => { state.openStudioView(); return t('view.studio') },
  },
  {
    id: 'view-top', section: 'view', label: 'view.top', keys: ['2'],
    match: combo({ key: '2' }),
    run: (state) => { state.openTopView(); return t('view.top') },
  },
  {
    id: 'view-camera', section: 'view', label: 'view.camera', keys: ['3'],
    match: combo({ key: '3' }),
    run: (state) => { state.openCameraView(); return t('view.camera') },
  },
  {
    id: 'view-render', section: 'view', label: 'view.render', keys: ['4'],
    match: combo({ key: '4' }),
    run: (state) => { state.startPhotoRender(); return t('msg.render.start') },
  },
  {
    id: 'render-pause', section: 'view', label: 'sc.render-pause', keys: ['Space'],
    match: combo({ key: ' ' }),
    available: (state) => state.renderMode === 'path',
    run: (state) => {
      if (state.renderMode !== 'path') return
      const paused = !state.pathTracingPaused
      state.setValue('pathTracingPaused', paused)
      return t(paused ? 'msg.sampling.paused' : 'msg.sampling.resumed')
    },
  },
  {
    id: 'render-restart', section: 'view', label: 'render.restart', keys: ['⇧', 'R'],
    match: combo({ key: 'r', shift: true }),
    available: (state) => state.renderMode === 'path',
    run: (state) => {
      if (state.renderMode !== 'path') return
      state.restartPhotoRender()
      return t('render.restart')
    },
  },

  // ── 面板 ───────────────────────────────────────────────────
  {
    id: 'panel-help', section: 'panels', label: 'sc.panel-help', keys: ['?'], allowInInput: false,
    match: (event) => !event.metaKey && !event.ctrlKey && !event.altKey && (event.key === '?' || (event.key === '/' && event.shiftKey)),
    run: (state) => { state.setValue('shortcutHelpOpen', !state.shortcutHelpOpen) },
  },
  {
    id: 'panel-analysis', section: 'panels', label: 'sc.panel-analysis', keys: ['M'],
    match: combo({ key: 'm' }),
    run: (state) => { const open = !state.analysisOpen; state.setValue('analysisOpen', open); return t('msg.panel.analysis', { state: onOff(open) }) },
  },
  {
    id: 'panel-pro', section: 'panels', label: 'sc.panel-pro', keys: ['P'],
    match: combo({ key: 'p' }),
    run: (state) => { const open = !state.professionalPanelOpen; state.setValue('professionalPanelOpen', open); return t('msg.panel.pro', { state: onOff(open) }) },
  },
  {
    id: 'panel-shots', section: 'panels', label: 'shots.launcher', keys: ['B'],
    match: combo({ key: 'b' }),
    run: (state) => { const open = !state.shotPanelOpen; state.setValue('shotPanelOpen', open); return t('msg.panel.shots', { state: onOff(open) }) },
  },
  {
    id: 'panel-setups', section: 'panels', label: 'setups.launcher', keys: ['L'],
    match: combo({ key: 'l' }),
    run: (state) => { const open = !state.setupLibraryOpen; state.setValue('setupLibraryOpen', open); return t('msg.panel.setups', { state: onOff(open) }) },
  },
  {
    id: 'locale-cycle', section: 'panels', label: 'sc.locale', keys: ['⇧', 'L'],
    match: combo({ key: 'l', shift: true }),
    allowInInput: false,
    run: () => t('msg.locale', { name: localeNative(useLocaleStore.getState().cycleLocale()) }),
  },
  {
    id: 'panel-escape', section: 'panels', label: 'sc.panel-escape', keys: ['Esc'], allowInInput: true,
    match: combo({ key: 'Escape' }),
    run: (state, event) => {
      if (state.shortcutHelpOpen) { state.setValue('shortcutHelpOpen', false); return }
      if (isEditingText(event.target)) { (event.target as HTMLElement).blur(); return }
      if (state.measureMode) { state.clearMeasure(); return t('msg.measure', { state: onOff(false) }) }
      if (state.lightAimMode) { state.setValue('lightAimMode', false); return t('msg.aim.exit') }
      if (state.setupLibraryOpen) { state.setValue('setupLibraryOpen', false); return t('msg.setups.closed') }
      if (state.shotPanelOpen) { state.setValue('shotPanelOpen', false); return t('msg.shots.closed') }
      if (state.professionalPanelOpen) { state.setValue('professionalPanelOpen', false); return t('msg.pro.closed') }
      if (state.analysisOpen) { state.setValue('analysisOpen', false); return t('msg.analysis.closed') }
    },
  },

  // ── 選取與編輯 ──────────────────────────────────────────────
  {
    id: 'pose-handles', section: 'edit', label: 'sc.pose', keys: ['H'],
    match: combo({ key: 'h' }),
    run: (state) => { const on = !state.poseHandles; state.setValue('poseHandles', on); return t('msg.pose', { state: onOff(on) }) },
  },
  {
    id: 'placement-snap', section: 'edit', label: 'sc.snap', keys: ['⇧', 'S'],
    match: combo({ key: 's', shift: true }),
    run: (state) => { const on = !state.placementSnap; state.setValue('placementSnap', on); return t('msg.snap', { state: onOff(on) }) },
  },
  {
    id: 'measure', section: 'edit', label: 'sc.measure', keys: ['N'],
    match: combo({ key: 'n' }),
    run: (state) => {
      if (state.measureMode) { state.clearMeasure(); return t('msg.measure', { state: onOff(false) }) }
      state.setValue('lightAimMode', false)
      state.setValue('measureMode', true)
      return t('msg.measure', { state: onOff(true) })
    },
  },
  {
    id: 'transform-move', section: 'edit', label: 'sc.transform-move', keys: ['G'],
    match: combo({ key: 'g' }),
    run: (state) => { state.setValue('lightAimMode', false); state.setValue('transformMode', 'translate'); return t('sc.transform-move') },
  },
  {
    id: 'transform-rotate', section: 'edit', label: 'sc.transform-rotate', keys: ['R'],
    match: combo({ key: 'r' }),
    available: (state) => state.selected === 'model' || !!selectedLight(state) || !!selectedModifier(state) || !!selectedStudioObject(state),
    run: (state) => {
      if (state.selected !== 'model' && !selectedLight(state) && !selectedModifier(state) && !selectedStudioObject(state)) return t('msg.rotate.unsupported')
      state.setValue('lightAimMode', false)
      state.setValue('transformMode', 'rotate')
      return t('sc.transform-rotate')
    },
  },
  {
    id: 'transform-aim', section: 'edit', label: 'sc.transform-aim', keys: ['T'],
    match: combo({ key: 't' }),
    available: (state) => !!selectedLight(state),
    run: (state) => {
      if (!selectedLight(state)) return t('msg.selectLight')
      const aim = !state.lightAimMode
      state.setValue('lightAimMode', aim)
      return t(aim ? 'msg.aim.enter' : 'msg.aim.exit')
    },
  },
  {
    id: 'light-add', section: 'edit', label: 'sc.light-add', keys: ['⇧', 'A'],
    match: combo({ key: 'a', shift: true }),
    run: (state) => { state.addLight('square'); return t('msg.light.added') },
  },
  {
    id: 'light-toggle', section: 'edit', label: 'sc.light-toggle', keys: ['H'],
    match: combo({ key: 'h' }),
    available: (state) => !!selectedLight(state),
    run: (state) => {
      const light = selectedLight(state)
      if (!light) return t('msg.selectLight')
      state.updateLight(light.id, { enabled: !light.enabled })
      return t('msg.light.toggled', { name: light.name, state: onOff(!light.enabled) })
    },
  },
  {
    id: 'light-solo', section: 'edit', label: 'sc.light-solo', keys: ['L'],
    match: combo({ key: 'l' }),
    available: (state) => !!selectedLight(state),
    run: (state) => {
      const light = selectedLight(state)
      if (!light) return t('msg.selectLight')
      const solo = state.soloLightId === light.id ? null : light.id
      state.setValue('soloLightId', solo)
      return solo ? `SOLO · ${light.name}` : t('msg.solo.cleared')
    },
  },
  {
    id: 'edit-duplicate', section: 'edit', label: 'sc.edit-duplicate', keys: [MOD, 'D'],
    match: combo({ key: 'd', mod: true }),
    run: (state) => {
      if (state.selectedIds.length) { state.duplicateSelectedLights(); return t('msg.duplicated.lights', { count: state.selectedIds.length }) }
      const modifier = selectedModifier(state)
      if (modifier) { state.duplicateModifier(modifier.id); return t('msg.duplicated.item', { name: modifier.name }) }
      const object = selectedStudioObject(state)
      if (object) { state.duplicateStudioObject(object.id); return t('msg.duplicated.item', { name: object.name }) }
      return t('msg.duplicate.none')
    },
  },
  {
    id: 'edit-delete', section: 'edit', label: 'sc.edit-delete', keys: ['Delete'],
    match: (event) => (event.key === 'Backspace' || event.key === 'Delete') && !event.metaKey && !event.ctrlKey,
    run: (state) => {
      if (state.selectedIds.length) { const count = state.selectedIds.length; state.deleteSelectedLights(); return t('msg.deleted.lights', { count }) }
      const modifier = selectedModifier(state)
      if (modifier) { state.deleteModifier(modifier.id); return t('msg.deleted.item', { name: modifier.name }) }
      const object = selectedStudioObject(state)
      if (object) { state.deleteStudioObject(object.id); return t('msg.deleted.item', { name: object.name }) }
      return t('msg.delete.none')
    },
  },
  {
    id: 'edit-group', section: 'edit', label: 'sc.edit-group', keys: [MOD, 'G'],
    match: combo({ key: 'g', mod: true }),
    available: (state) => state.selectedIds.length > 1,
    run: (state) => {
      if (state.selectedIds.length < 2) return t('msg.group.needTwo')
      state.groupSelectedLights()
      return t('msg.grouped', { count: state.selectedIds.length })
    },
  },
  {
    id: 'edit-ungroup', section: 'edit', label: 'sc.edit-ungroup', keys: ['⇧', MOD, 'G'],
    match: combo({ key: 'g', mod: true, shift: true }),
    run: (state) => { state.ungroupSelectedLights(); return t('msg.ungrouped') },
  },
  {
    id: 'edit-undo', section: 'edit', label: 'sc.edit-undo', keys: [MOD, 'Z'], allowInInput: true,
    match: combo({ key: 'z', mod: true }),
    available: (state) => state.undoStack.length > 0,
    run: (state) => { if (!state.undoStack.length) return t('msg.undo.none'); state.undo(); return t('sc.edit-undo') },
  },
  {
    id: 'edit-redo', section: 'edit', label: 'sc.edit-redo', keys: ['⇧', MOD, 'Z'], allowInInput: true,
    match: combo({ key: 'z', mod: true, shift: true }),
    available: (state) => state.redoStack.length > 0,
    run: (state) => { if (!state.redoStack.length) return t('msg.redo.none'); state.redo(); return t('sc.edit-redo') },
  },
  {
    id: 'project-save', section: 'edit', label: 'topbar.save', keys: [MOD, 'S'], allowInInput: true,
    match: combo({ key: 's', mod: true }),
    run: (state) => { state.saveProject(); return t('msg.saved') },
  },
  {
    id: 'project-export', section: 'edit', label: 'file.export', keys: [MOD, 'E'], allowInInput: true,
    match: combo({ key: 'e', mod: true }),
    run: (state) => { state.exportProject(); return t('msg.exported') },
  },

  // ── 相機參數 ────────────────────────────────────────────────
  {
    id: 'aperture-open', section: 'camera', label: 'sc.aperture-open', keys: ['['],
    match: combo({ key: '[' }),
    run: (state) => {
      const min = LENS_PROFILES[state.lensProfileId].maxAperture
      const next = stepStop(APERTURE_STOPS, state.aperture, -1, min, 16)
      state.setValue('aperture', next)
      return t('msg.aperture', { value: next })
    },
  },
  {
    id: 'aperture-close', section: 'camera', label: 'sc.aperture-close', keys: [']'],
    match: combo({ key: ']' }),
    run: (state) => {
      const min = LENS_PROFILES[state.lensProfileId].maxAperture
      const next = stepStop(APERTURE_STOPS, state.aperture, 1, min, 16)
      state.setValue('aperture', next)
      return t('msg.aperture', { value: next })
    },
  },
  {
    id: 'iso-down', section: 'camera', label: 'sc.iso-down', keys: ['-'],
    match: combo({ key: '-' }),
    run: (state) => { const next = stepStop(ISO_STOPS, state.iso, -1, 100, 12800); state.setValue('iso', next); return `ISO ${next}` },
  },
  {
    id: 'iso-up', section: 'camera', label: 'sc.iso-up', keys: ['='],
    match: combo({ key: '=' }),
    run: (state) => { const next = stepStop(ISO_STOPS, state.iso, 1, 100, 12800); state.setValue('iso', next); return `ISO ${next}` },
  },
  {
    id: 'shutter-slow', section: 'camera', label: 'sc.shutter-slow', keys: [','],
    match: combo({ key: ',' }),
    run: (state) => { const next = stepStop(SHUTTER_STOPS, state.shutter, -1); state.setValue('shutter', next); return t('msg.shutter', { value: next }) },
  },
  {
    id: 'shutter-fast', section: 'camera', label: 'sc.shutter-fast', keys: ['.'],
    match: combo({ key: '.' }),
    run: (state) => { const next = stepStop(SHUTTER_STOPS, state.shutter, 1); state.setValue('shutter', next); return t('msg.shutter', { value: next }) },
  },
  {
    id: 'composition-guide', section: 'camera', label: 'sc.composition-guide', keys: ['C'],
    match: combo({ key: 'c' }),
    run: (state) => {
      const next = cycle(COMPOSITION_GUIDES, state.compositionGuide)
      state.setValue('compositionGuide', next)
      return t('msg.guide', { name: t(COMPOSITION_LABELS[next]) })
    },
  },
  {
    id: 'exposure-overlay', section: 'camera', label: 'sc.exposure-overlay', keys: ['E'],
    match: combo({ key: 'e' }),
    run: (state) => {
      const next = cycle(EXPOSURE_OVERLAYS, state.exposureOverlay)
      state.setValue('exposureOverlay', next)
      return t('msg.overlay', { name: t(EXPOSURE_LABELS[next]) })
    },
  },
  {
    id: 'focus-guide', section: 'camera', label: 'sc.focus-guide', keys: ['F'],
    match: combo({ key: 'f' }),
    run: (state) => { const on = !state.focusGuide; state.setValue('focusGuide', on); return t('msg.focusGuide', { state: onOff(on) }) },
  },
  {
    id: 'shot-capture', section: 'camera', label: 'shots.capture', keys: ['S'],
    match: combo({ key: 's' }),
    run: () => { void captureCurrentShot(); return t('msg.shot.captured') },
  },

  // ── 移動物件 ────────────────────────────────────────────────
  {
    id: 'nudge', section: 'move', label: 'sc.nudge', keys: ['←', '→', '↑', '↓'], hint: 'sc.nudge.hint',
    match: (event) => !!NUDGE_AXIS[event.key] && !event.metaKey && !event.ctrlKey,
    run: nudgeSelection,
  },
  {
    id: 'nudge-large', section: 'move', label: 'sc.nudge-large', keys: ['⇧', '←→↑↓'], hint: 'sc.nudge-large.hint',
    match: () => false,
    run: () => undefined,
  },
  {
    id: 'nudge-height', section: 'move', label: 'sc.nudge-height', keys: [ALT, '↑', '↓'], hint: 'sc.nudge-height.hint',
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

export const SHORTCUT_SECTIONS: ShortcutSection[] = ['view', 'panels', 'edit', 'camera', 'move']

export const SECTION_LABELS: Record<ShortcutSection, MessageKey> = {
  view: 'shortcuts.section.view',
  panels: 'shortcuts.section.panels',
  edit: 'shortcuts.section.edit',
  camera: 'shortcuts.section.camera',
  move: 'shortcuts.section.move',
}

export { selectionName }
