import { useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { useStudio, type StudioLight, type StudioModifier, type StudioShot } from '../store'
import { useT } from '../i18n'
import { getHead, getModifier } from '../gear'
import { calculateMetering, resolveLight, type LightMeterReading } from '../metering'
import { calculateDepthOfField } from '../optics'
import { effectiveFreezeSpeed, gelForShift } from '../photometry'
import { getGel } from '../gels'
import { CAMERA_BODIES, LENS_PROFILES } from '../cameraProfiles'
import { COLOR_PROFILES } from '../colorScience'

/**
 * The printable setup sheet.
 *
 * This is the artefact a photographer actually carries onto the floor: a
 * dimensioned plan, an elevation, and every number needed to rebuild the shot
 * from nothing. Beyond a conventional setup sheet it also carries the metered
 * result of each head — lux at the subject, stops under key, apparent source
 * size and the penumbra it will cast — so the sheet says not just where the
 * lights were but what they did.
 */

const SHEET_WIDTH = 1680
const SHEET_HEIGHT = 1160

/**
 * Two palettes for one set of markup: ink on paper to print, and a dark sheet
 * to read on a monitor beside the viewport. Colours are passed as values rather
 * than CSS variables — var() does not resolve inside SVG presentation
 * attributes, so a variable-based sheet rasterises blank.
 */
export type SheetTheme = 'paper' | 'dark'

const SHEET_THEMES = {
  paper: { paper: '#ffffff', ink: '#14171a', mid: '#6d757c', hair: '#d5dade', accent: '#c8542a', grid: '#eceff1', panel: '#fbfcfc', zebra: '#f7f9f9', block: '#14171a' },
  dark: { paper: '#10130f', ink: '#eef1e9', mid: '#8f978b', hair: '#39402f', accent: '#d8ff3e', grid: '#1c211b', panel: '#171b17', zebra: '#191e19', block: '#1b211a' },
} as const

type Palette = typeof SHEET_THEMES[SheetTheme]

const SENSOR_COC = { 'full-frame': 0.03, 'aps-c': 0.019, mft: 0.015 } as const
const SENSOR_WIDTH = { 'full-frame': 36, 'aps-c': 23.5, mft: 17.3 } as const

type Plan = {
  /** Metres -> sheet units. */
  scale: number
  toX: (worldX: number) => number
  toY: (worldZ: number) => number
}

function formatMetres(value: number) {
  return `${value.toFixed(2)} m`
}

/** `shutter` is stored as the denominator: 125 means 1/125 s. */
function formatShutter(shutter: number) {
  return shutter < 1 ? `${(1 / shutter).toFixed(1)}″` : `1/${Math.round(shutter)}`
}

/** Signed azimuth of a point about the subject, measured from the camera axis. */
function azimuthFromCameraAxis(point: [number, number, number], subject: [number, number, number], camera: [number, number, number]) {
  const toPoint = Math.atan2(point[0] - subject[0], point[2] - subject[2])
  const toCamera = Math.atan2(camera[0] - subject[0], camera[2] - subject[2])
  let delta = (toPoint - toCamera) * 180 / Math.PI
  while (delta > 180) delta -= 360
  while (delta < -180) delta += 360
  return delta
}

function elevationAngle(point: [number, number, number], subject: [number, number, number]) {
  const horizontal = Math.hypot(point[0] - subject[0], point[2] - subject[2])
  return Math.atan2(point[1] - subject[1], Math.max(0.01, horizontal)) * 180 / Math.PI
}

/** Where a light sits in the classic clock-face notation assistants understand. */
function clockPosition(azimuth: number) {
  const normalized = ((azimuth % 360) + 360) % 360
  const hour = Math.round(normalized / 30) % 12
  return `${hour === 0 ? 12 : hour} o'clock`
}

function Dimension({ x1, y1, x2, y2, label, palette }: { x1: number; y1: number; x2: number; y2: number; label: string; palette: Palette }) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
  const flip = angle > 90 || angle < -90
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={palette.mid} strokeWidth={1} strokeDasharray="5 4" />
      <g transform={`translate(${midX} ${midY}) rotate(${flip ? angle + 180 : angle})`}>
        <rect x={-30} y={-11} width={60} height={17} rx={3} fill={palette.paper} opacity={0.94} />
        <text x={0} y={1} textAnchor="middle" fontSize={13} fill={palette.mid} fontFamily="ui-monospace, monospace">{label}</text>
      </g>
    </g>
  )
}

