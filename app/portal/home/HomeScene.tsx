'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls }    from 'three/examples/jsm/controls/OrbitControls'
import { EffectComposer }   from 'three/examples/jsm/postprocessing/EffectComposer'
import { RenderPass }       from 'three/examples/jsm/postprocessing/RenderPass'
import { UnrealBloomPass }  from 'three/examples/jsm/postprocessing/UnrealBloomPass'
import { OutputPass }       from 'three/examples/jsm/postprocessing/OutputPass'
import {
  type HueLightsMap, type HueLight,
  fetchLights, toggleLight, setBrightness,
  briToPercent, inferRoom, WARM_WHITE_HEX, xyBriToHex,
} from '../../../lib/hue'

// ─── Scene constants ───────────────────────────────────────────
const WH   = 2.8    // wall height
const WT   = 0.22   // exterior wall thickness
const WTI  = 0.10   // interior wall thickness
const FT   = 0.08   // floor thickness
const Y0   = 0      // ground floor
const Y1   = WH + FT + 0.12  // first floor
const BG   = 0x04070f

// ─── Material colours ──────────────────────────────────────────
const WALL_OUT = 0x252535   // dark charcoal exterior
const WALL_IN  = 0xf0ebe0   // warm white interior
const FC = {
  sofa:     0x9a4040, sofaB: 0x7a2828,
  tableD:   0x4a3418, tableL: 0x6a4e28,
  marble:   0xf4f0ea,
  black:    0x1a1820, darkgrey: 0x282835,
  grey:     0x484858,
  bedFrame: 0x2c2018, bedLinen: 0x364a70, bedSheet: 0xd0d8e8,
  bkA: 0x4a3418, bkB: 0x2a3a5a, bkC: 0x5a2a2a, bkD: 0x2a4a2a,
  car: 0x1e3a70, carR: 0x0a1830,
  glass: 0x88aabb, rug: 0x8a7060,
}

// ─── Procedural textures ───────────────────────────────────────
type TexKey = 'wood' | 'tile' | 'concrete' | 'hall'

function mkHerringbone(): THREE.CanvasTexture {
  const S=512,PW=28,PL=56
  const cv=document.createElement('canvas'); cv.width=cv.height=S
  const ctx=cv.getContext('2d')!
  const pal=['#a07848','#8c6838','#b28858','#7a5828','#946e3c','#a88450']
  ctx.fillStyle='#7a5828'; ctx.fillRect(0,0,S,S)
  let n=0
  const pl=(x:number,y:number,w:number,h:number,hz:boolean)=>{
    ctx.fillStyle=pal[(n++)%pal.length]; ctx.fillRect(x,y,w,h)
    ctx.strokeStyle='rgba(30,15,0,.3)'; ctx.lineWidth=1.5
    ctx.strokeRect(x+.75,y+.75,w-1.5,h-1.5)
    ctx.strokeStyle='rgba(0,0,0,.05)'; ctx.lineWidth=.5
    if(hz){for(let g=9;g<w-4;g+=13){ctx.beginPath();ctx.moveTo(x+g,y+2);ctx.bezierCurveTo(x+g+1,y+h*.35,x+g-1,y+h*.7,x+g,y+h-2);ctx.stroke()}}
    else  {for(let g=9;g<h-4;g+=13){ctx.beginPath();ctx.moveTo(x+2,y+g);ctx.bezierCurveTo(x+w*.35,y+g+1,x+w*.7,y+g-1,x+w-2,y+g);ctx.stroke()}}
  }
  for(let r=-1;r*PL<S+PL*2;r++)
    for(let c=-2;c*PW*2<S+PW*4;c++){
      const off=(r%2!==0)?PW:0,ox=c*PW*2+off,oy=r*PL
      pl(ox,oy,PL,PW,true); pl(ox+PL-PW,oy+PW,PW,PL,false)
    }
  const t=new THREE.CanvasTexture(cv)
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1.2,1.2)
  t.rotation=Math.PI/4; t.center.set(.5,.5); return t
}

function mkTile(): THREE.CanvasTexture {
  const S=256,T=32; const cv=document.createElement('canvas'); cv.width=cv.height=S
  const ctx=cv.getContext('2d')!; ctx.fillStyle='#c4ccd8'; ctx.fillRect(0,0,S,S)
  for(let r=0;r<S/T;r++) for(let c=0;c<S/T;c++){
    const v=(Math.sin(r*7+c*13)*8)|0
    ctx.fillStyle=`rgb(${194+v},${202+v},${214+v})`; ctx.fillRect(c*T+2,r*T+2,T-3,T-3)
  }
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1.5,1.5); return t
}

