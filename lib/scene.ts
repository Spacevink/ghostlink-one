'use client'
import * as THREE from 'three'

export function buildScene(canvas: HTMLCanvasElement) {
  const W = window.innerWidth, H = window.innerHeight

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(W, H)
  renderer.setClearColor(0x04070f, 1)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 2000)
  camera.position.set(0, 2.2, 6)
  camera.lookAt(0, 1.5, -30)

  const TRAILS = 10, SEG = 180
  const HEAD_COLORS = [0xcfe3ff, 0xf4faff, 0xcfe3ff, 0xf4faff]
  const TAIL_COLORS = [0xff3340, 0xff5555, 0xff3340, 0xff5555, 0xff3340, 0xff5555]

  const trails: any[] = []

  for (let i = 0; i < TRAILS; i++) {
    const isLeft = i % 2 === 0
    const isHead = i < 4
    const baseColor = isHead
      ? HEAD_COLORS[i % HEAD_COLORS.length]
      : TAIL_COLORS[(i - 4) % TAIL_COLORS.length]

    const laneOffset = (i - TRAILS / 2) * 0.55 + (isLeft ? -0.15 : 0.15)
    const speed = 0.3 + Math.random() * 0.5
    const phase = Math.random() * Math.PI * 2
    const t0 = Math.random() * 60

    const layers = [
      { opac: 0.95 },
      { opac: 0.35 },
      { opac: 0.12 },
    ]

    const lineObjects: any[] = []
    for (const layer of layers) {
      const positions = new Float32Array(SEG * 3)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const mat = new THREE.LineBasicMaterial({
        color: new THREE.Color(baseColor),
        transparent: true,
        opacity: layer.opac,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const line = new THREE.Line(geo, mat)
      scene.add(line)
      lineObjects.push({ positions, geo })
    }

    trails.push({ laneOffset, speed, phase, t: t0, lineObjects })
  }

  function getPoint(t: number, lane: number, phase: number) {
    return {
      x: lane + Math.sin(t * 0.14 + phase) * 2.8 + Math.sin(t * 0.06 + phase * 0.5) * 1.4,
      y: 0.1 + Math.abs(Math.sin(t * 0.1 + phase)) * 0.25,
      z: -t * 1.6,
    }
  }

  let animId = 0
  function animate() {
    animId = requestAnimationFrame(animate)
    trails.forEach(tr => {
      tr.t += 0.012 * tr.speed
      tr.lineObjects.forEach(({ positions, geo }: any) => {
        for (let i = 0; i < SEG; i++) {
          const p = getPoint(tr.t + i * 0.28, tr.laneOffset, tr.phase)
          positions[i * 3] = p.x
          positions[i * 3 + 1] = p.y
          positions[i * 3 + 2] = p.z
        }
        geo.attributes.position.needsUpdate = true
      })
    })
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