function PlanLight({ light, plan, reading, index, isKey, palette }: { light: StudioLight; plan: Plan; reading?: LightMeterReading; index: number; isKey: boolean; palette: Palette }) {
  const x = plan.toX(light.position[0])
  const y = plan.toY(light.position[2])
  const aimX = plan.toX(light.target[0])
  const aimY = plan.toY(light.target[2])
  const angle = Math.atan2(aimY - y, aimX - x) * 180 / Math.PI
  const modifier = getModifier(light.modifierId)
  const faceWidth = Math.max(16, modifier.width * plan.scale)
  const colour = light.enabled ? (isKey ? palette.accent : palette.ink) : palette.mid

  return (
    <g opacity={light.enabled ? 1 : 0.4}>
      {/* Beam spread toward the aim point */}
      <g transform={`translate(${x} ${y}) rotate(${angle})`}>
        <path
          d={`M 0 0 L ${Math.hypot(aimX - x, aimY - y) * 1.15} ${-Math.tan(Math.min(1.4, light.beamAngle * Math.PI / 360)) * Math.hypot(aimX - x, aimY - y) * 1.15} A 1 1 0 0 1 ${Math.hypot(aimX - x, aimY - y) * 1.15} ${Math.tan(Math.min(1.4, light.beamAngle * Math.PI / 360)) * Math.hypot(aimX - x, aimY - y) * 1.15} Z`}
          fill={isKey ? palette.accent : palette.ink} opacity={0.06}
        />
        {/* Emitting face, drawn to true scale */}
        <rect x={-5} y={-faceWidth / 2} width={7} height={faceWidth} fill={colour} rx={1.5} />
        <rect x={-16} y={-9} width={12} height={18} fill={colour} opacity={0.55} rx={2} />
      </g>
      <circle cx={x} cy={y} r={13} fill={palette.paper} stroke={colour} strokeWidth={1.6} />
      <text x={x} y={y + 4.5} textAnchor="middle" fontSize={12} fontWeight={700} fill={colour} fontFamily="ui-monospace, monospace">{index + 1}</text>
      <text x={x} y={y - 20} textAnchor="middle" fontSize={12} fill={palette.mid} fontFamily="ui-monospace, monospace">
        {light.position[1].toFixed(2)} m{reading ? ` · ${reading.stopsUnderKey > 0.05 ? `−${reading.stopsUnderKey.toFixed(1)} EV` : 'KEY'}` : ''}
      </text>
    </g>
  )
}

function PlanGrip({ grip, plan, palette }: { grip: StudioModifier; plan: Plan; palette: Palette }) {
  const x = plan.toX(grip.position[0])
  const y = plan.toY(grip.position[2])
  const halfWidth = Math.max(10, grip.width * plan.scale / 2)
  const fill = grip.surface === 'black' ? palette.ink : grip.surface === 'silver' ? '#9aa3aa' : grip.surface === 'gold' ? '#b98a3d' : '#cfd5d9'
  return (
    <g transform={`translate(${x} ${y}) rotate(${-grip.rotationY * 180 / Math.PI})`}>
      <rect x={-halfWidth} y={-4} width={halfWidth * 2} height={8} fill={fill} stroke={palette.ink} strokeWidth={1} rx={2} />
      <text x={0} y={-11} textAnchor="middle" fontSize={11} fill={palette.mid} fontFamily="ui-monospace, monospace">
        {grip.type === 'flag' ? 'FLAG' : grip.type === 'vflat' ? 'V-FLAT' : 'BOUNCE'}
      </text>
    </g>
  )
}

/**
 * Which scene the sheet describes: the live studio, or a shot out of the
 * library. It sits beside the component rather than in the studio store so
 * printing an archived setup never disturbs the scene you are lighting.
 */
export const useSheetSource = create<{ shot: StudioShot | null; setShot: (shot: StudioShot | null) => void }>((set) => ({
  shot: null,
  setShot: (shot) => set({ shot }),
}))

/**
 * The top-bar button carries no shot, so a stale one would quietly describe the
 * wrong scene. This clears on close rather than on unmount: StrictMode runs an
 * effect's cleanup once on mount, which would wipe the shot as the sheet opens.
 */
useStudio.subscribe((state, previous) => {
  if (previous.setupSheetOpen && !state.setupSheetOpen) useSheetSource.getState().setShot(null)
})

/** Open the sheet against a saved shot instead of the live scene. */
export function openSetupSheetForShot(shot: StudioShot) {
  useSheetSource.getState().setShot(shot)
  useStudio.getState().setValue('setupSheetOpen', true)
}

/** The frame the plan produced, so the sheet shows the look as well as the geometry. */
function captureViewportFrame() {
  const source = document.querySelector<HTMLCanvasElement>('.viewport canvas:not(.exposure-overlay)')
  if (!source) return undefined
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 720 / Math.max(1, source.width))
  canvas.width = Math.round(source.width * scale)
  canvas.height = Math.round(source.height * scale)
  const context = canvas.getContext('2d')
  if (!context) return undefined
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  try { return canvas.toDataURL('image/jpeg', 0.82) } catch { return undefined }
}

