import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFlights } from '../api'

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}
function formatDuration(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function FlightsList() {
  const [flights, setFlights] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    getFlights().then(setFlights).catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="empty-state">{error}</div>

  return (
    <div>
      <h1 className="page-title">Your Flights</h1>
      <p className="page-sub">{flights ? `${flights.length} logged flight${flights.length === 1 ? '' : 's'}` : 'Loading…'}</p>

      {!flights && <div className="loading-state">Loading your flight logs…</div>}
      {flights && flights.length === 0 && (
        <div className="panel">
          <div className="empty-state">No flights logged yet. Record a flight in the PushpakWx app and it'll show up here.</div>
        </div>
      )}
      {flights && flights.map((f) => (
        <div className="flight-card" key={f.id} onClick={() => navigate(`/flights/${f.id}`)}>
          <div>
            <div className="flight-route">{f.dep_icao || '???'} → {f.arr_icao || '???'}</div>
            <div className="flight-date">{formatDate(f.started_at)}</div>
          </div>
          <div className="flight-stats">
            <div>
              <div className="flight-stat-value">{f.distance_nm?.toFixed(0) ?? '—'}</div>
              <div className="flight-stat-label">NM</div>
            </div>
            <div>
              <div className="flight-stat-value">{Math.round(f.max_alt_ft ?? 0)}</div>
              <div className="flight-stat-label">Max ft</div>
            </div>
            <div>
              <div className="flight-stat-value">{formatDuration(f.duration_s ?? 0)}</div>
              <div className="flight-stat-label">Duration</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
