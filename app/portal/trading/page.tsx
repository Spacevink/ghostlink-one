'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import {
  AreaChart, Area, Line, LineChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

const trading = createClient(
  process.env.NEXT_PUBLIC_TRADING_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_TRADING_SUPABASE_ANON_KEY!
)

const PAPER_START = 100000

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

const pnlColor = (n: number | null | undefined) =>
  n == null ? 'var(--ink-3)' : n >= 0 ? '#22c55e' : '#ef4444'

// Format Y-axis ticks as $XXXk with 1 decimal only when needed to avoid duplicates
const fmtK = (v: number) => {
  const k1 = (v / 1000).toFixed(1)
  return `$${k1.endsWith('.0') ? (v / 1000).toFixed(0) : k1}k`
}

const REGIME_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  mean_reverting:  { label: 'Mean Reverting',  color: '#22c55e', bg: 'rgba(34,197,94,.1)'  },
  trending:        { label: 'Trending',        color: '#f59e0b', bg: 'rgba(245,158,11,.1)' },
  high_volatility: { label: 'High Volatility', color: '#ef4444', bg: 'rgba(239,68,68,.1)'  },
  initialising:    { label: 'Initialising',    color: 'var(--ink-3)', bg: 'rgba(255,255,255,.04)' },
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function getLS(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const v = localStorage.getItem(key)
  return v === null ? fallback : v === 'true'
}

