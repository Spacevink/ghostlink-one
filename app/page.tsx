'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { buildScene } from '../lib/scene'

export default function LoginPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const router = useRouter()
  const supabase = createClient()
  const [authing, setAuthing] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace('/portal')
    })
  }, [])

  useEffect(() => {
    if (!canvasRef.current) return
    let cleanup: (() => void) | undefined
    buildScene(canvasRef.current).then(fn => { cleanup = fn })
    return () => cleanup?.()
  }, [])

  const handleLogin = async () => {
    setAuthing(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/api/auth/callback` },
    })
  }

  return (
    <>
      <canvas ref={canvasRef} id="bg" />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1 }}>
        <div className="login">
          <div className="login__card glass">
            <div className="brand" style={{ marginBottom: 30 }}>
              <div className="brand__mark">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2L14 6v4L8 14 2 10V6L8 2z" fill="currentColor" />
                </svg>
              </div>
              <span className="brand__name">Ghostlink</span>
              <span className="brand__dot">.one</span>
            </div>
            {!authing ? (
              <>
                <div className="login__title">Your projects,<br />one portal.</div>
                <div className="login__sub">Sign in to access your Ghostlink project dashboard.</div>
                <button className="gbtn" onClick={handleLogin}>
                  <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
                    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
                  </svg>
                  Continue with Google
                </button>
                <div className="login__legal">By continuing you agree to our terms of service.</div>
              </>
            ) : (
              <div className="auth">
                <div className="auth__ring"><div className="auth__ring-core" /></div>
                <ul className="auth__steps">
                  {[
                    { label: 'Verifying identity', s: 'done' },
                    { label: 'Connecting to Google', s: 'active' },
                    { label: 'Loading your portal', s: '' },
                  ].map((x, i) => (
                    <li key={i} className={x.s}>
                      <div className="auth__tick" />
                      {x.label}
                    </li>
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
