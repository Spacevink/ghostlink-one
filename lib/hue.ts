// ─────────────────────────────────────────────────────────────
//  Philips Hue – types & client helpers
//  All API calls go through /api/hue/* (Next.js proxy → Synology relay → Bridge)
// ─────────────────────────────────────────────────────────────

export interface HueLightState {
  on: boolean
  bri: number        // 0-254
  hue?: number       // 0-65535
  sat?: number       // 0-254
  ct?: number        // colour temp in mireds (153-500)
  xy?: [number, number]
  colormode?: 'hs' | 'xy' | 'ct'
  reachable?: boolean
  alert?: string
  effect?: string
}

export interface HueLight {
  id: string         // added by us from the map key
  name: string
  type: string
  modelid?: string
  manufacturername?: string
  state: HueLightState
}

export type HueLightsMap = Record<string, HueLight>

// ─── Room → light name keywords mapping ───────────────────────
// We infer which room a light belongs to from its Hue name.
// Adjust these keywords to match your actual bulb names.
export const ROOM_KEYWORDS: Record<string, string[]> = {
  keuken:     ['keuken', 'kitchen', 'aanrecht', 'kookeiland'],
  eethoek:    ['eethoek', 'eettafel', 'eetkamer', 'dining'],
  zithoek:    ['zithoek', 'woonkamer', 'living', 'salon', 'tv'],
  berging:    ['berging', 'laadkast'],
  inkom:      ['inkom', 'ingang', 'entrance', 'hal', 'gang'],
  garage:     ['garage'],
  slaapkamer: ['slaapkamer', 'bedroom', 'master'],
  badkamer:   ['badkamer', 'bathroom', 'douche'],
  dressing:   ['dressing', 'kleedkamer'],
  nachthal:   ['nachthal', 'overloop', 'landing'],
  bureau:     ['bureau', 'office', 'werkkamer'],
}

export function inferRoom(lightName: string): string | null {
  const lower = lightName.toLowerCase()
  for (const [room, keywords] of Object.entries(ROOM_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return room
  }
  return null
}

// ─── API helpers (client-side → /api/hue proxy) ───────────────

export async function fetchLights(): Promise<HueLightsMap> {
  const res = await fetch('/api/hue/lights', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Hue fetch failed: ${res.status}`)
  const raw = await res.json()
  const result: HueLightsMap = {}
  for (const [id, light] of Object.entries(raw as Record<string, Omit<HueLight, 'id'>>)) {
    result[id] = { ...light, id }
  }
  return result
}

export async function setLightState(
  id: string,
  state: Partial<HueLightState>,
): Promise<void> {
  await fetch(`/api/hue/lights/${id}/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })
}

export async function toggleLight(id: string, currentOn: boolean): Promise<void> {
  await setLightState(id, { on: !currentOn })
}

export async function setBrightness(id: string, pct: number): Promise<void> {
  await setLightState(id, { bri: Math.round((pct / 100) * 254) })
}

export function briToPercent(bri: number): number {
  return Math.round((bri / 254) * 100)
}

export function ctToKelvin(ct: number): number {
  return Math.round(1_000_000 / ct)
}

export function xyBriToHex(xy: [number, number], bri: number): string {
  const [x, y] = xy
  const z = 1 - x - y
  const Y = bri / 254
  const X = (Y / y) * x
  const Z = (Y / y) * z
  let r =  X * 1.656492 - Y * 0.354851 - Z * 0.255038
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152
  let b =  X * 0.051713 - Y * 0.121364 + Z * 1.011530
  const gamma = (v: number) =>
    v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  const clamp = (v: number) => Math.max(0, Math.min(1, v))
  r = clamp(gamma(r)); g = clamp(gamma(g)); b = clamp(gamma(b))
  const hex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

export const WARM_WHITE_HEX = '#ffd9a0'