function mkConcrete(): THREE.CanvasTexture {
  const S=256,sl=64; const cv=document.createElement('canvas'); cv.width=cv.height=S
  const ctx=cv.getContext('2d')!; ctx.fillStyle='#888680'; ctx.fillRect(0,0,S,S)
  for(let i=0;i<2000;i++){
    const x=Math.random()*S,y=Math.random()*S,v=(Math.random()*18-9)|0
    ctx.fillStyle=`rgba(${v>0?255:0},${v>0?255:0},${v>0?255:0},${Math.abs(v)*.013})`
    ctx.fillRect(x,y,2,2)
  }
  ctx.strokeStyle='rgba(55,53,50,.25)'; ctx.lineWidth=1.5
  for(let x=sl;x<S;x+=sl){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,S);ctx.stroke()}
  for(let y=sl;y<S;y+=sl){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(S,y);ctx.stroke()}
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(2,2); return t
}

function mkHall(): THREE.CanvasTexture {
  const S=256,T=48; const cv=document.createElement('canvas'); cv.width=cv.height=S
  const ctx=cv.getContext('2d')!; ctx.fillStyle='#7a7068'; ctx.fillRect(0,0,S,S)
  for(let r=0;r<S/T;r++) for(let c=0;c<S/T;c++){
    const v=(Math.sin(r*5+c*9)*6)|0
    ctx.fillStyle=`rgb(${118+v},${110+v},${100+v})`; ctx.fillRect(c*T+1,r*T+1,T-2,T-2)
  }
  ctx.strokeStyle='rgba(50,40,30,.3)'; ctx.lineWidth=1
  for(let x=T;x<S;x+=T){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,S);ctx.stroke()}
  for(let y=T;y<S;y+=T){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(S,y);ctx.stroke()}
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1.5,1.5); return t
}

// ─── Floor plan data (NO walls in items — walls built separately) ──
interface FItem { rx:number;rz:number;w:number;h:number;d:number;col:number;cast?:boolean }
interface RoomDef { id:string;label:string;x:number;z:number;w:number;d:number;floorY:number;tex:TexKey;items:FItem[] }

const GROUND: RoomDef[] = [
  { id:'keuken',  label:'Keuken',  x:0,   z:0,   w:4.3, d:3.0, floorY:Y0, tex:'wood', items:[
    {rx:.15,rz:.12,w:3.6,h:.9, d:.58,col:FC.black,cast:true},
    {rx:.12,rz:.12,w:.58,h:.9, d:2.1, col:FC.black,cast:true},
    {rx:.15,rz:.12,w:3.6,h:.8, d:.32,col:0x111118},
    {rx:1.1, rz:1.15,w:1.8,h:.86,d:.9, col:FC.black,cast:true},
    {rx:1.05,rz:1.1, w:1.9,h:.06,d:1.0,col:FC.marble},
    {rx:1.8, rz:1.38,w:.7, h:.02,d:.5, col:0x222222},
  ]},
  { id:'eethoek', label:'Eethoek', x:4.7, z:0,   w:3.8, d:4.3, floorY:Y0, tex:'wood', items:[
    {rx:.7, rz:1.0, w:2.4,h:.75,d:1.2, col:FC.tableD,cast:true},
    {rx:.72,rz:1.02,w:2.36,h:.04,d:1.16,col:FC.tableL},
    {rx:.5, rz:.3,  w:.55,h:.8, d:.55,col:0xf0ede8,cast:true},
    {rx:1.2,rz:.3,  w:.55,h:.8, d:.55,col:0xf0ede8,cast:true},
    {rx:1.9,rz:.3,  w:.55,h:.8, d:.55,col:0xf0ede8,cast:true},
    {rx:.5, rz:2.55,w:.55,h:.8, d:.55,col:0xf0ede8,cast:true},
    {rx:1.2,rz:2.55,w:.55,h:.8, d:.55,col:0xf0ede8,cast:true},
    {rx:1.9,rz:2.55,w:.55,h:.8, d:.55,col:0xf0ede8,cast:true},
  ]},
  { id:'zithoek', label:'Zithoek', x:4.7, z:4.3, w:3.8, d:5.1, floorY:Y0, tex:'wood', items:[
    {rx:.22,rz:.65,w:2.85,h:.75,d:.95,col:FC.sofa,cast:true},
    {rx:.22,rz:.65,w:2.85,h:1.0, d:.12,col:FC.sofaB},
    {rx:.22,rz:.65,w:.12, h:.85,d:.95,col:FC.sofa},
    {rx:2.95,rz:.65,w:.12,h:.85,d:.95,col:FC.sofa},
    {rx:2.7, rz:.65,w:.9, h:.75,d:2.1, col:FC.sofa,cast:true},
    {rx:.7,  rz:2.0,w:1.4,h:.40,d:.75,col:FC.tableD,cast:true},
    {rx:.68, rz:1.98,w:1.44,h:.04,d:.79,col:FC.tableL},
    {rx:.15, rz:1.55,w:2.6,h:.01,d:1.9, col:FC.rug},
    {rx:.18, rz:4.72,w:3.2,h:.42,d:.38,col:FC.black,cast:true},
    {rx:.68, rz:4.6, w:2.2,h:1.25,d:.05,col:0x080810},
  ]},
  { id:'berging', label:'Berging', x:0,   z:3.0, w:3.8, d:2.5, floorY:Y0, tex:'hall', items:[
    {rx:.15,rz:.25,w:.65,h:.9,d:.65,col:FC.grey,cast:true},
    {rx:.9, rz:.25,w:.65,h:.9,d:.65,col:FC.grey,cast:true},
    {rx:2.0,rz:.1, w:1.6,h:2.2,d:.38,col:FC.darkgrey,cast:true},
  ]},
  { id:'garage',  label:'Garage',  x:0,   z:5.5, w:5.0, d:4.1, floorY:Y0, tex:'concrete', items:[
    {rx:.6, rz:.25,w:1.8,h:.55,d:4.0,col:FC.car,cast:true},
    {rx:.65,rz:.9, w:1.7,h:.38,d:2.0,col:FC.carR,cast:true},
    {rx:.45,rz:.5, w:.15,h:.35,d:.7, col:0x1a1a1a},
    {rx:2.4,rz:.5, w:.15,h:.35,d:.7, col:0x1a1a1a},
    {rx:.45,rz:2.85,w:.15,h:.35,d:.7,col:0x1a1a1a},
    {rx:2.4,rz:2.85,w:.15,h:.35,d:.7,col:0x1a1a1a},
  ]},
  { id:'inkom',   label:'Inkom',   x:3.8, z:7.8, w:1.8, d:1.8, floorY:Y0, tex:'tile',  items:[] },
  { id:'wc',      label:'WC',      x:5.6, z:8.2, w:1.4, d:1.0, floorY:Y0, tex:'tile',  items:[
    {rx:.08,rz:.08,w:.5, h:.42,d:.6, col:0xf0ede8,cast:true},
    {rx:.72,rz:.08,w:.55,h:.88,d:.42,col:0xf0ede8,cast:true},
  ]},
]

