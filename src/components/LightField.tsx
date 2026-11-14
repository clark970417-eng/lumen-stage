import { useEffect, useRef } from 'react'

/** Original WebGL light study: an aperture beam, rendered only while visible. */
export function LightField() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const gl = element.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' })
    if (!gl) return
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      return shader
    }
    const vertex = compile(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}')
    const fragment = compile(gl.FRAGMENT_SHADER, `precision mediump float;
      uniform vec2 size;uniform vec2 pointer;uniform float time;
      void main(){vec2 uv=gl_FragCoord.xy/size;float aspect=size.x/size.y;
      vec2 origin=vec2(.85+pointer.x*.035,1.18);vec2 d=uv-origin;d.x*=aspect;
      float angle=atan(d.y,d.x);float axis=-1.96+sin(time*.12)*.025+pointer.y*.035;
      float core=exp(-pow((angle-axis)*9.,2.));float fringe=exp(-pow((angle-axis)*3.5,2.));
      float fade=smoothstep(1.5,.08,length(d))*smoothstep(0.,.4,uv.y);
      float intensity=(core*.14+fringe*.035)*fade;
      gl_FragColor=vec4(vec3(1.,.69,.32)*intensity,intensity);}`)
    const program = gl.createProgram()!
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); return }
    gl.useProgram(program)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'p')
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const size = gl.getUniformLocation(program, 'size'), pointer = gl.getUniformLocation(program, 'pointer'), time = gl.getUniformLocation(program, 'time')
    let frame = 0, last = 0, visible = false, lost = false
    let x = 0, y = 0
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const resize = () => {
      const bounds = element.getBoundingClientRect(), scale = Math.min(devicePixelRatio, 1.5)
      element.width = Math.max(1, Math.round(bounds.width * scale)); element.height = Math.max(1, Math.round(bounds.height * scale))
      gl.viewport(0, 0, element.width, element.height)
      draw(0)
    }
    const draw = (now: number) => {
      if (lost) return
      gl.uniform2f(size, element.width, element.height); gl.uniform2f(pointer, x, y); gl.uniform1f(time, now / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    const tick = (now: number) => {
      frame = 0
      if (!visible || document.hidden || reduced.matches || lost) return
      if (now - last > 33) { draw(now); last = now }
      frame = requestAnimationFrame(tick)
    }
    const sync = () => { cancelAnimationFrame(frame); frame = 0; if (!reduced.matches && visible && !document.hidden && !lost) frame = requestAnimationFrame(tick); else draw(0) }
    const move = (event: PointerEvent) => { if (event.pointerType !== 'mouse') return; const box = element.getBoundingClientRect(); x = (event.clientX - box.left) / box.width - .5; y = (event.clientY - box.top) / box.height - .5 }
    const onLost = () => { lost = true; cancelAnimationFrame(frame) }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync() })
    const sizing = new ResizeObserver(resize)
    observer.observe(element); sizing.observe(element)
    element.parentElement?.addEventListener('pointermove', move)
    element.addEventListener('webglcontextlost', onLost)
    document.addEventListener('visibilitychange', sync); reduced.addEventListener('change', sync)
    resize()
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); sizing.disconnect()
      element.parentElement?.removeEventListener('pointermove', move); element.removeEventListener('webglcontextlost', onLost)
      document.removeEventListener('visibilitychange', sync); reduced.removeEventListener('change', sync)
      gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment)
    }
  }, [])
  return <canvas className="light-field" ref={canvas} aria-hidden="true" />
}
