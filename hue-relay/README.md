# GhostLink – Hue Relay

A tiny Express.js container that bridges `ghostlink.one` (Vercel) to your local Philips Hue Bridge.

## How it works

```
ghost.one (Vercel) → /api/hue/* → HUE_RELAY_URL → Synology:3721 → Hue Bridge
```

## Setup

### 1. Get your Hue API key

Open a browser on your LAN and go to:  
`http://<bridge-ip>/debug/clip.html`

Post to `/api` with body `{"devicetype":"ghostlink#home"}` while pressing the Bridge link button.  
Copy the `username` from the response — this is your `HUE_API_KEY`.

### 2. Configure docker-compose.yml

Edit `docker-compose.yml` and fill in:
- `HUE_BRIDGE_IP` — the bridge's local IP (check your router's DHCP leases)
- `HUE_API_KEY` — the username from step 1
- `RELAY_SECRET` — any strong random string

### 3. Deploy to Synology

**Via Container Manager (GUI):**
1. Copy the `hue-relay/` folder to your Synology (e.g. `/volume1/docker/hue-relay/`)
2. Open Container Manager → Project → Create
3. Point to the folder and let it build

**Via SSH:**
```bash
cd /volume1/docker/hue-relay
docker compose up -d --build
```

### 4. Forward port 3721

In your router: forward TCP 3721 → Synology LAN IP.

### 5. Add Vercel environment variables

```
HUE_RELAY_URL    = http://yourddns.synology.me:3721
HUE_RELAY_SECRET = (same secret as in docker-compose.yml)
```

### 6. Verify

```bash
curl -H "x-relay-secret: YOUR_SECRET" http://localhost:3721/health
curl -H "x-relay-secret: YOUR_SECRET" http://localhost:3721/hue/lights
```
