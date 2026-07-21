import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getFlights, getStoredUser, getStoredPreviousLogin, getTopCheckedAirports } from '../api'

function formatDateTime(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatHours(totalSeconds) {
  const hrs = totalSeconds / 3600
  return hrs.toFixed(1)
}

export default function Overview() {
  const [flights, setFlights] = useState(null)
  const [error, setError] = useState('')
  const [topChecked, setTopChecked] = useState(null)
  const user = getStoredUser()
  const previousLogin = getStoredPreviousLogin()
  const navigate = useNavigate()

  useEffect(() => {
    getFlights().then(setFlights).catch((e) => setError(e.message))
    getTopCheckedAirports(3).then((res) => setTopChecked(res.items)).catch(() => setTopChecked([]))
  }, [])

  const displayName = user?.full_name || user?.email || 'Pilot'

  let stats = null
  let topTraveled = null
  if (flights) {
    const totalDistance = flights.reduce((sum, f) => sum + (f.distance_nm || 0), 0)
    const totalDuration = flights.reduce((sum, f) => sum + (f.duration_s || 0), 0)
    const maxAlt = flights.reduce((max, f) => Math.max(max, f.max_alt_ft || 0), 0)
    const mostRecent = flights[0]
    stats = { totalFlights: flights.length, totalDistance, totalDuration, maxAlt, mostRecent }

    const counts = {}
    flights.forEach((f) => {
      ;[f.dep_icao, f.arr_icao].forEach((icao) => {
        if (!icao) return
        counts[icao] = (counts[icao] || 0) + 1
      })
    })
    topTraveled = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([icao, count]) => ({ icao, count }))
  }

  return (
    <div>
      <h1 className="page-title">Welcome back, {displayName.split('@')[0]}</h1>
      <p className="page-sub">
        {previousLogin
          ? `Last login: ${formatDateTime(previousLogin)}`
          : 'This looks like your first login here'}
      </p>

      {error && <div className="empty-state">{error}</div>}
      {!flights && !error && <div className="loading-state">Loading your stats…</div>}

      {stats && (
        <>
          <div className="detail-stat-grid" style={{ marginBottom: 24 }}>
            <div className="detail-stat">
              <div className="detail-stat-value">{stats.totalFlights}</div>
              <div className="detail-stat-label">Flights Logged</div>
            </div>
            <div className="detail-stat">
              <div className="detail-stat-value">{stats.totalDistance.toFixed(0)}</div>
              <div className="detail-stat-label">Total NM</div>
            </div>
            <div className="detail-stat">
              <div className="detail-stat-value">{formatHours(stats.totalDuration)}</div>
              <div className="detail-stat-label">Total Hours</div>
            </div>
            <div className="detail-stat">
              <div className="detail-stat-value">{Math.round(stats.maxAlt)}</div>
              <div className="detail-stat-label">Highest Alt (ft)</div>
            </div>
          </div>

          <div className="two-col-row">
            <div className="panel">
              <div className="panel-title">Most Checked Airports</div>
              {topChecked === null && <div className="loading-state">Loading…</div>}
              {topChecked && topChecked.length === 0 && (
                <div className="empty-state">No weather lookups yet.</div>
              )}
              {topChecked && topChecked.map((a, i) => (
                <div className="rank-row" key={a.icao}>
                  <span className="rank-num">{i + 1}</span>
                  <span className="rank-code">{a.icao}</span>
                  <span className="rank-count">{a.count} lookup{a.count === 1 ? '' : 's'}</span>
                </div>
              ))}
            </div>

            <div className="panel">
              <div className="panel-title">Most Traveled Airports</div>
              {!topTraveled && <div className="loading-state">Loading…</div>}
              {topTraveled && topTraveled.length === 0 && (
                <div className="empty-state">No flights logged yet.</div>
              )}
              {topTraveled && topTraveled.map((a, i) => (
                <div className="rank-row" key={a.icao}>
                  <span className="rank-num">{i + 1}</span>
                  <span className="rank-code">{a.icao}</span>
                  <span className="rank-count">{a.count} flight{a.count === 1 ? '' : 's'}</span>
                </div>
              ))}
            </div>
          </div>

          {stats.totalFlights === 0 ? (
            <div className="panel">
              <div className="empty-state">
                No flights logged yet. Record a flight in the PushpakWx app and your stats will show up here.
              </div>
            </div>
          ) : (
            <div className="panel">
              <div className="panel-title">Most Recent Flight</div>
              <div className="flight-card" onClick={() => navigate(`/flights/${stats.mostRecent.id}`)}>
                <div>
                  <div className="flight-route">{stats.mostRecent.dep_icao || '???'} → {stats.mostRecent.arr_icao || '???'}</div>
                  <div className="flight-date">{formatDateTime(stats.mostRecent.started_at)}</div>
                </div>
                <div className="flight-stats">
                  <div>
                    <div className="flight-stat-value">{stats.mostRecent.distance_nm?.toFixed(0) ?? '—'}</div>
                    <div className="flight-stat-label">NM</div>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <Link to="/logbook" style={{ color: 'var(--brand)', fontSize: 13, textDecoration: 'none' }}>
                  View full logbook →
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
