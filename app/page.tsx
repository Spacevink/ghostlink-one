'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '../lib/supabase'
import { useRouter } from 'next/navigation'

type AuthStep = 'idle' | 'authing'

export default function LoginPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState<AuthStep>('idle')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace('/portal')
    })
  }, [])

  useEffect(() => {
    let animId: number
    let disposed = false
    async function init() {
      const THREE = await import('three')
      const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js' as any)
      const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js' as any)
      const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js' as any)
      if (disposed || !canvasRef.current) return
      const canvas = canvasRef.current
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
        const isLeft = i % 2 === 0
        const isHead = i < 4
        const col = isHead ? new THREE.Color(isLeft ? 0xcfe3ff : 0xf4faff) : new THREE.Color(isLeft ? 0xff3340 : 0xff5555)
        const positions = new Float32Array(SEG * 3)
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9 }))
        scene.add(line)
        const laneOffset = (i - TRAILS / 2) * 0.55 + (isLeft ? -0.15 : 0.15)
        trails.push({ positions, geo, laneOffset, speed: 0.3 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2, t: Math.random() * 60 })
      }
      function getPoint(t: number, lane: number, phase: number) {
        return { x: lane + Math.sin(t * 0.14 + phase) * 2.8 + Math.sin(t * 0.06 + phase * 0.5) * 1.4, y: 0.1 + Math.abs(Math.sin(t * 0.1 + phase)) * 0.25, z: -t * 1.6 }
      }
      function animate() {
        animId = requestAnimationFrame(animate)
        trails.forEach(tr => {
          tr.t += 0.012 * tr.speed
          for (let i = 0; i < SEG; i++) { const p = getPoint(tr.t + i * 0.28, tr.laneOffset, tr.phase); tr.positions[i*3]=p.x; tr.positions[i*3+1]=p.y; tr.positions[i*3+2]=p.z }
          tr.geo.attributes.position.needsUpdate = true
        })
        composer.render()
      }
      animate()
      window.addEventListener('resize', () => { const w=window.innerWidth,h=window.innerHeight; camera.aspect=w/h; camera.updateProjectionMatrix(); renderer.setSize(w,h); composer.setSize(w,h) })
    }
    init()
    return () => { disposed = true; cancelAnimationFrame(animId) }
  }, [])

  const handleLogin = async () => {
    setStep('authing')
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/api/auth/callback` } })
  }

  return (
    <>
      <canvas ref={canvasRef} id="bg" />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1 }}>
        <div className="login">
          <div className="login__card glass">
            <div className="brand" style={{ marginBottom: 30 }}>
              <div className="brand__mark"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L14 6v4L8 14 2 10V6L8 2z" fill="currentColor"/></svg></div>
              <span className="brand__name">Ghostlink</span>
              <span className="brand__dot">.one</span>
            </div>
            {step === 'idle' ? (
              <>
                <div className="login__title">Your projects,<br/>one portal.</div>
                <div className="login__sub">Sign in to access your Ghostlink project dashboard.</div>
                <button className="gbtn" onClick={handleLogin}>
                  <svg width="20" height="20" viewBox="0 0 18 18" fill="none"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/></svg>
                  Continue with Google
                </button>
                <div className="login__legal">By continuing you agree to our terms of service.</div>
              </>
            ) : (
              <div className="auth">
                <div className="auth__ring"><div className="auth__ring-core" /></div>
                <ul className="auth__steps">
                  {[{label:'Verifying identity',s:'done'},{label:'Connecting to Google',s:'active'},{label:'Loading your portal',s:''}].map((x,i)=>(
                    <li key={i} className={x.s}><div className="auth__tick"/>{x.label}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
