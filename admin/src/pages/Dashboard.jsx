import { useEffect, useState } from 'react'
import { getOverview } from '../api'
import StatCard from '../components/StatCard'
import BarChart from '../components/BarChart'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getOverview().then(setData).catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="empty-state">{error}</div>
  if (!data) return <div className="loading-state">Loading overview…</div>

  const topEvents = Object.entries(data.event_counts_30d || {}).sort((a, b) => b[1] - a[1])

  return (
    <div>
      <h1 className="page-title">Overview</h1>
      <p className="page-sub">Growth and usage across the last 30 days</p>

      <div className="stat-grid">
        <StatCard label="Total users" value={data.total_users} />
        <StatCard label="Verified users" value={data.verified_users} accent="cyan" />
        <StatCard label="Signups · 7d" value={data.signups_last_7d} />
        <StatCard label="Signups · 30d" value={data.signups_last_30d} />
        <StatCard label="Logins · 7d" value={data.logins_last_7d} accent="cyan" />
      </div>

      <div className="panel">
        <div className="panel-title">Daily signups (last 30 days)</div>
        <BarChart data={data.daily_signups} />
      </div>

      <div className="panel">
        <div className="panel-title">Feature usage (last 30 days)</div>
        {topEvents.length === 0 && <div className="empty-state">No events recorded yet.</div>}
        {topEvents.map(([type, count]) => (
          <div className="feed-item" key={type}>
            <div className="feed-type">{type}</div>
            <div className="feed-detail">{count} events</div>
          </div>
        ))}
      </div>

      {data.top_airports_30d?.length > 0 && (
        <div className="panel">
          <div className="panel-title">Most-checked airports (METAR/TAF)</div>
          {data.top_airports_30d.map((a) => (
            <div className="feed-item" key={a.icao}>
              <div className="feed-type">{a.icao}</div>
              <div className="feed-detail">{a.count} lookups</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
