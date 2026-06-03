function initScene(canvas: HTMLCanvasElement, T: any) {
  const W = window.innerWidth, H = window.innerHeight
  const renderer = new T.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(W, H)
  renderer.setClearColor(0x04070f, 1)

  const scene = new T.Scene()
  const camera = new T.PerspectiveCamera(55, W / H, 0.1, 2000)
  camera.position.set(0, 2.2, 6)
  camera.lookAt(0, 1.5, -30)

  const TRAILS = 10, SEG = 180
  const HEAD = [0xcfe3ff, 0xf4faff, 0xcfe3ff, 0xf4faff]
  const TAIL = [0xff3340, 0xff5555, 0xff3340, 0xff5555, 0xff3340, 0xff5555]

  const trails: any[] = []

  for (let i = 0; i < TRAILS; i++) {
    const isHead = i < 4
    const col = new T.Color(isHead ? HEAD[i % 4] : TAIL[(i - 4) % 6])
    const laneOffset = (i - TRAILS / 2) * 0.6 + (i % 2 === 0 ? -0.2 : 0.2)
    const speed = 0.4 + Math.random() * 0.6
    const phase = Math.random() * Math.PI * 2

    // 5 layers: bright core + glow rings = convincing bloom without postprocessing
    const layers = [1.0, 0.6, 0.3, 0.15, 0.06]
    const lineObjects: any[] = []

    for (const opac of layers) {
      const positions = new Float32Array(SEG * 3)
      const geo = new T.BufferGeometry()
      geo.setAttribute('position', new T.BufferAttribute(positions, 3))
      const mat = new T.LineBasicMaterial({
        color: col,
        transparent: true,
        opacity: opac,
        blending: T.AdditiveBlending,
        depthWrite: false,
      })
      scene.add(new T.Line(geo, mat))
      lineObjects.push({ positions, geo })
    }

    trails.push({ laneOffset, speed, phase, t: Math.random() * 60, lineObjects })
  }

  function pt(t: number, lane: number, ph: number) {
    return {
      x: lane + Math.sin(t * 0.14 + ph) * 2.8 + Math.sin(t * 0.06 + ph * 0.5) * 1.4,
      y: 0.1 + Math.abs(Math.sin(t * 0.1 + ph)) * 0.25,
      z: -t * 1.6,
    }
  }

  // Tiny spread per layer for thickness illusion
  const spreads = [0, 0.015, -0.015, 0.03, -0.03]

  let animId = 0
  function animate() {
    animId = requestAnimationFrame(animate)
    for (const tr of trails) {
      tr.t += 0.012 * tr.speed
      tr.lineObjects.forEach(({ positions, geo }: any, li: number) {
        const spread = spreads[li] || 0
        for (let i = 0; i < SEG; i++) {
          const p = pt(tr.t + i * 0.28, tr.laneOffset, tr.phase)
          positions[i * 3] = p.x + spread
          positions[i * 3 + 1] = p.y + spread * 0.5
          positions[i * 3 + 2] = p.z
        }
        geo.attributes.position.needsUpdate = true
      })
    }
    renderer.render(scene, camera)
  }
  animate()

  const onResize = () => {
    const w = window.innerWidth, h = window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)

  return () => {
    cancelAnimationFrame(animId)
    window.removeEventListener('resize', onResize)
    renderer.dispose()
  }
}

export function buildScene(canvas: HTMLCanvasElement): () => void {
  let cleanup: (() => void) | null = null
  let disposed = false

  if ((window as any).THREE) {
    cleanup = initScene(canvas, (window as any).THREE)
    return () => { cleanup?.() }
  }

  const script = document.createElement('script')
  script.src = 'https://unpkg.com/three@0.160.0/build/three.min.js'
  script.crossOrigin = 'anonymous'
  script.onload = () => {
    if (!disposed) cleanup = initScene(canvas, (window as any).THREE)
  }
  document.head.appendChild(script)

  return () => {
    disposed = true
    cleanup?.()
  }
}
