export async function buildScene(canvas: HTMLCanvasElement) {
  /* webpackIgnore comments prevent Next.js bundler from resolving CDN URLs */
  const THREE = await import(/* webpackIgnore: true */ 'https://unpkg.com/three@0.160.0/build/three.module.js' as any)
  const { EffectComposer } = await import(/* webpackIgnore: true */ 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js' as any)
  const { RenderPass } = await import(/* webpackIgnore: true */ 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js' as any)
  const { UnrealBloomPass } = await import(/* webpackIgnore: true */ 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js' as any)

  const W = window.innerWidth, H = window.innerHeight
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(W, H)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 2000)
  camera.position.set(0, 2.2, 6)
  camera.lookAt(0, 1.5, -30)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.8, 0.5, 0.05)
  composer.addPass(bloom)

  const TRAILS = 10, SEG = 180
  const trails: any[] = []
  for (let i = 0; i < TRAILS; i++) {
    const isLeft = i % 2 === 0, isHead = i < 4
    const col = isHead
      ? new THREE.Color(isLeft ? 0xcfe3ff : 0xf4faff)
      : new THREE.Color(isLeft ? 0xff3340 : 0xff5555)
    const positions = new Float32Array(SEG * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9 })))
    trails.push({
      positions, geo,
      laneOffset: (i - TRAILS / 2) * 0.55 + (isLeft ? -0.15 : 0.15),
      speed: 0.3 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      t: Math.random() * 60,
    })
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
      for (let i = 0; i < SEG; i++) {
        const p = getPoint(tr.t + i * 0.28, tr.laneOffset, tr.phase)
        tr.positions[i * 3] = p.x
        tr.positions[i * 3 + 1] = p.y
        tr.positions[i * 3 + 2] = p.z
      }
      tr.geo.attributes.position.needsUpdate = true
    })
    composer.render()
  }
  animate()

  const onResize = () => {
    const w = window.innerWidth, h = window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    composer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)

  return () => {
    cancelAnimationFrame(animId)
    window.removeEventListener('resize', onResize)
    renderer.dispose()
  }
}