export function SetupSheet() {
  const live = useStudio()
  const shot = useSheetSource((source) => source.shot)
  const [theme, setTheme] = useState<SheetTheme>('paper')
  const t = useT()
  const C = SHEET_THEMES[theme]
  const svgRef = useRef<SVGSVGElement>(null)

  /** A saved shot overlays the live scene, so fields older snapshots predate still resolve. */
  const state = useMemo(() => {
    if (!shot) return live
    try { return { ...live, ...JSON.parse(shot.sceneJson) as Partial<typeof live> } } catch { return live }
  }, [live, shot])

  const [reference] = useState(() => shot?.thumbnail || captureViewportFrame())


  const subject = state.modelPosition
  const camera = state.cameraPosition
  const body = CAMERA_BODIES[state.cameraBodyId]
  const lens = LENS_PROFILES[state.lensProfileId]
  const effectiveAperture = state.cameraMode === 'cinema' ? state.tStop : state.aperture
  const subjectMeterPoint = useMemo<[number, number, number]>(() => [state.modelPosition[0], state.modelPosition[1] + state.modelHeight * 0.72, state.modelPosition[2]], [state.modelHeight, state.modelPosition])

  const metering = useMemo(
    () => calculateMetering(state.lights, state.modifiers, subjectMeterPoint, effectiveAperture, state.shutter, state.iso, state.syncSpeed, state.ambientLevel),
    [state.lights, state.modifiers, subjectMeterPoint, effectiveAperture, state.shutter, state.iso, state.syncSpeed, state.ambientLevel],
  )

  const depth = calculateDepthOfField(state.focalLength, effectiveAperture, state.focusDistance, SENSOR_COC[state.sensorFormat])
  const horizontalFov = 2 * Math.atan(SENSOR_WIDTH[state.sensorFormat] / (2 * state.focalLength)) * 180 / Math.PI

  // --- Plan projection ------------------------------------------------------
  const planBox = { x: 36, y: 128, width: 844, height: 620 }
  const plan = useMemo<Plan>(() => {
    const xs = [subject[0], camera[0], ...state.lights.map((l) => l.position[0]), ...state.modifiers.map((m) => m.position[0]), -state.roomWidth / 2, state.roomWidth / 2]
    const zs = [subject[2], camera[2], ...state.lights.map((l) => l.position[2]), ...state.modifiers.map((m) => m.position[2]), -state.roomDepth / 2, state.roomDepth / 2]
    const minX = Math.min(...xs) - 0.6
    const maxX = Math.max(...xs) + 0.6
    const minZ = Math.min(...zs) - 0.6
    const maxZ = Math.max(...zs) + 0.6
    const scale = Math.min(planBox.width / Math.max(0.5, maxX - minX), planBox.height / Math.max(0.5, maxZ - minZ))
    const offsetX = planBox.x + (planBox.width - (maxX - minX) * scale) / 2
    const offsetY = planBox.y + (planBox.height - (maxZ - minZ) * scale) / 2
    return {
      scale,
      toX: (worldX: number) => offsetX + (worldX - minX) * scale,
      toY: (worldZ: number) => offsetY + (worldZ - minZ) * scale,
    }
  }, [camera, planBox.height, planBox.width, planBox.x, planBox.y, state.lights, state.modifiers, state.roomDepth, state.roomWidth, subject])

  // --- Elevation projection -------------------------------------------------
  const elevBox = { x: 36, y: 790, width: reference ? 556 : 844, height: 300 }
  const elevation = useMemo(() => {
    const maxHeight = Math.max(state.roomHeight, ...state.lights.map((l) => l.position[1] + 0.4), 2.6)
    const distances = state.lights.map((l) => Math.hypot(l.position[0] - subject[0], l.position[2] - subject[2]))
    const maxDistance = Math.max(2.5, ...distances, Math.hypot(camera[0] - subject[0], camera[2] - subject[2]))
    const scale = Math.min((elevBox.width - 90) / (maxDistance * 2), (elevBox.height - 60) / maxHeight)
    const groundY = elevBox.y + elevBox.height - 34
    const centreX = elevBox.x + elevBox.width / 2
    return {
      scale,
      groundY,
      centreX,
      maxHeight,
      toY: (height: number) => groundY - height * scale,
      /** Signed horizontal offset: lights camera-left plot left. */
      toX: (light: { position: [number, number, number] }) => {
        const azimuth = azimuthFromCameraAxis(light.position, subject, camera)
        const distance = Math.hypot(light.position[0] - subject[0], light.position[2] - subject[2])
        return centreX + Math.sin(azimuth * Math.PI / 180) * distance * scale
      },
    }
  }, [camera, elevBox.height, elevBox.width, elevBox.x, elevBox.y, state.lights, state.roomHeight, subject])

  const rows = state.lights.map((light, index) => {
    const reading = metering.readings.find((item) => item.lightId === light.id)
    const head = getHead(light.profileId)
    const modifier = getModifier(light.modifierId)
    const resolved = resolveLight(light)
    const distance = Math.hypot(light.position[0] - subject[0], light.position[1] - subject[1], light.position[2] - subject[2])
    return {
      light, index, reading, head, modifier, resolved, distance,
      azimuth: azimuthFromCameraAxis(light.position, subject, camera),
      elevationDeg: elevationAngle(light.position, subject),
      // What is actually on the head, and — if nothing is — what the white
       // balance says should be. Both belong on a sheet you shoot from.
      fittedGel: getGel(light.gelId),
      gel: gelForShift(light.temperature, state.whiteBalance),
    }
  })

  const keyRow = rows.reduce<typeof rows[number] | null>((best, row) => {
    if (!row.reading || !row.light.enabled) return best
    return !best || !best.reading || row.reading.totalLux > best.reading.totalLux ? row : best
  }, null)

  const exportPng = () => {
    const svg = svgRef.current
    if (!svg) return
    const serialized = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = SHEET_WIDTH * 2
      canvas.height = SHEET_HEIGHT * 2
      const context = canvas.getContext('2d')
      if (context) {
        context.fillStyle = SHEET_THEMES[theme].paper
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const link = document.createElement('a')
        link.download = `${state.projectName.replace(/[^\w\u3040-\u30ff\u4e00-\u9fff-]+/g, '-')}-setup-sheet.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
      }
      URL.revokeObjectURL(url)
    }
    image.onerror = () => URL.revokeObjectURL(url)
    image.src = url
  }

  /** A hidden iframe rather than a popup — blockers eat window.open, and the
   *  browser's own print dialog is the PDF export. */
  const printSheet = () => {
    const svg = svgRef.current
    if (!svg) return
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(frame)
    const doc = frame.contentDocument
    if (!doc) { frame.remove(); return }
    doc.open()
    doc.close()
    const title = doc.createElement('title')
    title.textContent = `${state.projectName} · Setup Sheet`
    const style = doc.createElement('style')
    style.textContent = '@page{size:A3 landscape;margin:8mm}body{margin:0}svg{width:100%;height:auto}'
    doc.head.append(title, style)
    doc.body.appendChild(doc.importNode(svg, true))
    const run = () => {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
      setTimeout(() => frame.remove(), 1000)
    }
    if (doc.readyState === 'complete') run()
    else frame.onload = run
  }

  const sectionTitle = (x: number, y: number, title: string, sub: string) => (
    <g>
      <text x={x} y={y} fontSize={15} fontWeight={700} fill={C.ink} letterSpacing={0.6} fontFamily="Inter, system-ui, sans-serif">{title}</text>
      <text x={x} y={y + 15} fontSize={11} fill={C.mid} letterSpacing={1.4} fontFamily="ui-monospace, monospace">{sub}</text>
    </g>
  )

  const stat = (x: number, y: number, label: string, value: string, accent = false) => (
    <g>
      <text x={x} y={y} fontSize={10} fill={C.mid} letterSpacing={1.2} fontFamily="ui-monospace, monospace">{label}</text>
      <text
        x={x} y={y + 22} fontSize={accent ? 24 : value.length > 22 ? 14 : value.length > 16 ? 16 : 20}
        fontWeight={700} fill={accent ? C.accent : C.ink} fontFamily="Inter, system-ui, sans-serif"
        textLength={value.length > 26 ? 232 : undefined} lengthAdjust="spacingAndGlyphs"
      >{value}</text>
    </g>
  )

  return (
    <div className="setup-sheet-overlay" role="dialog" aria-label={t('topbar.setupSheet')}>
      <div className="setup-sheet-bar">
        <div><strong>SETUP SHEET</strong><small>{shot ? `${state.projectName} · ${shot.name}` : state.projectName}</small></div>
        <div className="setup-sheet-actions">
          <button onClick={() => setTheme(theme === 'paper' ? 'dark' : 'paper')}>{t(theme === 'paper' ? 'sheet.dark' : 'sheet.paper')}</button>
          <button onClick={exportPng}>{t('render.exportPng')}</button>
          <button onClick={printSheet}>{t('sheet.print')}</button>
          <button className="setup-sheet-close" onClick={() => state.setValue('setupSheetOpen', false)}>×</button>
        </div>
      </div>

      <div className="setup-sheet-scroll">
        <svg ref={svgRef} className="setup-sheet-svg" viewBox={`0 0 ${SHEET_WIDTH} ${SHEET_HEIGHT}`} xmlns="http://www.w3.org/2000/svg">
          <rect width={SHEET_WIDTH} height={SHEET_HEIGHT} fill={C.paper} />

          {/* ---------- Header ---------- */}
          <g>
            <text x={36} y={52} fontSize={30} fontWeight={800} fill={C.ink} letterSpacing={-0.5} fontFamily="Inter, system-ui, sans-serif">{state.projectName}</text>
            <text x={36} y={76} fontSize={12} fill={C.mid} letterSpacing={1.8} fontFamily="ui-monospace, monospace">
              LUMEN STAGE · LIGHTING SETUP SHEET · {state.lights.filter((l) => l.enabled).length} HEADS · {state.modifiers.length} GRIP · {state.cameraMode.toUpperCase()}
            </text>
            <text x={SHEET_WIDTH - 36} y={52} textAnchor="end" fontSize={13} fill={C.ink} fontFamily="ui-monospace, monospace">
              {body.brand} {body.model} · {lens.model}
            </text>
            <text x={SHEET_WIDTH - 36} y={74} textAnchor="end" fontSize={12} fill={C.mid} fontFamily="ui-monospace, monospace">
              {state.focalLength} mm · f/{effectiveAperture} · {formatShutter(state.shutter)} · ISO {state.iso} · {state.whiteBalance} K
            </text>
            <line x1={36} y1={96} x2={SHEET_WIDTH - 36} y2={96} stroke={C.ink} strokeWidth={1.6} />
          </g>

          {/* ---------- Plan view ---------- */}
          <g>
            <rect x={planBox.x} y={planBox.y} width={planBox.width} height={planBox.height} fill={C.panel} stroke={C.hair} strokeWidth={1} rx={4} />
            {/* One-metre grid */}
            {Array.from({ length: 40 }, (_, i) => i - 20).map((metre) => {
              const gx = plan.toX(metre)
              const gy = plan.toY(metre)
              return (
                <g key={`grid-${metre}`}>
                  {gx > planBox.x && gx < planBox.x + planBox.width && <line x1={gx} y1={planBox.y} x2={gx} y2={planBox.y + planBox.height} stroke={C.grid} strokeWidth={1} />}
                  {gy > planBox.y && gy < planBox.y + planBox.height && <line x1={planBox.x} y1={gy} x2={planBox.x + planBox.width} y2={gy} stroke={C.grid} strokeWidth={1} />}
                </g>
              )
            })}
            {sectionTitle(planBox.x + 16, planBox.y + 28, 'PLAN', `1 m GRID · ${state.roomWidth} × ${state.roomDepth} m ROOM`)}

            {/* Backdrop line */}
            <line x1={plan.toX(-state.roomWidth / 2)} y1={plan.toY(-state.roomDepth / 2 + 0.35)} x2={plan.toX(state.roomWidth / 2)} y2={plan.toY(-state.roomDepth / 2 + 0.35)} stroke={C.ink} strokeWidth={5} opacity={0.18} />
            <text x={plan.toX(0)} y={plan.toY(-state.roomDepth / 2 + 0.35) - 12} textAnchor="middle" fontSize={11} fill={C.mid} letterSpacing={1.4} fontFamily="ui-monospace, monospace">BACKDROP</text>

            {/* Camera + field of view */}
            <g>
              {(() => {
                const cx = plan.toX(camera[0])
                const cy = plan.toY(camera[2])
                const tx = plan.toX(state.cameraTarget[0])
                const ty = plan.toY(state.cameraTarget[2])
                const heading = Math.atan2(ty - cy, tx - cx)
                const reach = Math.hypot(tx - cx, ty - cy) * 1.5
                const half = horizontalFov * Math.PI / 360
                return (
                  <>
                    <path
                      d={`M ${cx} ${cy} L ${cx + Math.cos(heading - half) * reach} ${cy + Math.sin(heading - half) * reach} L ${cx + Math.cos(heading + half) * reach} ${cy + Math.sin(heading + half) * reach} Z`}
                      fill={C.ink} opacity={0.05}
                    />
                    <line x1={cx} y1={cy} x2={tx} y2={ty} stroke={C.ink} strokeWidth={1} strokeDasharray="3 5" opacity={0.5} />
                    <g transform={`translate(${cx} ${cy}) rotate(${heading * 180 / Math.PI})`}>
                      <rect x={-13} y={-10} width={22} height={20} fill={C.ink} rx={3} />
                      <path d="M 9 -6 L 20 -11 L 20 11 L 9 6 Z" fill={C.ink} />
                    </g>
                    <text x={cx} y={cy + 30} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.ink} fontFamily="ui-monospace, monospace">CAM</text>
                    <text x={cx} y={cy + 45} textAnchor="middle" fontSize={11} fill={C.mid} fontFamily="ui-monospace, monospace">{camera[1].toFixed(2)} m · {horizontalFov.toFixed(0)}°</text>
                  </>
                )
              })()}
            </g>

            {/* Subject */}
            <g>
              <circle cx={plan.toX(subject[0])} cy={plan.toY(subject[2])} r={Math.max(13, 0.42 * plan.scale / 2)} fill={C.paper} stroke={C.ink} strokeWidth={2} />
              <circle cx={plan.toX(subject[0])} cy={plan.toY(subject[2])} r={4} fill={C.ink} />
              <line
                x1={plan.toX(subject[0])} y1={plan.toY(subject[2])}
                x2={plan.toX(subject[0]) + Math.sin(state.modelRotation) * 30} y2={plan.toY(subject[2]) + Math.cos(state.modelRotation) * 30}
                stroke={C.ink} strokeWidth={2}
              />
              <text x={plan.toX(subject[0])} y={plan.toY(subject[2]) - Math.max(20, 0.42 * plan.scale / 2 + 8)} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.ink} fontFamily="ui-monospace, monospace">
                SUBJECT {state.modelHeight.toFixed(2)} m
              </text>
            </g>

            {state.modifiers.map((grip) => <PlanGrip palette={C} key={grip.id} grip={grip} plan={plan} />)}
            {state.lights.map((light, index) => (
              <PlanLight palette={C} key={light.id} light={light} plan={plan} index={index} isKey={keyRow?.light.id === light.id}
                reading={metering.readings.find((item) => item.lightId === light.id)} />
            ))}

            {/* Dimensioned runs from subject to every enabled head */}
            {rows.filter((row) => row.light.enabled).map((row) => (
              <Dimension palette={C} key={`dim-${row.light.id}`}
                x1={plan.toX(subject[0])} y1={plan.toY(subject[2])}
                x2={plan.toX(row.light.position[0])} y2={plan.toY(row.light.position[2])}
                label={`${Math.hypot(row.light.position[0] - subject[0], row.light.position[2] - subject[2]).toFixed(2)} m`}
              />
            ))}
            <Dimension palette={C}
              x1={plan.toX(subject[0])} y1={plan.toY(subject[2])}
              x2={plan.toX(camera[0])} y2={plan.toY(camera[2])}
              label={`${Math.hypot(camera[0] - subject[0], camera[2] - subject[2]).toFixed(2)} m`}
            />

            {/* Scale bar */}
            <g transform={`translate(${planBox.x + 16} ${planBox.y + planBox.height - 22})`}>
              <line x1={0} y1={0} x2={plan.scale} y2={0} stroke={C.ink} strokeWidth={2} />
              <line x1={0} y1={-5} x2={0} y2={5} stroke={C.ink} strokeWidth={2} />
              <line x1={plan.scale} y1={-5} x2={plan.scale} y2={5} stroke={C.ink} strokeWidth={2} />
              <text x={plan.scale + 10} y={4} fontSize={12} fill={C.mid} fontFamily="ui-monospace, monospace">1 m</text>
            </g>
          </g>

          {/* ---------- Elevation ---------- */}
          <g>
            <rect x={elevBox.x} y={elevBox.y} width={elevBox.width} height={elevBox.height} fill={C.panel} stroke={C.hair} strokeWidth={1} rx={4} />
            {sectionTitle(elevBox.x + 16, elevBox.y + 26, 'ELEVATION', 'HEIGHTS FROM FLOOR · CAMERA AXIS VIEW')}
            <line x1={elevBox.x + 20} y1={elevation.groundY} x2={elevBox.x + elevBox.width - 20} y2={elevation.groundY} stroke={C.ink} strokeWidth={1.6} />
            {[1, 2, 3].filter((h) => h <= elevation.maxHeight).map((height) => (
              <g key={`h-${height}`}>
                <line x1={elevBox.x + 20} y1={elevation.toY(height)} x2={elevBox.x + elevBox.width - 20} y2={elevation.toY(height)} stroke={C.grid} strokeWidth={1} />
                <text x={elevBox.x + 24} y={elevation.toY(height) - 5} fontSize={10} fill={C.mid} fontFamily="ui-monospace, monospace">{height} m</text>
              </g>
            ))}
            {/* Subject silhouette */}
            <g>
              <line x1={elevation.centreX} y1={elevation.groundY} x2={elevation.centreX} y2={elevation.toY(state.modelHeight)} stroke={C.ink} strokeWidth={3} opacity={0.25} />
              <circle cx={elevation.centreX} cy={elevation.toY(state.modelHeight - 0.11)} r={Math.max(5, 0.22 * elevation.scale / 2)} fill={C.ink} opacity={0.25} />
              <text x={elevation.centreX} y={elevation.groundY + 18} textAnchor="middle" fontSize={11} fill={C.mid} fontFamily="ui-monospace, monospace">SUBJECT</text>
            </g>
            {rows.map((row) => {
              const x = elevation.toX(row.light)
              const y = elevation.toY(row.light.position[1])
              const isKey = keyRow?.light.id === row.light.id
              return (
                <g key={`elev-${row.light.id}`} opacity={row.light.enabled ? 1 : 0.35}>
                  <line x1={x} y1={elevation.groundY} x2={x} y2={y} stroke={C.mid} strokeWidth={1} strokeDasharray="3 4" />
                  <line x1={x} y1={y} x2={elevation.centreX} y2={elevation.toY(state.modelHeight - 0.28)} stroke={isKey ? C.accent : C.ink} strokeWidth={1} opacity={0.32} />
                  <rect x={x - 4} y={y - Math.max(7, row.modifier.height * elevation.scale / 2)} width={8} height={Math.max(14, row.modifier.height * elevation.scale)} rx={2} fill={isKey ? C.accent : C.ink} />
                  <circle cx={x} cy={y} r={11} fill={C.paper} stroke={isKey ? C.accent : C.ink} strokeWidth={1.5} />
                  <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={isKey ? C.accent : C.ink} fontFamily="ui-monospace, monospace">{row.index + 1}</text>
                  <text x={x} y={y - 18} textAnchor="middle" fontSize={11} fill={C.mid} fontFamily="ui-monospace, monospace">{row.light.position[1].toFixed(2)} m · {row.elevationDeg.toFixed(0)}°</text>
                </g>
              )
            })}
            <g>
              <rect x={elevation.centreX + Math.hypot(camera[0] - subject[0], camera[2] - subject[2]) * elevation.scale - 11} y={elevation.toY(camera[1]) - 9} width={22} height={18} rx={3} fill={C.ink} opacity={0.75} />
              <text x={elevation.centreX + Math.hypot(camera[0] - subject[0], camera[2] - subject[2]) * elevation.scale} y={elevation.toY(camera[1]) - 16} textAnchor="middle" fontSize={11} fill={C.mid} fontFamily="ui-monospace, monospace">CAM {camera[1].toFixed(2)} m</text>
            </g>
          </g>

          {/* ---------- Reference frame ---------- */}
          {reference && (
            <g>
              <rect x={612} y={790} width={268} height={300} fill={C.panel} stroke={C.hair} strokeWidth={1} rx={4} />
              <text x={630} y={816} fontSize={11} fill={C.mid} letterSpacing={1.4} fontFamily="ui-monospace, monospace">REFERENCE FRAME</text>
              <image x={626} y={828} width={240} height={214} href={reference} preserveAspectRatio="xMidYMid meet" />
              <text x={630} y={1070} fontSize={11} fill={C.mid} fontFamily="ui-monospace, monospace">
                {shot ? shot.name : 'LIVE VIEWPORT'}
              </text>
            </g>
          )}

          {/* ---------- Exposure block ---------- */}
          <g>
            <rect x={900} y={128} width={744} height={196} fill={C.block} rx={4} />
            <text x={922} y={158} fontSize={11} fill="#8d979f" letterSpacing={1.6} fontFamily="ui-monospace, monospace">AUTO EXPOSURE AT SUBJECT</text>
            <g fill="#ffffff">
              <text x={922} y={200} fontSize={44} fontWeight={800} fontFamily="Inter, system-ui, sans-serif">{metering.recommendedApertureLabel}</text>
              <text x={922} y={224} fontSize={11} fill="#8d979f" letterSpacing={1.4} fontFamily="ui-monospace, monospace">CALCULATED APERTURE</text>

              <text x={1150} y={192} fontSize={26} fontWeight={700} fontFamily="Inter, system-ui, sans-serif">EV {metering.ev100.toFixed(1)}</text>
              <text x={1150} y={212} fontSize={11} fill="#8d979f" letterSpacing={1.4} fontFamily="ui-monospace, monospace">AT ISO 100</text>

              <text x={1310} y={192} fontSize={26} fontWeight={700} fontFamily="Inter, system-ui, sans-serif">
                {metering.keyFillRatio >= 99 ? '∞:1' : `${metering.keyFillRatio.toFixed(1)}:1`}
              </text>
              <text x={1310} y={212} fontSize={11} fill="#8d979f" letterSpacing={1.4} fontFamily="ui-monospace, monospace">KEY : FILL</text>

              <text x={1460} y={192} fontSize={26} fontWeight={700} fill={Math.abs(metering.exposureDelta) < 0.35 ? '#8ee06a' : '#ffb454'} fontFamily="Inter, system-ui, sans-serif">
                {metering.exposureDelta >= 0 ? '+' : ''}{metering.exposureDelta.toFixed(1)} EV
              </text>
              <text x={1460} y={212} fontSize={11} fill="#8d979f" letterSpacing={1.4} fontFamily="ui-monospace, monospace">VS CAMERA SET</text>

              <text x={922} y={264} fontSize={12} fill="#b9c1c7" fontFamily="ui-monospace, monospace">
                {metering.flashLuxSeconds > 0
                  ? `FLASH ${metering.flashLuxSeconds.toFixed(1)} lx·s  ·  AMBIENT ${Math.round(metering.ambientLux)} lx  ·  SYNC 1/${state.syncSpeed}s`
                  : `CONTINUOUS ${Math.round(metering.continuousLux)} lx  ·  AMBIENT ${Math.round(metering.ambientLux)} lx  ·  BOUNCE ${Math.round(metering.bouncedLux)} lx`}
              </text>
              <text x={922} y={288} fontSize={12} fill="#b9c1c7" fontFamily="ui-monospace, monospace">
                DOF {formatMetres(depth.near)} → {depth.far === null ? '∞' : formatMetres(depth.far)}  ·  HYPERFOCAL {formatMetres(depth.hyperfocal)}  ·  FOV {horizontalFov.toFixed(0)}°
              </text>
              <text x={922} y={310} fontSize={12} fill="#b9c1c7" fontFamily="ui-monospace, monospace">
                {COLOR_PROFILES[state.colorProfileId].code} · {state.imageFormat.toUpperCase()} · {body.megapixels} MP · DR {body.dynamicRange} EV · {state.frameAspect} {state.frameOrientation.toUpperCase()}
              </text>
            </g>
          </g>

          {/* ---------- Camera + set block ---------- */}
          <g>
            <rect x={900} y={340} width={744} height={128} fill={C.panel} stroke={C.hair} rx={4} />
            {stat(922, 372, 'BODY', `${body.brand} ${body.model}`)}
            {stat(1180, 372, 'LENS', lens.model)}
            {stat(1430, 372, 'FOCUS', formatMetres(state.focusDistance))}
            {stat(922, 428, 'SHUTTER', state.cameraMode === 'cinema' ? `${state.shutterAngle}° @ ${state.frameRate}p` : formatShutter(state.shutter))}
            {stat(1180, 428, 'ISO', `${state.iso}`)}
            {stat(1430, 428, 'WB', `${state.whiteBalance} K ${state.whiteBalanceTint >= 0 ? '+' : ''}${state.whiteBalanceTint}`)}
          </g>

          {/* ---------- Light table ---------- */}
          <g>
            {sectionTitle(900, 502, 'LIGHT SCHEDULE', 'HEAD · MODIFIER · POSITION · METERED RESULT')}
            <line x1={900} y1={516} x2={1644} y2={516} stroke={C.ink} strokeWidth={1.4} />
            {(() => {
              const columns: [string, number, 'start' | 'end'][] = [
                ['#', 906, 'start'], ['HEAD / MODIFIER', 932, 'start'], ['PWR', 1196, 'end'],
                ['DIST', 1256, 'end'], ['HGT', 1310, 'end'], ['AZ', 1360, 'end'], ['EL', 1404, 'end'],
                ['SOURCE', 1470, 'end'], ['PENUM', 1536, 'end'], ['LEVEL', 1638, 'end'],
              ]
              return columns.map(([label, x, anchor]) => (
                <text key={label} x={x} y={538} textAnchor={anchor} fontSize={10} fill={C.mid} letterSpacing={1.2} fontFamily="ui-monospace, monospace">{label}</text>
              ))
            })()}
            {rows.map((row, position) => {
              const y = 566 + position * 52
              if (y > 1096) return null
              const isKey = keyRow?.light.id === row.light.id
              const reading = row.reading
              return (
                <g key={`row-${row.light.id}`} opacity={row.light.enabled ? 1 : 0.42}>
                  <rect x={900} y={y - 22} width={744} height={48} fill={position % 2 ? C.zebra : C.paper} rx={3} />
                  {isKey && <rect x={900} y={y - 22} width={3} height={48} fill={C.accent} rx={1.5} />}
                  <text x={912} y={y + 2} fontSize={13} fontWeight={700} fill={isKey ? C.accent : C.ink} fontFamily="ui-monospace, monospace">{row.index + 1}</text>
                  <text x={932} y={y - 3} fontSize={13} fontWeight={600} fill={C.ink} fontFamily="Inter, system-ui, sans-serif">
                    {row.head.maker} {row.head.model}
                    {!row.light.enabled && '  · OFF'}
                  </text>
                  <text x={932} y={y + 14} fontSize={11} fill={C.mid} fontFamily="ui-monospace, monospace">
                    {row.modifier.maker} {row.modifier.model}
                    {row.light.gridDegrees ? ` + ${row.light.gridDegrees}° GRID` : ''}
                    {' · '}{row.light.operationMode === 'flash' ? (row.light.hssEnabled ? 'HSS' : `FLASH t.5 1/${Math.round(effectiveFreezeSpeed(row.head.flashDurationT05 ?? 1 / 800))}`) : 'CONT'}
                    {row.fittedGel.id !== 'none'
                      ? ` · GEL ${row.fittedGel.code} ${row.fittedGel.name.toUpperCase()}`
                      : row.gel.gel !== 'none' ? ` · SUGGEST ${row.gel.strength} ${row.gel.gel}` : ''}
                  </text>
                  <text x={1196} y={y + 2} textAnchor="end" fontSize={12} fill={C.ink} fontFamily="ui-monospace, monospace">{row.light.powerPercent}%</text>
                  <text x={1256} y={y + 2} textAnchor="end" fontSize={12} fill={C.ink} fontFamily="ui-monospace, monospace">{row.distance.toFixed(2)}</text>
                  <text x={1310} y={y + 2} textAnchor="end" fontSize={12} fill={C.ink} fontFamily="ui-monospace, monospace">{row.light.position[1].toFixed(2)}</text>
                  <text x={1360} y={y + 2} textAnchor="end" fontSize={12} fill={C.ink} fontFamily="ui-monospace, monospace">{row.azimuth >= 0 ? '+' : ''}{row.azimuth.toFixed(0)}°</text>
                  <text x={1404} y={y + 2} textAnchor="end" fontSize={12} fill={C.ink} fontFamily="ui-monospace, monospace">{row.elevationDeg.toFixed(0)}°</text>
                  <text x={1470} y={y - 3} textAnchor="end" fontSize={12} fill={C.ink} fontFamily="ui-monospace, monospace">{reading ? `${reading.apparentDegrees.toFixed(0)}°` : '—'}</text>
                  <text x={1470} y={y + 14} textAnchor="end" fontSize={10} fill={C.mid} fontFamily="ui-monospace, monospace">{reading?.character ?? ''}</text>
                  <text x={1536} y={y + 2} textAnchor="end" fontSize={12} fill={C.ink} fontFamily="ui-monospace, monospace">{reading ? `${reading.penumbraCm.toFixed(0)} cm` : '—'}</text>
                  <text x={1638} y={y - 3} textAnchor="end" fontSize={14} fontWeight={700} fill={isKey ? C.accent : C.ink} fontFamily="Inter, system-ui, sans-serif">
                    {reading && reading.totalLux > 0 ? (isKey ? 'KEY' : `−${reading.stopsUnderKey.toFixed(1)} EV`) : '—'}
                  </text>
                  <text x={1638} y={y + 14} textAnchor="end" fontSize={10} fill={C.mid} fontFamily="ui-monospace, monospace">
                    {reading && reading.totalLux > 0
                      ? `${reading.totalLux < 10 ? reading.totalLux.toFixed(1) : Math.round(reading.totalLux)} ${reading.flash ? 'lx·s' : 'lx'}${reading.blocked ? ' · FLAGGED' : ''}`
                      : reading?.blocked ? 'FLAGGED' : ''}
                  </text>
                </g>
              )
            })}
            {state.modifiers.length > 0 && (
              <text x={900} y={Math.min(1122, 566 + rows.length * 52 + 12)} fontSize={11} fill={C.mid} fontFamily="ui-monospace, monospace">
                GRIP · {state.modifiers.map((grip) => `${grip.name} (${grip.surface} ${grip.type}, ${grip.width.toFixed(1)}×${grip.height.toFixed(1)} m)`).join('  ·  ')}
              </text>
            )}
          </g>

          {/* ---------- Footer ---------- */}
          <line x1={36} y1={1114} x2={SHEET_WIDTH - 36} y2={1114} stroke={C.hair} strokeWidth={1} />
          <text x={36} y={1136} fontSize={11} fill={C.mid} fontFamily="ui-monospace, monospace">
            AZ measured from the camera axis, + to camera right · EL above subject eyeline · SOURCE is apparent angular size at the subject · PENUM is the penumbra cast 1 m behind
          </text>
          <text x={SHEET_WIDTH - 36} y={1136} textAnchor="end" fontSize={11} fill={C.mid} fontFamily="ui-monospace, monospace">
            {keyRow ? `KEY · ${keyRow.head.maker} ${keyRow.head.model} @ ${clockPosition(keyRow.azimuth)}` : 'NO KEY LIGHT'}
          </text>
        </svg>
      </div>
    </div>
  )
}
