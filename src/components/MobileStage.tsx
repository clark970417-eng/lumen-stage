import { Canvas } from '@react-three/fiber'
import { Suspense, useState } from 'react'
import { StudioScene } from './StudioScene'

type MobileStageProps = {
  pageVisible: boolean
  view: 'studio' | 'camera' | 'top'
  renderMode: 'preview' | 'path'
  pathSamples: number
  onOpenStudio: () => void
  onOpenCamera: () => void
  onCapture: () => void
  capturing: boolean
  viewsLabel: string
  studioLabel: string
  cameraLabel: string
  hint: string
  shutterLabel: string
  loadingLabel: string
}

/** Heavy WebGL code is split from the phone shell so controls appear first. */
export default function MobileStage({
  pageVisible, view, renderMode, pathSamples, onOpenStudio, onOpenCamera, onCapture,
  capturing, viewsLabel, studioLabel, cameraLabel, hint, shutterLabel, loadingLabel,
}: MobileStageProps) {
  const [sceneReady, setSceneReady] = useState(false)

  return (
    <section className="viewport m-viewport">
      <Canvas
        onCreated={() => setSceneReady(true)}
        frameloop={pageVisible ? 'always' : 'never'}
        shadows="percentage"
        dpr={[1, 1.5]}
        gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
        camera={{ position: [6.8, 4.8, 7.2], fov: 42, near: 0.05, far: 100 }}
      >
        <Suspense fallback={null}><StudioScene /></Suspense>
      </Canvas>

      {!sceneReady && (
        <div className="viewport-loading" role="status">
          <span className="viewport-loading-mark"><i /></span>
          <strong>{loadingLabel}</strong>
          <small>BUILDING STUDIO · WEBGL</small>
        </div>
      )}

      <div className="m-views" role="group" aria-label={viewsLabel}>
        <button className={view === 'studio' ? 'active' : ''} onClick={onOpenStudio}>{studioLabel}</button>
        <button className={view === 'camera' ? 'active' : ''} onClick={onOpenCamera}>{cameraLabel}</button>
      </div>

      <span className="m-stage-hint">
        {renderMode === 'path' ? `PATH TRACING · ${Math.floor(pathSamples)} SPP` : hint}
      </span>

      <button className="m-shutter" onClick={onCapture} disabled={capturing} aria-label={shutterLabel}>
        <i />
      </button>
    </section>
  )
}