const FIRST: RoomDef[] = [
  { id:'badkamer',   label:'Badkamer',   x:0,   z:0,   w:2.6, d:3.6, floorY:Y1, tex:'tile', items:[
    {rx:.12,rz:.18,w:.9, h:.50,d:1.75,col:0xf5f2ee,cast:true},
    {rx:.12,rz:.18,w:.9, h:.04,d:1.75,col:0xe8e4dc},
    {rx:1.1, rz:.1, w:1.0,h:2.0, d:.04,col:FC.glass},
    {rx:.8,  rz:2.7,w:1.6,h:.85,d:.52, col:0xf0ede8,cast:true},
    {rx:.1,  rz:2.75,w:.5,h:.42,d:.62, col:0xf0ede8,cast:true},
  ]},
  { id:'dressing',   label:'Dressing',   x:2.6, z:0,   w:2.0, d:2.8, floorY:Y1, tex:'wood', items:[
    {rx:.08,rz:.1,  w:1.82,h:2.4,d:.58,col:FC.black,cast:true},
    {rx:.08,rz:.68, w:.04, h:2.4,d:.58,col:0x282830},
    {rx:.08,rz:1.28,w:.04, h:2.4,d:.58,col:0x282830},
  ]},
  { id:'slaapkamer', label:'Slaapkamer', x:4.6, z:0,   w:3.9, d:3.6, floorY:Y1, tex:'wood', items:[
    {rx:.65,rz:.28,w:2.0,h:.22,d:2.1, col:FC.bedFrame},
    {rx:.65,rz:.28,w:2.0,h:.50,d:2.1, col:FC.bedLinen,cast:true},
    {rx:.65,rz:.28,w:2.0,h:.14,d:2.1, col:FC.bedSheet},
    {rx:.65,rz:.25,w:2.0,h:1.1, d:.14,col:0x1e1830,cast:true},
    {rx:.22,rz:.3, w:.42,h:.52,d:.48, col:FC.tableD,cast:true},
    {rx:2.78,rz:.3,w:.42,h:.52,d:.48, col:FC.tableD,cast:true},
    {rx:.08,rz:2.85,w:2.5,h:2.4,d:.58,col:FC.black,cast:true},
    {rx:3.18,rz:.28,w:.6, h:.75,d:1.8, col:FC.tableD,cast:true},
    {rx:3.18,rz:1.0,w:.6, h:.45,d:.6,  col:FC.grey,cast:true},
  ]},
  { id:'bureau',     label:'Bureau',     x:0,   z:3.6, w:2.9, d:3.4, floorY:Y1, tex:'wood', items:[
    {rx:.15,rz:.15,w:2.0,h:.75,d:.75,col:FC.tableD,cast:true},
    {rx:.15,rz:.15,w:2.0,h:.04,d:.75,col:FC.tableL},
    {rx:.5, rz:.12,w:.55,h:.8, d:.05,col:0x08080e,cast:true},
    {rx:1.18,rz:.12,w:.55,h:.8,d:.05,col:0x08080e},
    {rx:.6, rz:1.0,w:.65,h:.48,d:.65,col:FC.black,cast:true},
    {rx:.08,rz:2.55,w:2.6,h:2.4,d:.38,col:FC.black,cast:true},
    {rx:.12,rz:2.6,w:.5,h:1.9,d:.3,col:FC.bkA},
    {rx:.72,rz:2.6,w:.5,h:1.9,d:.3,col:FC.bkB},
    {rx:1.32,rz:2.6,w:.5,h:1.9,d:.3,col:FC.bkC},
    {rx:1.92,rz:2.6,w:.5,h:1.9,d:.3,col:FC.bkD},
  ]},
  { id:'nachthal',   label:'Nachthal',   x:2.9, z:2.8, w:2.0, d:1.8, floorY:Y1, tex:'hall', items:[] },
]

