'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import {
  type HueLightsMap, type HueLight,
  fetchLights, toggleLight, setBrightness,
  briToPercent, inferRoom, WARM_WHITE_HEX, xyBriToHex,
} from '../../../lib/hue'

const WALL_H  = 2.8
const WALL_T  = 0.12
const FLOOR_T = 0.08
const Y0      = 0
const Y1      = WALL_H + FLOOR_T
const BG      = 0x04070f

// ─── Palette (light enough to read without artificial lights) ─
const C = {
  wallExt:     0x2c3550,  // dark blue-grey — visible but moody
  wallInt:     0x38405a,
  floorWood:   0x9a7248,  // warm oak
  floorTile:   0xa8b0c0,  // cool tile
  floorGarage: 0x3a3a3a,
  floorHall:   0x786860,  // warm grey
  sofa:        0x9a4040,
  table:       0x5c3e20,
  bed:         0x364a70,
  white:       0xf5f0e8,
  dark:        0x222232,
  grey:        0x4a4a5a,
  car:         0x1e3a70,
  shelves:     0x382c1c,
}

interface FItem { rx:number; rz:number; w:number; h:number; d:number; col:number }
interface RoomDef { id:string; label:string; x:number; z:number; w:number; d:number; floorY:number; floorCol:number; items:FItem[] }

const GROUND: RoomDef[] = [
  {
    id:'keuken', label:'Keuken', x:0, z:0, w:4.3, d:3.0, floorY:Y0, floorCol:C.floorWood,
    items:[
      {rx:0.15, rz:0.15, w:3.5,  h:0.9,  d:0.55, col:C.dark},
      {rx:0.15, rz:0.15, w:0.55, h:0.9,  d:2.0,  col:C.dark},
      {rx:1.2,  rz:1.1,  w:1.6,  h:0.9,  d:0.85, col:C.white},
    ],
  },
  {
    id:'eethoek', label:'Eethoek', x:4.7, z:0, w:3.8, d:4.3, floorY:Y0, floorCol:C.floorWood,
    items:[
      {rx:0.8, rz:1.1, w:2.2, h:0.75, d:1.1, col:C.table},
      {rx:0.6, rz:0.4, w:0.5, h:0.45, d:0.5, col:C.white},
      {rx:1.3, rz:0.4, w:0.5, h:0.45, d:0.5, col:C.white},
      {rx:2.0, rz:0.4, w:0.5, h:0.45, d:0.5, col:C.white},
      {rx:0.6, rz:2.6, w:0.5, h:0.45, d:0.5, col:C.white},
      {rx:1.3, rz:2.6, w:0.5, h:0.45, d:0.5, col:C.white},
      {rx:2.0, rz:2.6, w:0.5, h:0.45, d:0.5, col:C.white},
    ],
  },
  {
    id:'zithoek', label:'Zithoek', x:4.7, z:4.3, w:3.8, d:5.1, floorY:Y0, floorCol:C.floorWood,
    items:[
      {rx:0.3, rz:0.8, w:2.6,  h:0.75, d:0.9,  col:C.sofa},
      {rx:2.7, rz:0.8, w:0.9,  h:0.75, d:2.0,  col:C.sofa},
      {rx:0.8, rz:2.1, w:1.2,  h:0.45, d:0.65, col:C.table},
      {rx:0.3, rz:4.5, w:3.0,  h:0.35, d:0.35, col:C.dark},
      {rx:0.9, rz:4.0, w:1.8,  h:1.0,  d:0.08, col:0x1a1a2e},
    ],
  },
  {
    id:'berging', label:'Berging', x:0, z:3.0, w:3.8, d:2.5, floorY:Y0, floorCol:C.floorHall,
    items:[
      {rx:0.15, rz:0.3,  w:0.6, h:0.85, d:0.6,  col:C.grey},
      {rx:0.85, rz:0.3,  w:0.6, h:0.85, d:0.6,  col:C.grey},
      {rx:1.8,  rz:0.15, w:1.8, h:2.0,  d:0.35, col:C.shelves},
    ],
  },
  {
    id:'garage', label:'Garage', x:0, z:5.5, w:5.0, d:4.1, floorY:Y0, floorCol:C.floorGarage,
    items:[
      {rx:0.5,  rz:0.2,  w:1.85, h:0.6,  d:3.9, col:C.car},
      {rx:0.55, rz:0.55, w:1.75, h:0.35, d:1.8, col:0x0a0e1e},
    ],
  },
  {
    id:'inkom', label:'Inkom', x:3.8, z:7.8, w:1.8, d:1.8, floorY:Y0, floorCol:C.floorHall,
    items:[],
  },
  {
    id:'wc', label:'WC', x:5.6, z:8.2, w:1.4, d:1.0, floorY:Y0, floorCol:C.floorTile,
    items:[
      {rx:0.1, rz:0.1, w:0.45, h:0.4,  d:0.55, col:C.white},
      {rx:0.7, rz:0.1, w:0.5,  h:0.85, d:0.4,  col:C.white},
    ],
  },
]

