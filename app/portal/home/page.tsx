import HomeScene from './HomeScene'
import type { HueLightsMap } from '../../../lib/hue'

// ─────────────────────────────────────────────────────────────
//  /portal/home  –  server component
//  Fetches light state at request time; passes to client scene.
//  Falls back to empty map when relay is unreachable.
// ─────────────────────────────────────────────────────────────

async function getInitialLights(): Promise<HueLightsMap> {
  const relay = process.env.HUE_RELAY_URL
  const secret = process.env.HUE_RELAY_SECRET ?? ''
  if (!relay) return {}

  try {
    const res = await fetch(`${relay}/hue/lights`, {
      headers: { 'x-relay-secret': secret },
      next: { revalidate: 0 },
    })
    if (!res.ok) return {}
    const raw = await res.json() as Record<string, object>
    const result: HueLightsMap = {}
    for (const [id, light] of Object.entries(raw)) {
      result[id] = { ...(light as any), id }
    }
    return result
  } catch {
    return {}
  }
}

export default async function HomePage() {
  const initialLights = await getInitialLights()
  return <HomeScene initialLights={initialLights} />
}