// ─── Explicit wall segments ────────────────────────────────────
// Only draw walls that ACTUALLY EXIST as physical barriers
interface WallSeg { x:number;z:number;w:number;d:number;col:number }

function getWalls(floor:'ground'|'first'): WallSeg[] {
  if (floor==='ground') return [
    // Outer shell — 4 sides
    {x:4.25, z:-.11,  w:8.72, d:WT,   col:WALL_OUT}, // N
    {x:4.25, z:9.71,  w:8.72, d:WT,   col:WALL_OUT}, // S
    {x:-.11, z:4.8,   w:WT,   d:9.72, col:WALL_OUT}, // W
    {x:8.61, z:4.8,   w:WT,   d:9.72, col:WALL_OUT}, // E
    // Garage north wall (heavy)
    {x:2.5,  z:5.5,   w:5.1,  d:WT,   col:WALL_OUT},
    // Garage/berging east divider
    {x:3.9,  z:4.25,  w:WTI,  d:2.5,  col:WALL_IN},
    // Berging south wall
    {x:1.9,  z:5.5,   w:3.8,  d:WTI,  col:WALL_IN},
    // Keuken south wall (between keuken and berging)
    {x:1.9,  z:3.0,   w:3.8,  d:WTI,  col:WALL_IN},
    // Metal frame keuken/eethoek (thin dark pillar)
    {x:4.5,  z:1.5,   w:.08,  d:3.0,  col:0x1a1a20},
    // WC north wall
    {x:6.3,  z:8.2,   w:1.5,  d:WTI,  col:WALL_IN},
    // WC west wall
    {x:5.65, z:8.7,   w:WTI,  d:1.0,  col:WALL_IN},
    // Inkom south wall
    {x:4.7,  z:9.6,   w:1.8,  d:WTI,  col:WALL_IN},
    // Inkom/WC divider
    {x:5.65, z:8.7,   w:WTI,  d:.8,   col:WALL_IN},
  ]
  return [
    // Outer shell
    {x:4.25, z:-.11,  w:8.72, d:WT,   col:WALL_OUT},
    {x:4.25, z:9.71,  w:8.72, d:WT,   col:WALL_OUT},
    {x:-.11, z:4.8,   w:WT,   d:9.72, col:WALL_OUT},
    {x:8.61, z:4.8,   w:WT,   d:9.72, col:WALL_OUT},
    // Badkamer east wall
    {x:2.65, z:1.8,   w:WTI,  d:3.6,  col:WALL_IN},
    // Badkamer south wall
    {x:1.3,  z:3.65,  w:2.6,  d:WTI,  col:WALL_IN},
    // Dressing east wall
    {x:4.65, z:1.4,   w:WTI,  d:2.8,  col:WALL_IN},
    // Nachthal south wall
    {x:3.9,  z:4.65,  w:2.0,  d:WTI,  col:WALL_IN},
    // Bureau north wall (between nachthal and bureau)
    {x:1.45, z:3.6,   w:2.9,  d:WTI,  col:WALL_IN},
    // Bureau east wall
    {x:2.95, z:5.3,   w:WTI,  d:3.4,  col:WALL_IN},
  ]
}

// ─── Hue fixture positions ─────────────────────────────────────
const FIXTURES: Record<string,{x:number;y:number;z:number}> = {
  keuken:     {x:2.15, y:Y0+WH-.1, z:1.5},
  eethoek:    {x:6.3,  y:Y0+WH-.1, z:2.0},
  zithoek:    {x:6.3,  y:Y0+WH-.1, z:7.0},
  berging:    {x:1.9,  y:Y0+WH-.1, z:4.2},
  inkom:      {x:4.7,  y:Y0+WH-.1, z:8.7},
  garage:     {x:2.5,  y:Y0+WH-.1, z:7.5},
  slaapkamer: {x:6.5,  y:Y1+WH-.1, z:1.8},
  badkamer:   {x:1.3,  y:Y1+WH-.1, z:1.8},
  dressing:   {x:3.6,  y:Y1+WH-.1, z:1.4},
  bureau:     {x:1.4,  y:Y1+WH-.1, z:5.3},
  nachthal:   {x:3.9,  y:Y1+WH-.1, z:3.7},
}

