import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { reportError } from '../monitoring'

export function CanvasHealth({ onLost, onRestored }: { onLost: () => void; onRestored: () => void }) {
  const gl = useThree((state) => state.gl)
  useEffect(() => {
    const canvas = gl.domElement
    const lost = (event: Event) => {
      event.preventDefault()
      reportError(new Error('WebGL context lost'), { area: 'webgl' })
      onLost()
    }
    const restored = () => onRestored()
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', restored)
    return () => {
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', restored)
    }
  }, [gl, onLost, onRestored])
  return null
}