const FIRST: RoomDef[] = [
  {
    id:'badkamer', label:'Badkamer', x:0, z:0, w:2.6, d:3.6, floorY:Y1, floorCol:C.floorTile,
    items:[
      {rx:0.15, rz:0.2,  w:0.85, h:0.55, d:1.7,  col:C.white},
      {rx:0.15, rz:2.9,  w:0.45, h:0.4,  d:0.55, col:C.white},
      {rx:1.0,  rz:2.75, w:1.3,  h:0.85, d:0.5,  col:C.white},
    ],
  },
  {
    id:'dressing', label:'Dressing', x:2.6, z:0, w:2.0, d:2.8, floorY:Y1, floorCol:C.floorWood,
    items:[
      {rx:0.1, rz:0.15, w:1.7, h:2.1, d:0.55, col:C.dark},
    ],
  },
  {
    id:'slaapkamer', label:'Slaapkamer', x:4.6, z:0, w:3.9, d:3.6, floorY:Y1, floorCol:C.floorWood,
    items:[
      {rx:0.7, rz:0.3, w:1.8, h:0.15, d:2.1,  col:0x3a2a18},
      {rx:0.7, rz:0.3, w:1.8, h:0.55, d:2.1,  col:C.bed},
      {rx:0.7, rz:0.3, w:1.8, h:1.0,  d:0.12, col:0x2a2040},
      {rx:0.3, rz:0.3, w:0.4, h:0.5,  d:0.45, col:C.table},
      {rx:2.7, rz:0.3, w:0.4, h:0.5,  d:0.45, col:C.table},
      {rx:0.1, rz:2.9, w:2.2, h:2.1,  d:0.55, col:C.dark},
      {rx:3.2, rz:0.3, w:0.6, h:0.75, d:1.6,  col:C.table},
      {rx:3.2, rz:1.0, w:0.6, h:0.45, d:0.6,  col:C.grey},
    ],
  },
  {
    id:'bureau', label:'Bureau', x:0, z:3.6, w:2.9, d:3.4, floorY:Y1, floorCol:C.floorWood,
    items:[
      {rx:0.2, rz:0.2, w:1.5, h:0.75, d:0.7,  col:C.table},
      {rx:0.4, rz:1.0, w:0.6, h:0.45, d:0.6,  col:C.grey},
      {rx:0.1, rz:2.6, w:2.5, h:2.1,  d:0.35, col:C.shelves},
    ],
  },
  {
    id:'nachthal', label:'Nachthal', x:2.9, z:2.8, w:2.0, d:1.8, floorY:Y1, floorCol:C.floorHall,
    items:[],
  },
]

const FIXTURE_POS: Record<string, {x:number; y:number; z:number}> = {
  keuken:     {x:2.15, y:Y0+WALL_H-0.15, z:1.5},
  eethoek:    {x:6.3,  y:Y0+WALL_H-0.15, z:2.0},
  zithoek:    {x:6.3,  y:Y0+WALL_H-0.15, z:7.0},
  berging:    {x:1.9,  y:Y0+WALL_H-0.15, z:4.2},
  inkom:      {x:4.7,  y:Y0+WALL_H-0.15, z:8.7},
  garage:     {x:2.5,  y:Y0+WALL_H-0.15, z:7.5},
  slaapkamer: {x:6.5,  y:Y1+WALL_H-0.15, z:1.8},
  badkamer:   {x:1.3,  y:Y1+WALL_H-0.15, z:1.8},
  dressing:   {x:3.6,  y:Y1+WALL_H-0.15, z:1.4},
  bureau:     {x:1.4,  y:Y1+WALL_H-0.15, z:5.3},
  nachthal:   {x:3.9,  y:Y1+WALL_H-0.15, z:3.7},
}

function box(w:number, h:number, d:number, col:number, x:number, y:number, z:number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: col }),
  )
  mesh.position.set(x, y, z)
  return mesh
}