function ScalpEquityChart({ snapshots }: { snapshots: any[] }) {
  if (!snapshots.length) return (
    <div style={{ height: 110, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
      No scalp equity data yet
    </div>
  )
  const base = Number(snapshots[0]?.sleeve_equity ?? 25000)
  const data = snapshots.map((s: any, i: number) => ({ i, equity: Number(s.sleeve_equity) }))
  return (
    <ResponsiveContainer width="100%" height={110}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="scalpGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(160,195,255,.06)" />
        <XAxis dataKey="i" hide />
        <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 10 }} axisLine={false} tickLine={false}
          tickFormatter={fmtK} domain={['auto', 'auto']} width={52} />
        <ReferenceLine y={base} stroke="rgba(160,195,255,.15)" strokeDasharray="4 2" />
        <Tooltip formatter={(v: any) => [`$${fmt(v)}`, 'Sleeve equity']} labelFormatter={() => ''} />
        <Area type="monotone" dataKey="equity" stroke="#22c55e" strokeWidth={1.8} fill="url(#scalpGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default function TradingPage() {
  const router = useRouter()
  const [snapshots,      setSnapshots]      = useState<any[]>([])
  // NOTE: `positions` table is never written by the engine (upsert_position is not called).
  // Open stat arb trades are derived from `trades` where closed_at IS NULL (see openStatArbTrades below).
  const [trades,         setTrades]         = useState<any[]>([])
  const [regime,         setRegime]         = useState({ label: 'initialising', confidence: null as number | null })
  const [heartbeat,      setHeartbeat]      = useState<any>(null)
  const [circuitBreaker, setCircuitBreaker] = useState(false)
  const [lastUpdated,    setLastUpdated]    = useState<Date | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [scanActivity,   setScanActivity]   = useState<any[]>([])
  const [shadowTrades,   setShadowTrades]   = useState<any[]>([])
  const [regimeHistory,  setRegimeHistory]  = useState<any[]>([])
  const [scalpSnaps,     setScalpSnaps]     = useState<any[]>([])
  const [scalpPositions, setScalpPositions] = useState<any[]>([])
  const [scalpTrades,    setScalpTrades]    = useState<any[]>([])

  // Toggle state — persisted in localStorage
  const [statarbOpen, setStatarbOpen] = useState<boolean>(() => getLS('gl-statarb-open', true))
  const [scalpOpen,   setScalpOpen]   = useState<boolean>(() => getLS('gl-scalp-open',   true))

  useEffect(() => { localStorage.setItem('gl-statarb-open', String(statarbOpen)) }, [statarbOpen])
  useEffect(() => { localStorage.setItem('gl-scalp-open',   String(scalpOpen))   }, [scalpOpen])

  const refresh = useCallback(async () => {
    const [s, t, rh, hb, sa, sh, ssn, spo, stc] = await Promise.all([
      trading.from('portfolio_snapshots').select('*').order('created_at', { ascending: true }).limit(60),
      // trades table is the source of truth for stat arb entries (positions table is never populated)
      trading.from('trades').select('*').order('created_at', { ascending: false }).limit(60),
      trading.from('regime_history').select('*').order('created_at', { ascending: false }).limit(60),
      trading.from('heartbeats').select('*').order('created_at', { ascending: false }).limit(1),
      trading.from('scan_activity').select('*').order('created_at', { ascending: false }).limit(10),
      trading.from('shadow_trades').select('*').order('created_at', { ascending: false }).limit(10),
      trading.from('scalp_equity_snapshots').select('*').order('created_at', { ascending: true }).limit(120),
      trading.from('scalp_trades').select('*').eq('status', 'open').order('created_at', { ascending: false }),
      trading.from('scalp_trades').select('*').eq('status', 'closed').order('closed_at', { ascending: false }).limit(20),
    ])
    if (s.data)  setSnapshots(s.data)
    if (t.data)  setTrades(t.data)
    if (rh.data?.length) {
      setRegime({ label: rh.data[0].regime_label, confidence: rh.data[0].confidence })
      setRegimeHistory([...rh.data].reverse())
    }
    if (hb.data?.length) { setHeartbeat(hb.data[0]); setCircuitBreaker(hb.data[0].circuit_breaker) }
    if (sa.data)  setScanActivity(sa.data)
    if (sh.data)  setShadowTrades(sh.data)
    if (ssn.data) setScalpSnaps(ssn.data)
    if (spo.data) setScalpPositions(spo.data)
    if (stc.data) setScalpTrades(stc.data)
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const ch = trading.channel('trading-dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portfolio_snapshots' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'regime_history' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'heartbeats' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scan_activity' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shadow_trades' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scalp_trades' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scalp_equity_snapshots' }, refresh)
      .subscribe()
    const poll = setInterval(refresh, 30000)
    return () => { trading.removeChannel(ch); clearInterval(poll) }
  }, [refresh])

  // ── Derived values ──────────────────────────────────────────────────────────
  const latest      = snapshots.at(-1)
  const portValue   = heartbeat?.equity ?? latest?.portfolio_value ?? null
  const totalPnl    = portValue != null ? Math.round((portValue - PAPER_START) * 100) / 100 : null
  const totalPnlPct = portValue != null ? Math.round((portValue - PAPER_START) / PAPER_START * 10000) / 100 : null
  const todayPnl    = heartbeat?.today_pnl    ?? null
  const todayPnlPct = heartbeat?.today_pnl_pct ?? null
  const hbUpdatedAt = heartbeat?.created_at ? new Date(heartbeat.created_at) : null

  // Open stat arb trades: engine writes to `trades` (not `positions`).
  // An open trade has no closed_at and no pnl yet.
  const openStatArbTrades = trades.filter((t: any) => !t.closed_at && t.pnl == null)
  const closedStatArbTrades = trades.filter((t: any) => t.status === 'closed' && t.pnl != null)

  const winRate = closedStatArbTrades.length
    ? (closedStatArbTrades.filter((t: any) => t.pnl > 0).length / closedStatArbTrades.length) * 100
    : null

  const cfg     = REGIME_CONFIG[regime.label] ?? REGIME_CONFIG.initialising
  const hbAge   = heartbeat ? Math.floor((Date.now() - new Date(heartbeat.created_at).getTime()) / 60000) : null

  const engineState: 'ok' | 'stale' | 'down' =
    !heartbeat || heartbeat.status !== 'ok' || hbAge === null ? 'down'
    : hbAge < 120  ? 'ok'
    : hbAge < 1440 ? 'stale'
    : 'down'
  const engineDotColor = engineState === 'ok' ? '#22c55e' : engineState === 'stale' ? '#f59e0b' : '#ef4444'

  const spyStart = snapshots.find(s => s.spy_close != null)?.spy_close ?? null

  const dailySnapshots = Object.values(
    snapshots.reduce((acc: Record<string, any>, s) => {
      const key = String(s.created_at).slice(0, 10)
      if (!acc[key] || new Date(s.created_at) > new Date(acc[key].created_at)) acc[key] = s
      return acc
    }, {} as Record<string, any>)
  ).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const chartData = dailySnapshots.map((s: any) => ({
    date:      new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    bot:       Number(s.portfolio_value),
    benchmark: spyStart && s.spy_close ? Math.round(PAPER_START * Number(s.spy_close) / spyStart) : null,
    pnl:       Number(s.total_pnl),
  }))

  const latestScanAt = scanActivity[0]?.created_at ?? null

  const regimeSpans = (() => {
    if (!regimeHistory.length) return []
    const spans: { label: string; color: string; start: Date; end: Date; confidence: number; pct?: number }[] = []
    for (const r of regimeHistory) {
      const start = new Date(r.created_at)
      const last = spans[spans.length - 1]
      if (last && last.label === r.regime_label) { last.end = start }
      else {
        const c = REGIME_CONFIG[r.regime_label] ?? REGIME_CONFIG.initialising
        spans.push({ label: r.regime_label, color: c.color, start, end: start, confidence: Number(r.confidence) })
      }
    }
    spans[spans.length - 1].end = new Date()
    const totalMs = spans.reduce((sum, sp) => sum + Math.max(sp.end.getTime() - sp.start.getTime(), 30 * 60 * 1000), 0)
    return spans.map(sp => ({ ...sp, pct: Math.max(2, ((Math.max(sp.end.getTime() - sp.start.getTime(), 30 * 60 * 1000)) / totalMs) * 100) }))
  })()
  const timelineStart = regimeHistory[0]?.created_at ?? null

  const latestScalp   = scalpSnaps.at(-1)
  const scalpEquity   = latestScalp?.sleeve_equity ?? null
  const scalpTotalPnl = latestScalp?.total_pnl ?? null
  const scalpRetPct   = scalpEquity && scalpTotalPnl != null ? (scalpTotalPnl / (scalpEquity - scalpTotalPnl)) * 100 : null
  const closedScalp   = scalpTrades.filter((t: any) => t.pnl != null)
  const scalpWR       = closedScalp.length ? (closedScalp.filter((t: any) => t.pnl > 0).length / closedScalp.length) * 100 : null

  // Scalp positions with null target/stop are orphaned records from engine restarts.
  // They are shown in the table with a ⚠ badge — engine startup recovery will close them.
  const orphanedScalpPositions = scalpPositions.filter((p: any) => p.target == null || p.stop == null)

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const bot = payload.find((p: any) => p.dataKey === 'bot')?.value
    const bm  = payload.find((p: any) => p.dataKey === 'benchmark')?.value
    return (
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--edge)', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
        <div style={{ color: 'var(--ink-3)', marginBottom: 6 }}>{label}</div>
        {bot != null && <div style={{ color: '#cfe3ff', marginBottom: 2 }}>Bot: <strong>${fmt(bot)}</strong></div>}
        {bm  != null && <div style={{ color: '#f59e0b' }}>S&P 500: <strong>${fmt(bm)}</strong></div>}
        {bot != null && bm != null && (
          <div style={{ color: bot > bm ? '#22c55e' : '#ef4444', marginTop: 4, fontSize: 11 }}>
            {bot > bm ? '▲' : '▼'} {fmt(Math.abs(bot - bm))} vs benchmark
          </div>
        )}
      </div>
    )
  }

  if (loading) return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--ink-3)', fontFamily: 'var(--font-body)' }}>
      Initialising trading data…
    </div>
  )

  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font-body)', paddingBottom: 60 }}>

      {/* ── Topbar ── */}
      <div className="topbar glass" style={{ borderBottom: '1px solid var(--edge)', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => router.push('/portal')}
          style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.1em', display: 'flex', alignItems: 'center', gap: 6 }}>
          ← PORTAL
        </button>
        <div className="brand" style={{ marginLeft: 12 }}>
          <div className="brand__mark">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 6v4L8 14 2 10V6L8 2z" fill="currentColor" />
            </svg>
          </div>
          <span className="brand__name">Trading</span>
          <span className="brand__dot">.bot</span>
        </div>
        <div className="topbar__right">
          {circuitBreaker && (
            <span style={{ padding: '5px 12px', borderRadius: 999, background: 'rgba(239,68,68,.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,.3)', fontSize: 12, fontWeight: 600 }}>
              ⚠ Circuit Breaker
            </span>
          )}
          <span style={{ padding: '5px 14px', borderRadius: 999, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}44`, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            ● {cfg.label}{regime.confidence != null ? ` · ${Math.round(regime.confidence * 100)}%` : ''}
          </span>
          <button onClick={refresh} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            ↻ {lastUpdated?.toLocaleTimeString() ?? ''}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 28px 0' }}>

        {/* ── System Health ── */}
        <div className="glass" style={{ borderRadius: 'var(--r-md)', padding: '18px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div className="eyebrow">System Health</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: engineDotColor, display: 'inline-block' }} />
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>Engine</span>
                <span style={{ fontSize: 11, color: engineState === 'stale' ? '#f59e0b' : 'var(--ink-3)' }}>
                  {heartbeat ? timeAgo(heartbeat.created_at) : 'no heartbeat yet'}
                  {engineState === 'stale' ? ' · market closed?' : ''}
                </span>
              </div>
              {[
                { label: 'Alpaca',    ok: heartbeat?.alpaca_ok ?? null },
                { label: 'Supabase', ok: heartbeat ? true : null },
              ].map(({ label, ok }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: ok === null ? '#5f7088' : ok ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>{label}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>Pairs scanned:</span>
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{heartbeat?.active_pairs ?? '—'}</span>
              </div>
            </div>
          </div>
          {heartbeat?.error_msg && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', fontSize: 11, fontFamily: 'var(--font-mono)', color: '#ef4444' }}>
              {heartbeat.error_msg}
            </div>
          )}
        </div>

        {/* ── Portfolio Overview ── */}
        <div className="glass" style={{ borderRadius: 'var(--r-md)', marginBottom: 24, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid var(--edge)' }}>
            <div className="eyebrow" style={{ margin: 0 }}>Portfolio Overview</div>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
              {hbUpdatedAt
                ? `via heartbeat · ${hbUpdatedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                : 'waiting for heartbeat…'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--edge)' }}>
            {[
              {
                label: 'Portfolio Value',
                value: portValue != null ? `$${fmt(portValue)}` : '—',
                sub: 'Alpaca paper account',
                color: undefined,
                live: !!heartbeat?.equity,
              },
              {
                label: 'Total P&L',
                value: totalPnl != null ? `${totalPnl >= 0 ? '+' : ''}$${fmt(totalPnl)}` : '—',
                sub: totalPnlPct != null ? `${totalPnlPct >= 0 ? '+' : ''}${fmt(totalPnlPct)}% since start` : 'vs $100k start',
                color: pnlColor(totalPnl),
                live: !!heartbeat?.equity,
              },
              {
                label: 'Today P&L',
                value: todayPnl != null ? `${todayPnl >= 0 ? '+' : ''}$${fmt(todayPnl)}` : '—',
                sub: 'equity − yesterday close',
                color: pnlColor(todayPnl),
                live: todayPnl != null,
              },
              {
                label: 'Today P&L %',
                value: todayPnlPct != null ? `${todayPnlPct >= 0 ? '+' : ''}${fmt(todayPnlPct, 3)}%` : '—',
                sub: 'vs yesterday close',
                color: pnlColor(todayPnlPct),
                live: todayPnlPct != null,
              },
            ].map((m: any, i, arr) => (
              <div key={m.label} style={{ padding: '16px 24px', borderRight: i < arr.length - 1 ? '1px solid var(--edge)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{ fontSize: 10, letterSpacing: '.14em', color: 'var(--ink-3)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>{m.label}</div>
                  {m.live && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 999, background: 'rgba(34,197,94,.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,.2)', fontFamily: 'var(--font-mono)', letterSpacing: '.06em' }}>5m</span>}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: m.color ?? 'var(--ink)', fontFamily: 'var(--font-display)', letterSpacing: '-.01em', lineHeight: 1 }}>{m.value}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{m.sub}</div>
              </div>
            ))}
          </div>

          {/* Equity Curve */}
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="eyebrow" style={{ margin: 0, fontSize: 10 }}>Equity Curve vs S&P 500</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: '#cfe3ff' }}>— Bot</span>
                <span style={{ color: '#f59e0b' }}>— S&P 500</span>
                <span style={{ color: 'var(--ink-3)' }}>base $100k</span>
              </div>
            </div>
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(160,195,255,.08)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--ink-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={fmtK} domain={[PAPER_START, 'auto']} width={56} />
                  <ReferenceLine y={PAPER_START} stroke="rgba(160,195,255,.12)" strokeDasharray="4 2" />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="bot" stroke="#cfe3ff" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#cfe3ff' }} />
                  <Line type="monotone" dataKey="benchmark" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3" dot={false} activeDot={{ r: 3, fill: '#f59e0b' }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 200, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                Chart appears after the first end-of-day snapshot
              </div>
            )}
          </div>
        </div>

        {/* ── Stat Arb Strategy (collapsible) ── */}
        <div className="glass" style={{ borderRadius: 'var(--r-md)', marginBottom: 24, overflow: 'hidden' }}>
          <div onClick={() => setStatarbOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: statarbOpen ? '1px solid var(--edge)' : 'none', cursor: 'pointer', userSelect: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="eyebrow" style={{ margin: 0 }}>Stat Arb Strategy</div>
              <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 999, background: 'rgba(160,195,255,.08)', color: 'var(--ice)', border: '1px solid rgba(160,195,255,.15)', fontFamily: 'var(--font-mono)' }}>
                Pairs · Mean Reverting
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {!statarbOpen && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>{winRate != null ? `WR ${fmt(winRate, 1)}%` : 'WR —'} · {openStatArbTrades.length} open</span>}
              <span style={{ color: 'var(--ink-3)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>{statarbOpen ? '▲' : '▼'}</span>
            </div>
          </div>

          {statarbOpen && (
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 20 }}>
                {[
                  { label: 'Win Rate', value: winRate != null ? `${fmt(winRate, 1)}%` : '—', sub: `${closedStatArbTrades.length} closed trades`, color: winRate != null ? (winRate >= 50 ? '#22c55e' : '#ef4444') : undefined },
                  { label: 'Open Positions', value: String(openStatArbTrades.length), sub: openStatArbTrades.length ? openStatArbTrades.map((t: any) => t.pair_id).join(', ') : 'none active' },
                ].map((m: any) => (
                  <div key={m.label} className="glass" style={{ borderRadius: 'var(--r-md)', padding: '14px 18px' }}>
                    <div style={{ fontSize: 10, letterSpacing: '.14em', color: 'var(--ink-3)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 5 }}>{m.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: m.color ?? 'var(--ink)', fontFamily: 'var(--font-display)', letterSpacing: '-.01em' }}>{m.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{m.sub}</div>
                  </div>
                ))}
              </div>

              {/* Regime Timeline */}
              <div className="glass" style={{ borderRadius: 'var(--r-md)', padding: '18px 20px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div className="eyebrow" style={{ margin: 0, fontSize: 10 }}>Regime Timeline</div>
                  <div style={{ display: 'flex', gap: 14, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                    {Object.entries(REGIME_CONFIG).filter(([k]) => k !== 'initialising').map(([k, c]) => (
                      <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink-3)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color, display: 'inline-block' }} />{c.label}
                      </span>
                    ))}
                  </div>
                </div>
                {regimeSpans.length === 0 ? (
                  <div style={{ height: 48, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Timeline appears once the engine has logged regime readings</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', width: '100%', height: 26, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--edge)' }}>
                      {regimeSpans.map((sp, i) => {
                        const days = (sp.end.getTime() - sp.start.getTime()) / 86400000
                        const dur = days >= 1 ? `${days.toFixed(1)}d` : `${Math.max(1, Math.round(days * 24))}h`
                        return <div key={i} title={`${REGIME_CONFIG[sp.label]?.label ?? sp.label} · ${sp.start.toLocaleString()} → ${sp.end.toLocaleString()} · ~${dur} · ${Math.round(sp.confidence * 100)}%`} style={{ width: `${sp.pct}%`, background: sp.color, opacity: 0.75, borderRight: i < regimeSpans.length - 1 ? '1px solid var(--bg)' : 'none' }} />
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
                      <span>{timelineStart ? new Date(timelineStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                      <span>now</span>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ textTransform: 'uppercase', letterSpacing: '.1em', fontFamily: 'var(--font-mono)', fontSize: 10 }}>Recent:</span>
                      {regimeSpans.slice(-6).map((sp, i, arr) => (
                        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: REGIME_CONFIG[sp.label]?.color ?? 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{REGIME_CONFIG[sp.label]?.label ?? sp.label}</span>
                          {i < arr.length - 1 && <span style={{ color: 'var(--ink-3)' }}>→</span>}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                {/* Open Positions — reads from `trades` where not yet closed */}
                <div className="glass" style={{ borderRadius: 'var(--r-md)', padding: '18px 20px' }}>
                  <div className="eyebrow" style={{ marginBottom: 14, fontSize: 10 }}>Open Positions</div>
                  {openStatArbTrades.length === 0 ? (
                    <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No open positions</div>
                  ) : (
                    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                      <thead><tr style={{ color: 'var(--ink-3)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                        {['Pair', 'Direction', 'Entry Z', 'Opened'].map(h => <th key={h} style={{ textAlign: h === 'Pair' || h === 'Direction' ? 'left' : 'right', paddingBottom: 10, paddingRight: 12, borderBottom: '1px solid var(--edge)' }}>{h}</th>)}
                      </tr></thead>
                      <tbody>{openStatArbTrades.map((t: any) => (
                        <tr key={t.id} style={{ borderBottom: '1px solid rgba(160,195,255,.06)' }}>
                          <td style={{ padding: '9px 12px 9px 0', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ice)' }}>{t.pair_id}</td>
                          <td style={{ padding: '9px 12px 9px 0' }}><span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: t.direction === 'long_spread' ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)', color: t.direction === 'long_spread' ? '#22c55e' : '#ef4444' }}>{t.direction === 'long_spread' ? '↑ Long' : '↓ Short'}</span></td>
                          <td style={{ textAlign: 'right', paddingRight: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>{fmt(t.zscore)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontSize: 11 }}>{new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </div>
                <div className="glass" style={{ borderRadius: 'var(--r-md)', padding: '18px 20px', overflow: 'hidden' }}>
                  <div className="eyebrow" style={{ marginBottom: 14, fontSize: 10 }}>Trade Log <span style={{ color: 'var(--ink-3)', textTransform: 'none', fontSize: 11, letterSpacing: 0 }}>last 60</span></div>
                  {trades.length === 0 ? <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No trades yet</div> : (
                    <div style={{ overflowY: 'auto', maxHeight: 300 }}>
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead><tr style={{ color: 'var(--ink-3)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                          {['Time', 'Pair', 'Dir', 'Z', 'P&L'].map(h => <th key={h} style={{ textAlign: ['Pair', 'Dir', 'Time'].includes(h) ? 'left' : 'right', paddingBottom: 10, paddingRight: 10, borderBottom: '1px solid var(--edge)' }}>{h}</th>)}
                        </tr></thead>
                        <tbody>{trades.map((t: any) => (
                          <tr key={t.id} style={{ borderBottom: '1px solid rgba(160,195,255,.05)' }}>
                            <td style={{ padding: '7px 10px 7px 0', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                            <td style={{ paddingRight: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{t.pair_id}</td>
                            <td style={{ paddingRight: 10, color: t.direction === 'long_spread' ? '#22c55e' : '#ef4444' }}>{t.direction === 'long_spread' ? '↑' : '↓'}</td>
                            <td style={{ textAlign: 'right', paddingRight: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>{fmt(t.zscore)}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: t.pnl != null ? pnlColor(t.pnl) : 'var(--ink-3)' }}>
                              {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}$${fmt(t.pnl)}` : <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>open</span>}
                            </td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="glass" style={{ borderRadius: 'var(--r-md)', padding: '18px 20px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <div className="eyebrow" style={{ fontSize: 10 }}>Scanner Activity</div>
                    {latestScanAt && <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{timeAgo(latestScanAt)}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 12 }}>Top candidate pairs by |z-score|</div>
                  {scanActivity.length === 0 ? <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No scans logged yet</div> : (
                    <div style={{ overflowY: 'auto', maxHeight: 300 }}>
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead><tr style={{ color: 'var(--ink-3)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                          {['Pair', '|Z|', 'vs Threshold', 'Regime'].map(h => <th key={h} style={{ textAlign: h === 'Pair' ? 'left' : h === 'Regime' ? 'left' : 'right', paddingBottom: 10, paddingRight: 10, borderBottom: '1px solid var(--edge)' }}>{h}</th>)}
                        </tr></thead>
                        <tbody>{scanActivity.map(row => {
                          const az = Math.abs(Number(row.zscore))
                          const pct = Math.min(100, Math.round((az / Number(row.entry_threshold || 1)) * 100))
                          const rcfg = REGIME_CONFIG[row.regime_label] ?? REGIME_CONFIG.initialising
                          return (
                            <tr key={row.id} style={{ borderBottom: '1px solid rgba(160,195,255,.05)' }}>
                              <td style={{ padding: '7px 10px 7px 0', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ice)' }}>{row.sym1}/{row.sym2}</td>
                              <td style={{ textAlign: 'right', paddingRight: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, color: row.would_enter ? '#22c55e' : 'var(--ink-2)' }}>{fmt(az)}</td>
                              <td style={{ paddingRight: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                                  <div style={{ width: 44, height: 4, borderRadius: 3, background: 'rgba(160,195,255,.1)', overflow: 'hidden' }}>
                                    <div style={{ width: `${pct}%`, height: '100%', background: row.would_enter ? '#22c55e' : '#5f7088', borderRadius: 3 }} />
                                  </div>
                                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: row.would_enter ? '#22c55e' : 'var(--ink-3)', minWidth: 30, textAlign: 'right' }}>{row.would_enter ? '✓' : `${pct}%`}</span>
                                </div>
                              </td>
                              <td style={{ paddingLeft: 10 }}><span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: rcfg.color }}>{rcfg.label}</span></td>
                            </tr>
                          )
                        })}</tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="glass" style={{ borderRadius: 'var(--r-md)', padding: '18px 20px', overflow: 'hidden' }}>
                  <div className="eyebrow" style={{ marginBottom: 4, fontSize: 10 }}>Shadow Trades</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 12 }}>Strong setups outside mean-reverting regime — never executed</div>
                  {shadowTrades.length === 0 ? <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No shadow signals yet</div> : (
                    <div style={{ overflowY: 'auto', maxHeight: 300 }}>
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead><tr style={{ color: 'var(--ink-3)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                          {['Time', 'Pair', 'Dir', 'Z', 'Regime'].map(h => <th key={h} style={{ textAlign: ['Pair', 'Dir', 'Time'].includes(h) ? 'left' : 'right', paddingBottom: 10, paddingRight: 10, borderBottom: '1px solid var(--edge)' }}>{h}</th>)}
                        </tr></thead>
                        <tbody>{shadowTrades.map(row => {
                          const rcfg = REGIME_CONFIG[row.regime_label] ?? REGIME_CONFIG.initialising
                          return (
                            <tr key={row.id} style={{ borderBottom: '1px solid rgba(160,195,255,.05)' }}>
                              <td style={{ padding: '7px 10px 7px 0', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                              <td style={{ paddingRight: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{row.sym1}/{row.sym2}</td>
                              <td style={{ paddingRight: 10, color: row.direction === 'long_spread' ? '#22c55e' : '#ef4444' }}>{row.direction === 'long_spread' ? '↑' : '↓'}</td>
                              <td style={{ textAlign: 'right', paddingRight: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>{fmt(row.zscore)}</td>
                              <td style={{ textAlign: 'right' }}><span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: rcfg.color }}>{rcfg.label}</span></td>
                            </tr>
                          )
                        })}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Scalp Sleeve (collapsible) ── */}
        <div className="glass" style={{ borderRadius: 'var(--r-md)', marginBottom: 24, overflow: 'hidden' }}>
          <div onClick={() => setScalpOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: scalpOpen ? '1px solid var(--edge)' : 'none', cursor: 'pointer', userSelect: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="eyebrow" style={{ margin: 0 }}>Scalp Sleeve</div>
              <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 999, background: 'rgba(34,197,94,.08)', color: '#22c55e', border: '1px solid rgba(34,197,94,.2)', fontFamily: 'var(--font-mono)' }}>Intraday MR · Fade-only</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {!scalpOpen && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>{scalpEquity != null ? `$${fmt(scalpEquity)}` : '—'} · {scalpPositions.length} open{orphanedScalpPositions.length > 0 ? ` (${orphanedScalpPositions.length} orphaned)` : ''}</span>}
              <span style={{ color: 'var(--ink-3)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>{scalpOpen ? '▲' : '▼'}</span>
            </div>
          </div>

          {scalpOpen && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--edge)' }}>
                {[
                  { label: 'Sleeve Equity', value: scalpEquity != null ? `$${fmt(scalpEquity)}` : '—', sub: 'of $25k allocation' },
                  { label: 'Scalp Net P&L', value: scalpTotalPnl != null ? `${scalpTotalPnl >= 0 ? '+' : ''}$${fmt(scalpTotalPnl)}` : '—', sub: scalpRetPct != null ? `${scalpRetPct >= 0 ? '+' : ''}${fmt(scalpRetPct)}%` : undefined, color: pnlColor(scalpTotalPnl) },
                  { label: 'Scalp Win Rate', value: scalpWR != null ? `${fmt(scalpWR, 1)}%` : '—', sub: closedScalp.length ? `${closedScalp.length} closed` : 'no closed trades', color: scalpWR != null ? (scalpWR >= 55 ? '#22c55e' : scalpWR >= 45 ? '#f59e0b' : '#ef4444') : undefined },
                  { label: 'Open Scalp Pos', value: String(scalpPositions.length), sub: orphanedScalpPositions.length > 0 ? `${orphanedScalpPositions.length} orphaned · no Alpaca exposure` : 'max 4 concurrent' },
                ].map((m: any, i, arr) => (
                  <div key={m.label} style={{ padding: '14px 24px', borderRight: i < arr.length - 1 ? '1px solid var(--edge)' : 'none' }}>
                    <div style={{ fontSize: 10, letterSpacing: '.14em', color: 'var(--ink-3)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 5 }}>{m.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: m.color ?? 'var(--ink)', fontFamily: 'var(--font-display)', letterSpacing: '-.01em' }}>{m.value}</div>
                    {m.sub && <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>{m.sub}</div>}
                  </div>
                ))}
              </div>
              <div style={{ padding: '14px 24px 6px', borderBottom: '1px solid var(--edge)' }}>
                <ScalpEquityChart snapshots={scalpSnaps} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                <div style={{ padding: '18px 24px', borderRight: '1px solid var(--edge)' }}>
                  <div className="eyebrow" style={{ marginBottom: 12, fontSize: 10 }}>Open Scalp Positions</div>

                  {/* Orphaned warning banner */}
                  {orphanedScalpPositions.length > 0 && (
                    <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', fontSize: 11, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                      ⚠ {orphanedScalpPositions.length} orphaned — engine restarted without closing. No live Alpaca exposure.
                    </div>
                  )}

                  {scalpPositions.length === 0 ? (
                    <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No open scalp positions</div>
                  ) : (
                    <>
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead><tr style={{ color: 'var(--ink-3)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                          {['Symbol', 'Dir', 'Qty', 'Entry', 'Target', 'Stop'].map(h => <th key={h} style={{ textAlign: h === 'Symbol' || h === 'Dir' ? 'left' : 'right', paddingBottom: 10, paddingRight: 10, borderBottom: '1px solid var(--edge)' }}>{h}</th>)}
                        </tr></thead>
                      </table>
                      <div style={{ overflowY: 'auto', maxHeight: 280 }}>
                        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                          <tbody>{scalpPositions.map((p: any) => {
                            const isOrphaned = p.target == null || p.stop == null
                            return (
                              <tr key={p.id} style={{ borderBottom: '1px solid rgba(160,195,255,.05)', background: isOrphaned ? 'rgba(245,158,11,.04)' : undefined }}>
                                <td style={{ padding: '8px 10px 8px 0', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ice)', width: '20%' }}>
                                  {p.symbol}{isOrphaned && <span style={{ marginLeft: 5, fontSize: 9, color: '#f59e0b' }}>⚠</span>}
                                </td>
                                <td style={{ paddingRight: 10, color: p.direction === 'long' ? '#22c55e' : '#ef4444', fontFamily: 'var(--font-mono)', width: '10%' }}>{p.direction === 'long' ? '↑' : '↓'}</td>
                                <td style={{ textAlign: 'right', paddingRight: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', width: '10%' }}>{p.qty}</td>
                                <td style={{ textAlign: 'right', paddingRight: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', width: '20%' }}>${fmt(p.entry_price)}</td>
                                <td style={{ textAlign: 'right', paddingRight: 10, fontFamily: 'var(--font-mono)', color: isOrphaned ? 'var(--ink-3)' : '#22c55e', width: '20%' }}>{isOrphaned ? '—' : `$${fmt(p.target)}`}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: isOrphaned ? 'var(--ink-3)' : '#ef4444', width: '20%' }}>{isOrphaned ? '—' : `$${fmt(p.stop)}`}</td>
                              </tr>
                            )
                          })}</tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
                <div style={{ padding: '18px 24px', overflow: 'hidden' }}>
                  <div className="eyebrow" style={{ marginBottom: 12, fontSize: 10 }}>Scalp Trades <span style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font-body)', fontWeight: 400, color: 'var(--ink-3)' }}>last 20 closed</span></div>
                  {scalpTrades.length === 0 ? <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No scalp trades yet</div> : (
                    <div style={{ overflowY: 'auto', maxHeight: 260 }}>
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead><tr style={{ color: 'var(--ink-3)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                          {['Time', 'Sym', 'Dir', 'Entry', 'Exit', 'Reason', 'P&L'].map(h => <th key={h} style={{ textAlign: ['Time', 'Sym', 'Dir', 'Reason'].includes(h) ? 'left' : 'right', paddingBottom: 10, paddingRight: 8, borderBottom: '1px solid var(--edge)' }}>{h}</th>)}
                        </tr></thead>
                        <tbody>{scalpTrades.map((t: any) => (
                          <tr key={t.id} style={{ borderBottom: '1px solid rgba(160,195,255,.05)' }}>
                            <td style={{ padding: '7px 8px 7px 0', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{new Date(t.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td style={{ paddingRight: 8, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{t.symbol}</td>
                            <td style={{ paddingRight: 8, color: t.direction === 'long' ? '#22c55e' : '#ef4444', fontFamily: 'var(--font-mono)' }}>{t.direction === 'long' ? 'L' : 'S'}</td>
                            <td style={{ textAlign: 'right', paddingRight: 8, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>${fmt(t.entry_price)}</td>
                            <td style={{ textAlign: 'right', paddingRight: 8, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>{t.exit_price ? `$${fmt(t.exit_price)}` : '—'}</td>
                            <td style={{ paddingRight: 8 }}><span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--font-mono)', background: t.exit_reason === 'target' ? 'rgba(34,197,94,.1)' : t.exit_reason === 'stop' ? 'rgba(239,68,68,.1)' : 'rgba(160,195,255,.06)', color: t.exit_reason === 'target' ? '#22c55e' : t.exit_reason === 'stop' ? '#ef4444' : 'var(--ink-3)' }}>{t.exit_reason ?? 'open'}</span></td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: pnlColor(t.pnl) }}>{t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}$${fmt(t.pnl)}` : '—'}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: 32, textAlign: 'center', color: 'var(--ink-3)', fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '.1em' }}>
          GHOSTLINK TRADING ENGINE · ALPACA PAPER · REALTIME VIA SUPABASE
        </div>
      </div>
    </div>
  )
}
