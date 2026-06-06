import { NextRequest, NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────
//  /api/hue/[...path]
//  Proxies all Hue calls to the Synology relay container.
//  Env vars required:
//    HUE_RELAY_URL    – e.g. http://yourddns.synology.me:3721
//    HUE_RELAY_SECRET – shared secret, must match relay's RELAY_SECRET
// ─────────────────────────────────────────────────────────────

const RELAY_URL    = process.env.HUE_RELAY_URL
const RELAY_SECRET = process.env.HUE_RELAY_SECRET ?? ''

async function proxyToRelay(
  method: string,
  pathParts: string[],
  req: NextRequest,
): Promise<NextResponse> {
  if (!RELAY_URL) {
    return NextResponse.json(
      { error: 'HUE_RELAY_URL is not configured' },
      { status: 503 },
    )
  }

  const path = pathParts.join('/')
  const url  = `${RELAY_URL}/hue/${path}`

  const headers: HeadersInit = {
    'Content-Type':    'application/json',
    'x-relay-secret':  RELAY_SECRET,
  }

  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    body = await req.text()
  }

  try {
    const upstream = await fetch(url, { method, headers, body })
    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (err) {
    console.error('[hue-proxy] upstream error:', err)
    return NextResponse.json(
      { error: 'Relay unreachable', detail: String(err) },
      { status: 502 },
    )
  }
}

type RouteContext = { params: { path: string[] } }

export async function GET(req: NextRequest, { params }: RouteContext) {
  return proxyToRelay('GET', params.path, req)
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  return proxyToRelay('PUT', params.path, req)
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  return proxyToRelay('POST', params.path, req)
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  return proxyToRelay('DELETE', params.path, req)
}
