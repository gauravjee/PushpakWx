import { useEffect, useState } from 'react'
import { getOverview, importAirports } from '../api'
import StatCard from '../components/StatCard'
import BarChart from '../components/BarChart'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState('')

  useEffect(() => {
    getOverview().then(setData).catch((e) => setError(e.message))
  }, [])

  async function handleImportAirports() {
    setImporting(true)
    setImportError('')
    setImportResult(null)
    try {
      const result = await importAirports()
      setImportResult(result)
    } catch (e) {
      setImportError(e.message)
    } finally {
      setImporting(false)
    }
  }

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

      <div className="panel">
        <div className="panel-title">Data management</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
          Replaces the small starter airport list with the free OurAirports global database
          (~19,000 real airports, including small training airfields). Safe to run more than
          once — existing entries are matched and updated by ICAO code, nothing is duplicated.
        </p>
        <button onClick={handleImportAirports} disabled={importing}>
          {importing ? 'Importing… this can take up to a minute' : 'Import full airport database'}
        </button>
        {importResult && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--accent-ok, #4ade80)' }}>
            Done — {importResult.total_airports_in_db} airports now in the database
            ({importResult.india_airports_in_db} in India).
          </div>
        )}
        {importError && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--accent-bad, #f87171)' }}>
            {importError}
          </div>
        )}
      </div>
    </div>
  )
}
