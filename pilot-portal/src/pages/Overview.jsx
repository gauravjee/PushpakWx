import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getFlights, getStoredUser, getStoredPreviousLogin } from '../api'

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
  const user = getStoredUser()
  const previousLogin = getStoredPreviousLogin()
  const navigate = useNavigate()

  useEffect(() => {
    getFlights().then(setFlights).catch((e) => setError(e.message))
  }, [])

  const displayName = user?.full_name || user?.email || 'Pilot'

  let stats = null
  if (flights) {
    const totalDistance = flights.reduce((sum, f) => sum + (f.distance_nm || 0), 0)
    const totalDuration = flights.reduce((sum, f) => sum + (f.duration_s || 0), 0)
    const maxAlt = flights.reduce((max, f) => Math.max(max, f.max_alt_ft || 0), 0)
    const mostRecent = flights[0]
    stats = { totalFlights: flights.length, totalDistance, totalDuration, maxAlt, mostRecent }
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
