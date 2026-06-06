/**
 * GhostLink – Hue Relay
 * Runs on Synology NAS (Docker), proxies ghostlink.one → local Hue Bridge.
 *
 * Env vars:
 *   HUE_BRIDGE_IP   – local IP of your Hue Bridge (e.g. 192.168.1.10)
 *   HUE_API_KEY     – Hue Bridge API username/key
 *   RELAY_SECRET    – shared secret (must match Vercel HUE_RELAY_SECRET)
 *   PORT            – listen port (default 3721)
 */

const express = require('express')
const app = express()
app.use(express.json())

const BRIDGE_IP    = process.env.HUE_BRIDGE_IP
const HUE_API_KEY  = process.env.HUE_API_KEY
const RELAY_SECRET = process.env.RELAY_SECRET
const PORT         = process.env.PORT || 3721

if (!BRIDGE_IP || !HUE_API_KEY || !RELAY_SECRET) {
  console.error('Missing required env vars: HUE_BRIDGE_IP, HUE_API_KEY, RELAY_SECRET')
  process.exit(1)
}

// ── Auth middleware ─────────────────────────────────────────
app.use((req, res, next) => {
  if (req.headers['x-relay-secret'] !== RELAY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
})

// ── Health check (no auth) ──────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, bridge: BRIDGE_IP }))

// ── Hue Bridge proxy ────────────────────────────────────────
app.all('/hue/*', async (req, res) => {
  const huePath = req.path.replace(/^\/hue\//, '')
  const url = `http://${BRIDGE_IP}/api/${HUE_API_KEY}/${huePath}`

  const opts = {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    opts.body = JSON.stringify(req.body)
  }

  try {
    const upstream = await fetch(url, opts)
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch (err) {
    console.error('[relay] bridge error:', err)
    res.status(502).json({ error: 'Bridge unreachable', detail: String(err) })
  }
})

app.listen(PORT, () => {
  console.log(`[relay] Hue relay running on :${PORT}`)
  console.log(`[relay] Bridging to Hue Bridge @ ${BRIDGE_IP}`)
})