// ─── Scene builder helpers ─────────────────────────────────────
function put(sc:THREE.Scene,geo:THREE.BufferGeometry,mat:THREE.Material,
             x:number,y:number,z:number,cast=false,recv=true): THREE.Mesh {
  const m=new THREE.Mesh(geo,mat)
  m.position.set(x,y,z); m.castShadow=cast; m.receiveShadow=recv
  sc.add(m); return m
}

function box(sc:THREE.Scene,w:number,h:number,d:number,col:number,
             x:number,y:number,z:number,cast=false): THREE.Mesh {
  return put(sc, new THREE.BoxGeometry(w,h,d),
    new THREE.MeshStandardMaterial({color:col,roughness:.85,metalness:.02}),
    x,y,z,cast)
}

function buildFloors(sc:THREE.Scene, rooms:RoomDef[], tex:Record<TexKey,THREE.Texture>) {
  for(const r of rooms){
    const cx=r.x+r.w/2, cz=r.z+r.d/2
    const f=put(sc, new THREE.BoxGeometry(r.w,FT,r.d),
      new THREE.MeshStandardMaterial({map:tex[r.tex],roughness:.9,metalness:0}),
      cx, r.floorY-FT/2, cz, false, true)
    f.userData={roomId:r.id}
    for(const it of r.items)
      put(sc, new THREE.BoxGeometry(it.w,it.h,it.d),
        new THREE.MeshStandardMaterial({color:it.col,roughness:.85,metalness:.02}),
        r.x+it.rx+it.w/2, r.floorY+it.h/2, r.z+it.rz+it.d/2,
        it.cast??false, true)
  }
}

function buildWallSegs(sc:THREE.Scene, segs:WallSeg[], floorY:number) {
  for(const s of segs){
    const mat=new THREE.MeshStandardMaterial({color:s.col,roughness:.9,metalness:.01})
    put(sc, new THREE.BoxGeometry(s.w,WH,s.d), mat,
      s.x, floorY+WH/2, s.z, false, true)
  }
}

function buildStairs(sc:THREE.Scene){
  const m=new THREE.MeshStandardMaterial({color:0x9a8870,roughness:.9,metalness:.0})
  const sX=4.15,sZ=7.3,sW=1.3,sD=.20,sH=.20,n=14
  for(let i=0;i<n;i++){
    const h=sH*(i+1)
    put(sc, new THREE.BoxGeometry(sW,h,sD), m, sX+sW/2, h/2, sZ-i*sD-sD/2, true, true)
  }
}

function buildGarden(sc:THREE.Scene, concreteTex:THREE.Texture){
  const m=new THREE.MeshStandardMaterial({map:concreteTex,roughness:.95,metalness:0})
  put(sc, new THREE.BoxGeometry(3.8,FT,8.0), m, -1.9, Y0-FT/2, 4.0, false, true)
  const lm=new THREE.MeshStandardMaterial({color:0x3a3a42,roughness:.9,metalness:.05})
  put(sc, new THREE.BoxGeometry(3.8,.25,.15), lm, -1.9,.125,.075)
  put(sc, new THREE.BoxGeometry(3.8,.25,.15), lm, -1.9,.125,7.925)
  put(sc, new THREE.BoxGeometry(.15,.25,8.0), lm, -3.725,.125,4.0)
}

// ─── Component ─────────────────────────────────────────────────
interface Props { initialLights: HueLightsMap }
type Floor = 'ground'|'first'

