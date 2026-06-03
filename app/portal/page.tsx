'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient, Project } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { buildScene } from '../../lib/scene'

export default function PortalPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const supabase = createClient()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [user, setUser] = useState<any>(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', subdomain: '', repo_url: '', icon: '⚡' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/'); return }
      setUser(data.user)
      loadProjects()
    })
  }, [])

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('*').order('created_at')
    setProjects(data || [])
  }

  async function addProject() {
    if (!form.name) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('projects').insert({ ...form, owner_id: user!.id, status: 'active' })
    setSaving(false)
    setShowModal(false)
    setForm({ name: '', description: '', subdomain: '', repo_url: '', icon: '⚡' })
    loadProjects()
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/')
  }

  useEffect(() => {
    if (!canvasRef.current) return
    const cleanup = buildScene(canvasRef.current)
    return () => cleanup()
  }, [])

  const initials = user?.user_metadata?.full_name
    ?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)
    || user?.email?.[0]?.toUpperCase() || 'G'
  const avatarImg = user?.user_metadata?.avatar_url

  return (
    <>
      <canvas ref={canvasRef} id="bg" />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1 }}>
        <div className="stage">
          <div className="topbar glass" style={{ borderBottom: '1px solid var(--edge)' }}>
            <div className="brand">
              <div className="brand__mark">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2L14 6v4L8 14 2 10V6L8 2z" fill="currentColor" />
                </svg>
              </div>
              <span className="brand__name">Ghostlink</span>
              <span className="brand__dot">.one</span>
            </div>
            <div className="topbar__right">
              <span className="chip">{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
              {avatarImg
                ? <img src={avatarImg} alt="" style={{ width: 38, height: 38, borderRadius: '50%', border: '2px solid var(--edge-strong)', boxShadow: '0 0 18px var(--glow)' }} />
                : <div className="avatar">{initials}</div>
              }
              <button className="signout-btn" onClick={signOut}>Sign out</button>
            </div>
          </div>
          <div className="portal">
            <div className="portal__main">
              <div className="portal__head">
                <div className="eyebrow">Portal</div>
                <div className="portal__title">Your projects</div>
                <div className="portal__lead">Each project lives at its own subdomain with its own stack.</div>
              </div>
              <div className="grid">
                {projects.map((p, i) => {
                  const url = p.subdomain ? `https://${p.subdomain}.ghostlink.one` : p.repo_url || '#'
                  return (
                    <a key={p.id} className="widget glass" href={url} target="_blank" rel="noreferrer"
                      style={{ animationDelay: `${i * 0.05}s` }}>
                      <div className="widget__glow" />
                      <span className="widget__id mono">0{i + 1}</span>
                      <div style={{ fontSize: 32, marginBottom: 4 }}>{p.icon || '⚡'}</div>
                      <div className="widget__label">{p.name}</div>
                      {p.subdomain && <div className="widget__sub">{p.subdomain}.ghostlink.one</div>}
                      {p.description && <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>{p.description}</div>}
                    </a>
                  )
                })}
                <button className="widget widget--outline" onClick={() => setShowModal(true)}
                  style={{ cursor: 'pointer', border: 'none', background: 'none' }}>
                  <div className="widget__glow" />
                  <span className="widget__id mono">+{String(projects.length + 1).padStart(2, '0')}</span>
                  <div className="widget__plus">+</div>
                  <div className="widget__label">New project</div>
                  <div className="widget__sub">click to create</div>
                </button>
              </div>
            </div>
          </div>
        </div>
        {showModal && (
          <div className="modal-backdrop" onClick={() => setShowModal(false)}>
            <div className="modal glass" onClick={e => e.stopPropagation()}>
              <div className="modal__title">New project</div>
              <div className="field"><label>Project name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My App" /></div>
              <div className="field"><label>Description</label><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does it do?" /></div>
              <div className="field"><label>Subdomain <span style={{ color: 'var(--ink-3)', textTransform: 'none' }}>.ghostlink.one</span></label><input value={form.subdomain} onChange={e => setForm(f => ({ ...f, subdomain: e.target.value }))} placeholder="myapp" /></div>
              <div className="field"><label>GitHub repo URL</label><input value={form.repo_url} onChange={e => setForm(f => ({ ...f, repo_url: e.target.value }))} placeholder="https://github.com/..." /></div>
              <div className="field-row"><div className="field" style={{ flex: 1 }}><label>Icon</label><input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} placeholder="⚡" style={{ maxWidth: 80 }} /></div></div>
              <div className="modal-actions">
                <button className="btn btn--ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn--primary" onClick={addProject} disabled={!form.name || saving}>{saving ? 'Creating…' : 'Create project'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
