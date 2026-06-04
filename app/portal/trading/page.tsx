'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const trading = createClient(
  process.env.NEXT_PUBLIC_TRADING_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_TRADING_SUPABASE_ANON_KEY!
)

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

const pnlColor = (n: number | null | undefined) =>
  n == null ? 'var(--ink-3)' : n >= 0 ? '#22c55e' : '#ef4444'

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

export default function TradingPage() {
  const router = useRouter()
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [positions, setPositions] = useState<any[]>([])
  const [trades,    setTrades]    = useState<any[]>([])
  const [regime,    setRegime]    = useState({ label: 'initialising', confidence: null as number | null })
  const [heartbeat, setHeartbeat] = useState<any>(null)
  const [circuitBreaker, setCircuitBreaker] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [s, p, t, r, hb] = await Promise.all([
      trading.from('portfolio_snapshots').select('*').order('created_at', { ascending: true }).limit(60),
      trading.from('positions').select('*').eq('status', 'open').order('created_at', { ascending: false }),
      trading.from('trades').select('*').order('created_at', { ascending: false }).limit(30),
      trading.from('regime_history').select('*').order('created_at', { ascending: false }).limit(1),
      trading.from('heartbeats').select('*').order('created_at', { ascending: false }).limit(10),
    ])
    if (s.data) setSnapshots(s.data)
    if (p.data) setPositions(p.data)
    if (t.data) setTrades(t.data)
    if (r.data?.length) setRegime({ label: r.data[0].regime_label, confidence: r.data[0].confidence })
    if (hb.data?.length) {
      setHeartbeat(hb.data[0])
      setCircuitBreaker(hb.data[0].circuit_breaker)
    }
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const ch = trading.channel('trading-dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portfolio_snapshots' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'regime_history' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'heartbeats' }, refresh)
      .subscribe()
    return () => { trading.removeChannel(ch) }
  }, [refresh])

  const latest      = snapshots.at(-1)
  const portValue   = latest?.portfolio_value ?? null
  const totalPnl    = latest?.total_pnl ?? null
  const totalPnlPct = portValue && totalPnl != null ? (totalPnl / (portValue - totalPnl)) * 100 : null
  const closed      = trades.filter(t => t.status === 'closed' && t.pnl != null)
  const winRate     = closed.length ? (closed.filter(t => t.pnl > 0).length / closed.length) * 100 : null
  const cfg         = REGIME_CONFIG[regime.label] ?? REGIME_CONFIG.initialising

  // Health status derived from last heartbeat
  const hbAge = heartbeat ? Math.floor((Date.now() - new Date(heartbeat.created_at).getTime()) / 60000) : null
  const engineOk = heartbeat && heartbeat.status === 'ok' && hbAge !== null && hbAge < 60
  const engineStatus = !heartbeat ? 'no data' : hbAge !== null && hbAge > 60 ? 'stale' : heartbeat.status

  const chartData = snapshots.map(s => ({
    date:  new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: Number(s.portfolio_value),
    pnl:   Number(s.total_pnl),
  }))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const { value, pnl } = payload[0].payload
    return (
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--edge)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
        <div style={{ color: 'var(--ink-3)', marginBottom: 4 }}>{label}</div>
        <div style={{ color: 'var(--ink)', fontWeight: 600 }}>${fmt(value)}</div>
        <div style={{ color: pnlColor(pnl) }}>{pnl >= 0 ? '+' : ''}${fmt(pnl)} P&L</div>
      </div>
    )
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--ink-3)', fontFamily: 'var(--font-body)' }}>
      Initialising trading data…
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font-body)', padding: '0 0 60px' }}>

      {/* Topbar */}
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

        {/* Metrics strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Portfolio Value', value: portValue != null ? `$${fmt(portValue)}` : '—', sub: 'paper account', color: undefined },
            { label: 'Total P&L', value: totalPnl != null ? `${totalPnl >= 0 ? '+' : ''}$${fmt(totalPnl)}` : '—', sub: totalPnlPct != null ? `${totalPnlPct >= 0 ? '+' : ''}${fmt(totalPnlPct)}%` : undefined, color: pnlColor(totalPnl) },
            { label: 'Win Rate', value: winRate != null ? `${fmt(winRate, 1)}%` : '—', sub: `${closed.length} closed trades`, color: winRate != null ? (winRate >= 50 ? '#22c55e' : '#ef4444') : undefined },
            { label: 'Open Positions', value: String(positions.length), sub: positions.length ? positions.map(p => p.pair_id).join(', ') : 'none active', color: undefined },
          ].map(m => (
            <div key={m.label} className="glass" style={{ borderRadius: 'var(--r-md)', padding: '18px 20px' }}>
              <div style={{ fontSize: 11, letterSpacing: '.14em', color: 'var(--ink-3)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: m.color ?? 'var(--ink)', fontFamily: 'var(--font-display)', letterSpacing: '-.01em' }}>{m.value}</div>
              {m.sub && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{m.sub}</div>}
            </div>
          ))}
        </div>

        {/* System Health */}
        <div className="glass" style={{ borderRadius: 'var(--r-md)', padding: '18px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div className="eyebrow">System Health</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>

              {/* Engine */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: engineOk ? '#22c55e' : engineStatus === 'stale' ? '#f59e0b' : '#ef4444', display: 'inline-block' }} />
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>Engine</span>
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  {heartbeat ? timeAgo(heartbeat.created_at) : 'no heartbeat yet'}
                </span>
              </div>

              {/* Alpaca */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: heartbeat?.alpaca_ok ? '#22c55e' : heartbeat ? '#ef4444' : '#5f7088', display: 'inline-block' }} />
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>Alpaca</span>
              </div>

              {/* Supabase */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: heartbeat ? '#22c55e' : '#5f7088', display: 'inline-block' }} />
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>Supabase</span>
              </div>

              {/* Active pairs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>Pairs scanned:</span>
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{heartbeat?.active_pairs ?? '—'}</span>
              </div>
            </div>

            {/* Error message if any */}
            {heartbeat?.error_msg && (
              <div style={{ width: '100%', marginTop: 8, padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', fontSize: 11, fontFamily: 'var(--font-mono)', color: '#ef4444' }}>
                {heartbeat.error_msg}
              </div>
            )}
          </div>
        </div>

        {/* Equity curve */}
        <div className="glass" style={{ borderRadius: 'var(--r-md)', padding: '22px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div className="eyebrow">Equity Curve</div>
            <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>vs $100k start</span>
          </div>
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(160,195,255,.08)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--ink-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} domain={['auto','auto']} />
                <ReferenceLine y={100000} stroke="rgba(160,195,255,.18)" strokeDasharray="4 2" />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={1.5} fill="url(#g)" dot={false} activeDot={{ r: 4, fill: 'var(--accent)' }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              Equity curve appears after the first end-of-day snapshot
            </div>
          )}
        </div>

        {/* Positions + Trade log */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="glass" style={{ borderRadius: 'var(--r-md)', padding: '22px 24px' }}>
            <div className="eyebrow" style={{ marginBottom: 16 }}>Open Positions</div>
            {positions.length === 0 ? (
              <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>No open positions</div>
            ) : (
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--ink-3)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                    {['Pair', 'Direction', 'Entry Z', 'Curr Z'].map(h => (
                      <th key={h} style={{ textAlign: h === 'Pair' || h === 'Direction' ? 'left' : 'right', paddingBottom: 10, paddingRight: 12, borderBottom: '1px solid var(--edge)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(160,195,255,.06)' }}>
                      <td style={{ padding: '10px 12px 10px 0', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ice)' }}>{p.pair_id}</td>
                      <td style={{ padding: '10px 12px 10px 0' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: p.direction === 'long_spread' ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)', color: p.direction === 'long_spread' ? '#22c55e' : '#ef4444' }}>
                          {p.direction === 'long_spread' ? '↑ Long' : '↓ Short'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>{fmt(p.entry_zscore)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: Math.abs(p.current_zscore) > 2.5 ? '#ef4444' : 'var(--ink-3)' }}>{fmt(p.current_zscore)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="glass" style={{ borderRadius: 'var(--r-md)', padding: '22px 24px', overflow: 'hidden' }}>
            <div className="eyebrow" style={{ marginBottom: 16 }}>Trade Log <span style={{ color: 'var(--ink-3)', textTransform: 'none', fontSize: 11, letterSpacing: 0 }}>last 30</span></div>
            {trades.length === 0 ? (
              <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>No trades yet</div>
            ) : (
              <div style={{ overflowY: 'auto', maxHeight: 320 }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--ink-3)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                      {['Time', 'Pair', 'Dir', 'Z', 'P&L'].map(h => (
                        <th key={h} style={{ textAlign: ['Pair','Dir','Time'].includes(h) ? 'left' : 'right', paddingBottom: 10, paddingRight: 10, borderBottom: '1px solid var(--edge)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid rgba(160,195,255,.05)' }}>
                        <td style={{ padding: '8px 10px 8px 0', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                          {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                        <td style={{ paddingRight: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{t.pair_id}</td>
                        <td style={{ paddingRight: 10, color: t.direction === 'long_spread' ? '#22c55e' : '#ef4444' }}>
                          {t.direction === 'long_spread' ? '↑' : '↓'}
                        </td>
                        <td style={{ textAlign: 'right', paddingRight: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>{fmt(t.zscore)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: pnlColor(t.pnl) }}>
                          {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}$${fmt(t.pnl)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 32, textAlign: 'center', color: 'var(--ink-3)', fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '.1em' }}>
          GHOSTLINK TRADING ENGINE · ALPACA PAPER · REALTIME VIA SUPABASE
        </div>
      </div>
    </div>
  )
}