export default function HomeScene({ initialLights }: Props) {
  const mountRef   = useRef<HTMLDivElement>(null)
  const camRef     = useRef<THREE.OrthographicCamera|null>(null)
  const composerRef= useRef<EffectComposer|null>(null)
  const rafRef     = useRef<number>(0)
  const plightsRef = useRef<Map<string,THREE.PointLight>>(new Map())

  const [floor,    setFloor]    = useState<Floor>('ground')
  const [lights,   setLights]   = useState<HueLightsMap>(initialLights)
  const [loading,  setLoading]  = useState(false)
  const [toggling, setToggling] = useState<string|null>(null)
  const [error,    setError]    = useState<string|null>(null)

  const refresh = useCallback(async()=>{
    try{ setLoading(true); setLights(await fetchLights()); setError(null) }
    catch{ setError('Bridge unreachable') } finally{ setLoading(false) }
  },[])

  const handleToggle = useCallback(async(light:HueLight)=>{
    setToggling(light.id)
    try{
      await toggleLight(light.id,light.state.on)
      setLights(prev=>({...prev,[light.id]:{...prev[light.id],state:{...prev[light.id].state,on:!light.state.on}}}))
    } finally{ setToggling(null) }
  },[])

  // Sync Hue state → point light intensities
  useEffect(()=>{
    for(const l of Object.values(lights)){
      const pl=plightsRef.current.get(inferRoom(l.name)??'')
      if(!pl) continue
      if(l.state.on && l.state.reachable!==false){
        const bri=l.state.bri??200
        pl.intensity=(bri/254)*5.0
        pl.color.set(l.state.colormode==='xy'&&l.state.xy ? xyBriToHex(l.state.xy,bri) : WARM_WHITE_HEX)
      } else { pl.intensity=0 }
    }
  },[lights])

  useEffect(()=>{
    const mount=mountRef.current; if(!mount) return

    // ── Textures ──────────────────────────────────────────────
    const tex:Record<TexKey,THREE.Texture>={
      wood: mkHerringbone(), tile: mkTile(), concrete: mkConcrete(), hall: mkHall()
    }

    // ── Renderer ──────────────────────────────────────────────
    const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'})
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2))
    renderer.setClearColor(BG,1)
    renderer.shadowMap.enabled=true
    renderer.shadowMap.type=THREE.PCFSoftShadowMap
    renderer.toneMapping=THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure=1.2
    renderer.outputColorSpace=THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    // ── Camera ────────────────────────────────────────────────
    const zoom=9, asp=mount.clientWidth/mount.clientHeight
    const cam=new THREE.OrthographicCamera(-zoom*asp,zoom*asp,zoom,-zoom,.1,200)
    cam.position.set(18,18,18); cam.lookAt(4.25,1.4,4.8)
    camRef.current=cam

    // ── OrbitControls ─────────────────────────────────────────
    const controls=new OrbitControls(cam,renderer.domElement)
    controls.target.set(4.25,1.4,4.8)
    controls.enableDamping=true; controls.dampingFactor=0.08
    controls.minDistance=3; controls.maxDistance=45
    controls.maxPolarAngle=Math.PI/2.05
    controls.update()

    // ── Scene ─────────────────────────────────────────────────
    const scene=new THREE.Scene()
    scene.background=new THREE.Color(BG)
    scene.fog=new THREE.FogExp2(BG,.018)

    // Base ambient (cool night fill)
    scene.add(new THREE.AmbientLight(0x3a4a6a,1.8))

    // Primary directional — warm from top-right
    const sun=new THREE.DirectionalLight(0xfff0e0,2.2)
    sun.position.set(14,22,10); sun.castShadow=true
    sun.shadow.mapSize.set(2048,2048)
    sun.shadow.camera.near=.5; sun.shadow.camera.far=65
    sun.shadow.camera.left=sun.shadow.camera.bottom=-16
    sun.shadow.camera.right=sun.shadow.camera.top=16
    sun.shadow.bias=-.0006
    scene.add(sun)

    // Soft cool fill from opposite
    const fill=new THREE.DirectionalLight(0x8090c0,.4)
    fill.position.set(-8,10,-6); scene.add(fill)

    // Ground plane
    const gp=new THREE.Mesh(
      new THREE.PlaneGeometry(80,80),
      new THREE.MeshStandardMaterial({color:0x181820,roughness:1,metalness:0})
    )
    gp.rotation.x=-Math.PI/2; gp.position.set(4.25,-.04,4.8)
    gp.receiveShadow=true; scene.add(gp)

    // ── Build scene ───────────────────────────────────────────
    const rooms=floor==='ground' ? GROUND : FIRST
    buildFloors(scene, rooms, tex)
    buildWallSegs(scene, getWalls(floor), floor==='ground' ? Y0 : Y1)
    if(floor==='ground'){ buildStairs(scene); buildGarden(scene,tex.concrete) }

    // ── Hue fixtures: EMISSIVE spheres (triggers bloom) ───────
    const pls=new Map<string,THREE.PointLight>()
    for(const [roomId,pos] of Object.entries(FIXTURES)){
      const onFirst=pos.y>Y1
      if(floor==='ground'&&onFirst) continue
      if(floor==='first'&&!onFirst) continue

      // Emissive fixture sphere — this is what bloom reacts to
      const fixMat=new THREE.MeshStandardMaterial({
        color:0xfff0cc, emissive:0xffd080, emissiveIntensity:2.0,
        roughness:.2, metalness:.1,
      })
      const fix=new THREE.Mesh(new THREE.SphereGeometry(.09,10,10), fixMat)
      fix.position.set(pos.x,pos.y,pos.z); scene.add(fix)

      // Point light (warm, strong)
      const pl=new THREE.PointLight(0xffd49a,0,10,1.4)
      pl.position.set(pos.x,pos.y-.3,pos.z); scene.add(pl)
      pls.set(roomId,pl)
    }
    plightsRef.current=pls

    // Hydrate initial Hue state
    for(const l of Object.values(lights)){
      const pl=pls.get(inferRoom(l.name)??'')
      if(!pl||!l.state.on||l.state.reachable===false) continue
      const bri=l.state.bri??200; pl.intensity=(bri/254)*5.0
      if(l.state.colormode==='xy'&&l.state.xy) pl.color.set(xyBriToHex(l.state.xy,bri))
    }

    // ── Post-processing: UnrealBloom ──────────────────────────
    const composer=new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene,cam))
    const bloom=new UnrealBloomPass(
      new THREE.Vector2(mount.clientWidth, mount.clientHeight),
      0.6,   // strength — warm glow on fixtures
      0.5,   // radius
      0.75   // threshold — only bright emissive objects bloom
    )
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
    composerRef.current=composer

    // ── Resize ────────────────────────────────────────────────
    const resize=()=>{
      const w=mount.clientWidth, h=mount.clientHeight
      renderer.setSize(w,h); composer.setSize(w,h)
      const a2=w/h, z2=9
      if(camRef.current){
        Object.assign(camRef.current,{left:-z2*a2,right:z2*a2,top:z2,bottom:-z2})
        camRef.current.updateProjectionMatrix()
      }
    }
    const ro=new ResizeObserver(resize); ro.observe(mount)

    // ── Animate ───────────────────────────────────────────────
    const animate=()=>{
      rafRef.current=requestAnimationFrame(animate)
      controls.update()
      composer.render()   // use composer instead of renderer.render
    }
    animate(); resize()

    return ()=>{
      cancelAnimationFrame(rafRef.current)
      controls.dispose(); ro.disconnect(); renderer.dispose()
      Object.values(tex).forEach(t=>t.dispose())
      if(mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[floor])

  const lightHex=(l:HueLight)=>{
    if(!l.state.on) return '#1a1f2e'
    if(l.state.colormode==='xy'&&l.state.xy) return xyBriToHex(l.state.xy,l.state.bri??200)
    return WARM_WHITE_HEX
  }

  const ll=Object.values(lights)
  const gl=ll.filter(l=>{ const r=inferRoom(l.name); return r?GROUND.some(g=>g.id===r):true })
  const fl=ll.filter(l=>{ const r=inferRoom(l.name); return r?FIRST.some(f=>f.id===r):false })
  const active=floor==='ground'?gl:fl
  const unassigned=ll.filter(l=>!inferRoom(l.name))

  return (
    <div style={{position:'fixed',inset:0,background:'var(--bg)',display:'flex',flexDirection:'column',fontFamily:'var(--font-body)',color:'var(--ink)'}}>
      {/* Topbar */}
      <div className="glass" style={{height:72,padding:'0 30px',display:'flex',alignItems:'center',gap:16,borderBottom:'1px solid var(--edge)',flexShrink:0}}>
        <a href="/portal" style={{color:'var(--ink-3)',textDecoration:'none',fontSize:12,fontFamily:'var(--font-mono)',letterSpacing:'.1em'}}>← Portal</a>
        <div className="brand" style={{marginLeft:8}}>
          <div className="brand__mark"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L14 6v4L8 14 2 10V6L8 2z" fill="currentColor"/></svg></div>
          <span className="brand__name">Ghostlink</span><span className="brand__dot">.home</span>
        </div>
        <span style={{fontSize:10,color:'var(--ink-3)',fontFamily:'var(--font-mono)',letterSpacing:'.08em',marginLeft:8}}>Drag = roteren · Scroll = zoom</span>
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          {(['ground','first'] as Floor[]).map(f=>(
            <button key={f} onClick={()=>setFloor(f)} style={{padding:'7px 16px',borderRadius:'var(--r-pill)',border:`1px solid ${floor===f?'var(--edge-strong)':'var(--edge)'}`,background:floor===f?'rgba(150,190,255,.12)':'transparent',color:floor===f?'var(--ice)':'var(--ink-3)',fontFamily:'var(--font-mono)',fontSize:11,cursor:'pointer',letterSpacing:'.1em',textTransform:'uppercase'}}>
              {f==='ground'?'Gelijkvloers':'Verdieping'}
            </button>
          ))}
        </div>
        <button onClick={refresh} disabled={loading} style={{padding:'7px 14px',borderRadius:'var(--r-pill)',border:'1px solid var(--edge)',background:'transparent',color:'var(--ink-3)',fontSize:11,fontFamily:'var(--font-mono)',cursor:'pointer',letterSpacing:'.1em',opacity:loading?.5:1}}>
          {loading?'···':'⟳ SYNC'}
        </button>
      </div>

      <div style={{flex:1,display:'flex',overflow:'hidden'}}>
        <div ref={mountRef} style={{flex:1,position:'relative'}}/>

        {/* Light panel */}
        <div className="glass" style={{width:272,display:'flex',flexDirection:'column',borderLeft:'1px solid var(--edge)',overflow:'hidden'}}>
          <div style={{padding:'18px 20px 12px',borderBottom:'1px solid var(--edge)'}}>
            <div className="eyebrow" style={{marginBottom:4}}>Philips Hue</div>
            <div style={{fontSize:13,color:'var(--ink-2)'}}>{ll.length?`${ll.filter(l=>l.state.on).length} / ${ll.length} aan`:'Geen verbinding'}</div>
          </div>
          {error&&<div style={{margin:'12px 16px',padding:'10px 14px',borderRadius:'var(--r-sm)',background:'rgba(255,50,50,.08)',border:'1px solid rgba(255,50,50,.2)',fontSize:12,color:'#ff8080'}}>{error} — relay actief?</div>}
          <div style={{flex:1,overflowY:'auto',padding:'12px 0'}}>
            {active.length===0&&ll.length===0&&<div style={{padding:'20px',fontSize:12,color:'var(--ink-3)',lineHeight:1.6}}>Configureer <code>HUE_RELAY_URL</code> in Vercel en start de Synology container.</div>}
            {active.map(l=>{
              const bri=briToPercent(l.state.bri??0),col=lightHex(l),room=inferRoom(l.name)
              return (
                <div key={l.id} style={{padding:'10px 20px',display:'flex',flexDirection:'column',gap:6,borderBottom:'1px solid rgba(160,195,255,.06)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:10,height:10,borderRadius:'50%',flexShrink:0,background:l.state.on?col:'#1a1f2e',boxShadow:l.state.on?`0 0 8px ${col}`:'none',border:'1px solid rgba(160,195,255,.2)'}}/>
                    <span style={{flex:1,fontSize:13,fontWeight:500,color:l.state.on?'var(--ink)':'var(--ink-3)'}}>{l.name}</span>
                    <button disabled={toggling===l.id} onClick={()=>handleToggle(l)} style={{width:38,height:22,borderRadius:11,border:'none',cursor:'pointer',background:l.state.on?'rgba(150,190,255,.35)':'rgba(160,195,255,.08)',position:'relative',transition:'background .2s',flexShrink:0,opacity:toggling===l.id?.5:1}}>
                      <div style={{position:'absolute',top:3,left:l.state.on?19:3,width:16,height:16,borderRadius:'50%',background:l.state.on?'var(--ice)':'var(--ink-3)',transition:'left .2s, background .2s',boxShadow:l.state.on?'0 0 8px var(--glow)':'none'}}/>
                    </button>
                  </div>
                  {l.state.on&&<input type="range" min={1} max={100} value={bri} onChange={async e=>{ const p=Number(e.target.value); await setBrightness(l.id,p); setLights(prev=>({...prev,[l.id]:{...prev[l.id],state:{...prev[l.id].state,bri:Math.round(p/100*254)}}})) }} style={{width:'100%',accentColor:'var(--accent)',cursor:'pointer',height:3}}/>}
                  {room&&<span style={{fontSize:10,color:'var(--ink-3)',fontFamily:'var(--font-mono)',letterSpacing:'.1em',textTransform:'uppercase'}}>{room}</span>}
                </div>
              )
            })}
            {unassigned.length>0&&<>
              <div style={{padding:'10px 20px 4px',fontSize:10,color:'var(--ink-3)',fontFamily:'var(--font-mono)',letterSpacing:'.12em',textTransform:'uppercase'}}>Niet toegewezen</div>
              {unassigned.map(l=>(
                <div key={l.id} style={{padding:'10px 20px',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid rgba(160,195,255,.06)',opacity:.7}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:l.state.on?WARM_WHITE_HEX:'#1a1f2e',border:'1px solid rgba(160,195,255,.2)'}}/>
                  <span style={{flex:1,fontSize:12,color:'var(--ink-3)'}}>{l.name}</span>
                  <button disabled={toggling===l.id} onClick={()=>handleToggle(l)} style={{fontSize:11,padding:'4px 10px',borderRadius:'var(--r-pill)',border:'1px solid var(--edge)',background:'transparent',color:'var(--ink-3)',cursor:'pointer'}}>{l.state.on?'Uit':'Aan'}</button>
                </div>
              ))}
            </>}
          </div>
          <div style={{padding:'12px 20px',borderTop:'1px solid var(--edge)',fontSize:10,color:'var(--ink-3)',fontFamily:'var(--font-mono)',lineHeight:1.6}}>"Keuken 1" → keuken · "Slaapkamer" → slaapkamer</div>
        </div>
      </div>
    </div>
  )
}