function buildRoom(scene: THREE.Scene, r: RoomDef) {
  const cx = r.x + r.w / 2, cz = r.z + r.d / 2
  const wy = r.floorY + WALL_H / 2

  const floor = box(r.w, FLOOR_T, r.d, r.floorCol, cx, r.floorY - FLOOR_T / 2, cz)
  floor.userData = { roomId: r.id }
  scene.add(floor)

  scene.add(box(r.w + WALL_T, WALL_H, WALL_T,    C.wallExt, cx,        wy, r.z))
  scene.add(box(r.w + WALL_T, WALL_H, WALL_T,    C.wallExt, cx,        wy, r.z + r.d))
  scene.add(box(WALL_T,       WALL_H, r.d,        C.wallExt, r.x,       wy, cz))
  scene.add(box(WALL_T,       WALL_H, r.d,        C.wallExt, r.x + r.w, wy, cz))

  for (const it of r.items) {
    scene.add(box(it.w, it.h, it.d, it.col,
      r.x + it.rx + it.w / 2, r.floorY + it.h / 2, r.z + it.rz + it.d / 2))
  }
}

interface Props { initialLights: HueLightsMap }
type Floor = 'ground' | 'first'

export default function HomeScene({ initialLights }: Props) {
  const mountRef   = useRef<HTMLDivElement>(null)
  const camRef     = useRef<THREE.OrthographicCamera | null>(null)
  const rafRef     = useRef<number>(0)
  const plightsRef = useRef<Map<string, THREE.PointLight>>(new Map())

  const [floor,    setFloor]    = useState<Floor>('ground')
  const [lights,   setLights]   = useState<HueLightsMap>(initialLights)
  const [loading,  setLoading]  = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try { setLoading(true); setLights(await fetchLights()); setError(null) }
    catch { setError('Bridge unreachable') }
    finally { setLoading(false) }
  }, [])

  const handleToggle = useCallback(async (light: HueLight) => {
    setToggling(light.id)
    try {
      await toggleLight(light.id, light.state.on)
      setLights(prev => ({ ...prev, [light.id]: { ...prev[light.id], state: { ...prev[light.id].state, on: !light.state.on } } }))
    } finally { setToggling(null) }
  }, [])

  useEffect(() => {
    for (const l of Object.values(lights)) {
      const pl = plightsRef.current.get(inferRoom(l.name) ?? '')
      if (!pl) continue
      if (l.state.on && l.state.reachable !== false) {
        const bri = l.state.bri ?? 200
        pl.intensity = (bri / 254) * 4.0   // strong warm boost on top of ambient
        pl.color.set(l.state.colormode === 'xy' && l.state.xy ? xyBriToHex(l.state.xy, bri) : WARM_WHITE_HEX)
      } else {
        pl.intensity = 0
      }
    }
  }, [lights])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(BG, 1)
    mount.appendChild(renderer.domElement)

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight
      renderer.setSize(w, h)
      const zoom = 9, asp = w / h
      if (camRef.current) {
        Object.assign(camRef.current, { left:-zoom*asp, right:zoom*asp, top:zoom, bottom:-zoom })
        camRef.current.updateProjectionMatrix()
      }
    }
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    const zoom = 9, asp = mount.clientWidth / mount.clientHeight
    const cam = new THREE.OrthographicCamera(-zoom*asp, zoom*asp, zoom, -zoom, 0.1, 200)
    cam.position.set(20, 20, 20)
    cam.lookAt(4.3, 1.5, 4.8)
    camRef.current = cam

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(BG)

    // ── Base lighting: bright enough to read everything clearly ──
    // Cool blue ambient = "daytime with shutters closed" / blue sky fill
    scene.add(new THREE.AmbientLight(0x4a6090, 3.5))
    // Soft warm fill from above-right (simulates ceiling bounce)
    const fill = new THREE.DirectionalLight(0x8899bb, 1.2)
    fill.position.set(10, 20, 10)
    scene.add(fill)
    // Subtle back rim from opposite corner for depth
    const rim = new THREE.DirectionalLight(0x334466, 0.4)
    rim.position.set(-8, 8, -8)
    scene.add(rim)

    const rooms = floor === 'ground' ? GROUND : FIRST
    for (const r of rooms) buildRoom(scene, r)

    const pls = new Map<string, THREE.PointLight>()
    for (const [roomId, pos] of Object.entries(FIXTURE_POS)) {
      const onFirst = pos.y > Y1
      if (floor === 'ground' && onFirst)  continue
      if (floor === 'first'  && !onFirst) continue

      // Fixture glow sphere
      const fix = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff0dd }),
      )
      fix.position.set(pos.x, pos.y, pos.z)
      scene.add(fix)

      // Point light: off by default, strong warm when on
      const pl = new THREE.PointLight(0xffd49a, 0, 8, 1.6)
      pl.position.set(pos.x, pos.y - 0.3, pos.z)
      scene.add(pl)
      pls.set(roomId, pl)
    }
    plightsRef.current = pls

    // Hydrate initial Hue state
    for (const l of Object.values(lights)) {
      const pl = pls.get(inferRoom(l.name) ?? '')
      if (!pl || !l.state.on || l.state.reachable === false) continue
      const bri = l.state.bri ?? 200
      pl.intensity = (bri / 254) * 4.0
      if (l.state.colormode === 'xy' && l.state.xy) pl.color.set(xyBriToHex(l.state.xy, bri))
    }

    const animate = () => { rafRef.current = requestAnimationFrame(animate); renderer.render(scene, cam) }
    animate(); resize()

    return () => {
      cancelAnimationFrame(rafRef.current); ro.disconnect(); renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor])

  const lightHex = (l: HueLight) => {
    if (!l.state.on) return '#1a1f2e'
    if (l.state.colormode === 'xy' && l.state.xy) return xyBriToHex(l.state.xy, l.state.bri ?? 200)
    return WARM_WHITE_HEX
  }

  const lightList    = Object.values(lights)
  const groundLights = lightList.filter(l => { const r = inferRoom(l.name); return r ? GROUND.some(g => g.id === r) : true })
  const firstLights  = lightList.filter(l => { const r = inferRoom(l.name); return r ? FIRST.some(f => f.id === r) : false })
  const activeList   = floor === 'ground' ? groundLights : firstLights
  const unassigned   = lightList.filter(l => !inferRoom(l.name))

  return (
    <div style={{ position:'fixed', inset:0, background:'var(--bg)', display:'flex', flexDirection:'column', fontFamily:'var(--font-body)', color:'var(--ink)' }}>

      {/* Topbar */}
      <div className="glass" style={{ height:72, padding:'0 30px', display:'flex', alignItems:'center', gap:16, borderBottom:'1px solid var(--edge)', flexShrink:0 }}>
        <a href="/portal" style={{ color:'var(--ink-3)', textDecoration:'none', fontSize:12, fontFamily:'var(--font-mono)', letterSpacing:'.1em' }}>← Portal</a>
        <div className="brand" style={{ marginLeft:8 }}>
          <div className="brand__mark">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L14 6v4L8 14 2 10V6L8 2z" fill="currentColor"/></svg>
          </div>
          <span className="brand__name">Ghostlink</span>
          <span className="brand__dot">.home</span>
        </div>

        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          {(['ground','first'] as Floor[]).map(f => (
            <button key={f} onClick={() => setFloor(f)} style={{
              padding:'7px 16px', borderRadius:'var(--r-pill)',
              border:`1px solid ${floor===f ? 'var(--edge-strong)' : 'var(--edge)'}`,
              background: floor===f ? 'rgba(150,190,255,.12)' : 'transparent',
              color: floor===f ? 'var(--ice)' : 'var(--ink-3)',
              fontFamily:'var(--font-mono)', fontSize:11, cursor:'pointer', letterSpacing:'.1em', textTransform:'uppercase',
            }}>
              {f === 'ground' ? 'Gelijkvloers' : 'Verdieping'}
            </button>
          ))}
        </div>

        <button onClick={refresh} disabled={loading} style={{ padding:'7px 14px', borderRadius:'var(--r-pill)', border:'1px solid var(--edge)', background:'transparent', color:'var(--ink-3)', fontSize:11, fontFamily:'var(--font-mono)', cursor:'pointer', letterSpacing:'.1em', opacity: loading ? .5 : 1 }}>
          {loading ? '···' : '⟳ SYNC'}
        </button>
      </div>

      {/* Main */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div ref={mountRef} style={{ flex:1, position:'relative' }} />

        {/* Light panel */}
        <div className="glass" style={{ width:280, display:'flex', flexDirection:'column', borderLeft:'1px solid var(--edge)', overflow:'hidden' }}>
          <div style={{ padding:'18px 20px 12px', borderBottom:'1px solid var(--edge)' }}>
            <div className="eyebrow" style={{ marginBottom:4 }}>Philips Hue</div>
            <div style={{ fontSize:13, color:'var(--ink-2)' }}>
              {lightList.length ? `${lightList.filter(l=>l.state.on).length} / ${lightList.length} aan` : 'Geen verbinding'}
            </div>
          </div>

          {error && (
            <div style={{ margin:'12px 16px', padding:'10px 14px', borderRadius:'var(--r-sm)', background:'rgba(255,50,50,.08)', border:'1px solid rgba(255,50,50,.2)', fontSize:12, color:'#ff8080' }}>
              {error} — is de relay actief?
            </div>
          )}

          <div style={{ flex:1, overflowY:'auto', padding:'12px 0' }}>
            {activeList.length === 0 && lightList.length === 0 && (
              <div style={{ padding:'20px', fontSize:12, color:'var(--ink-3)', lineHeight:1.6 }}>
                Configureer <code>HUE_RELAY_URL</code> in Vercel en start de Synology container.
              </div>
            )}

            {activeList.map(l => {
              const bri  = briToPercent(l.state.bri ?? 0)
              const col  = lightHex(l)
              const room = inferRoom(l.name)
              return (
                <div key={l.id} style={{ padding:'10px 20px', display:'flex', flexDirection:'column', gap:6, borderBottom:'1px solid rgba(160,195,255,.06)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', flexShrink:0, background: l.state.on ? col : '#1a1f2e', boxShadow: l.state.on ? `0 0 8px ${col}` : 'none', border:'1px solid rgba(160,195,255,.2)' }}/>
                    <span style={{ flex:1, fontSize:13, fontWeight:500, color: l.state.on ? 'var(--ink)' : 'var(--ink-3)' }}>{l.name}</span>
                    <button disabled={toggling===l.id} onClick={()=>handleToggle(l)} style={{ width:38, height:22, borderRadius:11, border:'none', cursor:'pointer', background: l.state.on ? 'rgba(150,190,255,.35)' : 'rgba(160,195,255,.08)', position:'relative', transition:'background .2s', flexShrink:0, opacity: toggling===l.id ? .5 : 1 }}>
                      <div style={{ position:'absolute', top:3, left: l.state.on ? 19 : 3, width:16, height:16, borderRadius:'50%', background: l.state.on ? 'var(--ice)' : 'var(--ink-3)', transition:'left .2s, background .2s', boxShadow: l.state.on ? '0 0 8px var(--glow)' : 'none' }}/>
                    </button>
                  </div>
                  {l.state.on && (
                    <input type="range" min={1} max={100} value={bri}
                      onChange={async e => {
                        const pct = Number(e.target.value)
                        await setBrightness(l.id, pct)
                        setLights(prev => ({ ...prev, [l.id]: { ...prev[l.id], state: { ...prev[l.id].state, bri: Math.round(pct/100*254) } } }))
                      }}
                      style={{ width:'100%', accentColor:'var(--accent)', cursor:'pointer', height:3 }}
                    />
                  )}
                  {room && <span style={{ fontSize:10, color:'var(--ink-3)', fontFamily:'var(--font-mono)', letterSpacing:'.1em', textTransform:'uppercase' }}>{room}</span>}
                </div>
              )
            })}

            {unassigned.length > 0 && (
              <>
                <div style={{ padding:'10px 20px 4px', fontSize:10, color:'var(--ink-3)', fontFamily:'var(--font-mono)', letterSpacing:'.12em', textTransform:'uppercase' }}>Niet toegewezen</div>
                {unassigned.map(l => (
                  <div key={l.id} style={{ padding:'10px 20px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid rgba(160,195,255,.06)', opacity:.7 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background: l.state.on ? WARM_WHITE_HEX : '#1a1f2e', border:'1px solid rgba(160,195,255,.2)' }}/>
                    <span style={{ flex:1, fontSize:12, color:'var(--ink-3)' }}>{l.name}</span>
                    <button disabled={toggling===l.id} onClick={()=>handleToggle(l)} style={{ fontSize:11, padding:'4px 10px', borderRadius:'var(--r-pill)', border:'1px solid var(--edge)', background:'transparent', color:'var(--ink-3)', cursor:'pointer' }}>
                      {l.state.on ? 'Uit' : 'Aan'}
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>

          <div style={{ padding:'12px 20px', borderTop:'1px solid var(--edge)', fontSize:10, color:'var(--ink-3)', fontFamily:'var(--font-mono)', lineHeight:1.6 }}>
            Namen zoals "Keuken 1" worden automatisch aan kamers gekoppeld.
          </div>
        </div>
      </div>
    </div>
  )
}
