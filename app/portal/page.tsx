'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient, Project } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import styles from './portal.module.css'

export default function PortalPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const supabase = createClient()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [user, setUser] = useState<any>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newProject, setNewProject] = useState({ name: '', description: '', subdomain: '', repo_url: '', icon: '⚡', color: '#2ad7ff' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/'); return }
      setUser(data.user)
      loadProjects()
    })
  }, [])

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: true })
    setProjects(data || [])
  }

  async function addProject() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('projects').insert({ ...newProject, owner_id: user!.id, status: 'active' })
    setSaving(false)
    setShowAddModal(false)
    setNewProject({ name: '', description: '', subdomain: '', repo_url: '', icon: '⚡', color: '#2ad7ff' })
    loadProjects()
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

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
        scene.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, linewidth: 2 })))
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
    return () => cancelAnimationFrame(animId)
  }, [])

  const avatar = user?.user_metadata?.avatar_url
  const displayName = user?.user_metadata?.full_name || user?.email

  return (
    <div className={styles.root}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.ui}>
        <header className={styles.header}>
          <div className={styles.wordmark}>GHOSTLINK</div>
          <div className={styles.headerRight}>
            <span className={styles.slotCount}>{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
            {avatar ? <img src={avatar} alt="" className={styles.avatar} /> : <div className={styles.avatarFallback}>{displayName?.[0]}</div>}
            <button className={styles.signOut} onClick={signOut}>Sign out</button>
          </div>
        </header>
        <main className={styles.main}>
          <h1 className={styles.title}>Your projects</h1>
          <div className={styles.grid}>
            {projects.map(p => (<ProjectCard key={p.id} project={p} />))}
            <button className={styles.addCard} onClick={() => setShowAddModal(true)}>
              <span className={styles.addIcon}>+</span>
              <span>Add project</span>
            </button>
          </div>
        </main>
      </div>
      {showAddModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowAddModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>New project</h2>
            <label className={styles.label}>Name<input className={styles.input} value={newProject.name} onChange={e => setNewProject(p => ({...p, name: e.target.value}))} placeholder="My App" /></label>
            <label className={styles.label}>Description<input className={styles.input} value={newProject.description} onChange={e => setNewProject(p => ({...p, description: e.target.value}))} placeholder="What does it do?" /></label>
            <label className={styles.label}>Subdomain <span className={styles.muted}>.ghostlink.one</span><input className={styles.input} value={newProject.subdomain} onChange={e => setNewProject(p => ({...p, subdomain: e.target.value}))} placeholder="myapp" /></label>
            <label className={styles.label}>GitHub repo URL<input className={styles.input} value={newProject.repo_url} onChange={e => setNewProject(p => ({...p, repo_url: e.target.value}))} placeholder="https://github.com/..." /></label>
            <div className={styles.row}>
              <label className={styles.label}>Icon<input className={styles.input} value={newProject.icon} onChange={e => setNewProject(p => ({...p, icon: e.target.value}))} placeholder="⚡" style={{ width: 60 }} /></label>
              <label className={styles.label}>Accent color<input type="color" className={styles.colorPicker} value={newProject.color} onChange={e => setNewProject(p => ({...p, color: e.target.value}))} /></label>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={addProject} disabled={!newProject.name || saving}>{saving ? 'Saving…' : 'Create project'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const url = project.subdomain ? `https://${project.subdomain}.ghostlink.one` : project.repo_url
  return (
    <a className={styles.card} href={url || '#'} target={url ? '_blank' : undefined} rel="noreferrer"
       style={{ '--accent': project.color } as any}>
      <div className={styles.cardIcon}>{project.icon || '⚡'}</div>
      <div className={styles.cardName}>{project.name}</div>
      {project.description && <div className={styles.cardDesc}>{project.description}</div>}
      {project.subdomain && <div className={styles.cardUrl}>{project.subdomain}.ghostlink.one</div>}
      <div className={styles.cardStatus} data-status={project.status}>{project.status}</div>
    </a>
  )
}
