'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient, Project } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

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
      setUser(data.user); loadProjects()
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
    setSaving(false); setShowModal(false)
    setForm({ name: '', description: '', subdomain: '', repo_url: '', icon: '⚡' })
    loadProjects()
  }

  async function signOut() { await supabase.auth.signOut(); router.replace('/') }

  useEffect(() => {
    let animId: number, disposed = false
    async function init() {
      const THREE = await import('three')
      const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js' as any)
      const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js' as any)
      const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js' as any)
      if (disposed || !canvasRef.current) return
      const canvas = canvasRef.current
      const W = window.innerWidth, H = window.innerHeight
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(W, H)
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 2000)
      camera.position.set(0, 2.2, 6); camera.lookAt(0, 1.5, -30)
      const composer = new EffectComposer(renderer)
      composer.addPass(new RenderPass(scene, camera))
      const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.6, 0.5, 0.05)
      composer.addPass(bloom)
      const TRAILS = 10, SEG = 180; const trails: any[] = []
      for (let i = 0; i < TRAILS; i++) {
        const isLeft = i % 2 === 0, isHead = i < 4
        const col = isHead ? new THREE.Color(isLeft ? 0xcfe3ff : 0xf4faff) : new THREE.Color(isLeft ? 0xff3340 : 0xff5555)
        const positions = new Float32Array(SEG * 3), geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9 })))
        trails.push({ positions, geo, laneOffset: (i - TRAILS/2)*0.55+(isLeft?-0.15:0.15), speed: 0.3+Math.random()*0.5, phase: Math.random()*Math.PI*2, t: Math.random()*60 })
      }
      function getPoint(t: number, lane: number, phase: number) { return { x: lane+Math.sin(t*0.14+phase)*2.8+Math.sin(t*0.06+phase*0.5)*1.4, y: 0.1+Math.abs(Math.sin(t*0.1+phase))*0.25, z: -t*1.6 } }
      function animate() {
        animId = requestAnimationFrame(animate)
        trails.forEach(tr => { tr.t+=0.012*tr.speed; for(let i=0;i<SEG;i++){const p=getPoint(tr.t+i*0.28,tr.laneOffset,tr.phase);tr.positions[i*3]=p.x;tr.positions[i*3+1]=p.y;tr.positions[i*3+2]=p.z} tr.geo.attributes.position.needsUpdate=true })
        composer.render()
      }
      animate()
      window.addEventListener('resize',()=>{const w=window.innerWidth,h=window.innerHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);composer.setSize(w,h)})
    }
    init(); return () => { disposed=true; cancelAnimationFrame(animId) }
  }, [])

  const initials = user?.user_metadata?.full_name?.split(' ').map((n:string)=>n[0]).join('').slice(0,2)||user?.email?.[0]?.toUpperCase()||'G'
  const avatarImg = user?.user_metadata?.avatar_url

  return (
    <>
      <canvas ref={canvasRef} id="bg" />
      <div style={{ position:'fixed', inset:0, zIndex:1 }}>
        <div className="stage">
          <div className="topbar glass" style={{ borderBottom:'1px solid var(--edge)' }}>
            <div className="brand">
              <div className="brand__mark"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L14 6v4L8 14 2 10V6L8 2z" fill="currentColor"/></svg></div>
              <span className="brand__name">Ghostlink</span><span className="brand__dot">.one</span>
            </div>
            <div className="topbar__right">
              <span className="chip">{projects.length} project{projects.length!==1?'s':''}</span>
              {avatarImg?<img src={avatarImg} alt="" style={{width:38,height:38,borderRadius:'50%',border:'2px solid var(--edge-strong)',boxShadow:'0 0 18px var(--glow)'}}/>:<div className="avatar">{initials}</div>}
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
                {projects.map((p,i)=>{
                  const url=p.subdomain?`https://${p.subdomain}.ghostlink.one`:p.repo_url||'#'
                  return(
                    <a key={p.id} className="widget glass" href={url} target="_blank" rel="noreferrer" style={{animationDelay:`${i*0.05}s`}}>
                      <div className="widget__glow"/>
                      <span className="widget__id mono">0{i+1}</span>
                      <div style={{fontSize:32,marginBottom:4}}>{p.icon||'⚡'}</div>
                      <div className="widget__label">{p.name}</div>
                      {p.subdomain&&<div className="widget__sub">{p.subdomain}.ghostlink.one</div>}
                      {p.description&&<div style={{fontSize:13,color:'var(--ink-3)',marginTop:2}}>{p.description}</div>}
                    </a>
                  )
                })}
                <button className="widget widget--outline" onClick={()=>setShowModal(true)} style={{cursor:'pointer',border:'none',background:'none'}}>
                  <div className="widget__glow"/>
                  <span className="widget__id mono">+{String(projects.length+1).padStart(2,'0')}</span>
                  <div className="widget__plus">+</div>
                  <div className="widget__label">New project</div>
                  <div className="widget__sub">click to create</div>
                </button>
              </div>
            </div>
          </div>
        </div>
        {showModal&&(
          <div className="modal-backdrop" onClick={()=>setShowModal(false)}>
            <div className="modal glass" onClick={e=>e.stopPropagation()}>
              <div className="modal__title">New project</div>
              <div className="field"><label>Project name</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="My App"/></div>
              <div className="field"><label>Description</label><input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="What does it do?"/></div>
              <div className="field"><label>Subdomain <span style={{color:'var(--ink-3)',textTransform:'none'}}>.ghostlink.one</span></label><input value={form.subdomain} onChange={e=>setForm(f=>({...f,subdomain:e.target.value}))} placeholder="myapp"/></div>
              <div className="field"><label>GitHub repo URL</label><input value={form.repo_url} onChange={e=>setForm(f=>({...f,repo_url:e.target.value}))} placeholder="https://github.com/..."/></div>
              <div className="field-row"><div className="field" style={{flex:1}}><label>Icon</label><input value={form.icon} onChange={e=>setForm(f=>({...f,icon:e.target.value}))} placeholder="⚡" style={{maxWidth:80}}/></div></div>
              <div className="modal-actions">
                <button className="btn btn--ghost" onClick={()=>setShowModal(false)}>Cancel</button>
                <button className="btn btn--primary" onClick={addProject} disabled={!form.name||saving}>{saving?'Creating…':'Create project'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
