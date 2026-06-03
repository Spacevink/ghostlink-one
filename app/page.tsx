'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '../lib/supabase'
import styles from './login.module.css'

export default function LoginPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    let animId: number
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
    script.onload = () => initScene()
    document.head.appendChild(script)

    function initScene() {
      const THREE = (window as any).THREE
      const canvas = canvasRef.current!
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.setSize(window.innerWidth, window.innerHeight)
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
      camera.position.set(0, 1.5, 0)
      camera.lookAt(0, 1.2, -20)
      const TRAILS = 8, TRAIL_LENGTH = 120
      const trails: any[] = []
      for (let t = 0; t < TRAILS; t++) {
        const offset = (t - TRAILS / 2) * 0.6
        const speedMult = 0.4 + Math.random() * 0.6
        const hue = t % 2 === 0 ? 0.55 : 0.85
        const color = new THREE.Color().setHSL(hue, 1, 0.6)
        const positions = new Float32Array(TRAIL_LENGTH * 3)
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, linewidth: 2 }))
        scene.add(line)
        trails.push({ offset, speedMult, positions, geometry, t: Math.random() * 100 })
      }
      function getPoint(t: number, offset: number) {
        return { x: offset + Math.sin(t * 0.18) * 3.5 + Math.sin(t * 0.07) * 2, y: 0.05 + Math.abs(Math.sin(t * 0.12)) * 0.3, z: -t * 1.2 }
      }
      function animate() {
        animId = requestAnimationFrame(animate)
        trails.forEach(trail => {
          trail.t += 0.015 * trail.speedMult
          for (let i = 0; i < TRAIL_LENGTH; i++) {
            const p = getPoint(trail.t + i * 0.3, trail.offset)
            trail.positions[i * 3] = p.x; trail.positions[i * 3 + 1] = p.y; trail.positions[i * 3 + 2] = p.z
          }
          trail.geometry.attributes.position.needsUpdate = true
        })
        renderer.render(scene, camera)
      }
      animate()
      window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight) })
    }
    return () => { cancelAnimationFrame(animId) }
  }, [])

  const handleGoogleLogin = async () => {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/api/auth/callback` }
    })
  }

  return (
    <div className={styles.root}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.overlay}>
        <div className={styles.card}>
          <div className={styles.wordmark}>GHOSTLINK</div>
          <p className={styles.sub}>Your project portal</p>
          <button className={styles.btn} onClick={handleGoogleLogin} disabled={loading}>
            {loading ? 'Redirecting…' : (<><GoogleIcon /> Continue with Google</>)}
          </button>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 8 }}>
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  )
}
