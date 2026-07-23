import { useEffect, useState } from 'react'
import { getActivity } from '../api'

function formatTime(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ts
  }
}

function describe(e) {
  switch (e.type) {
    case 'login': return e.user_email || 'Unknown user'
    case 'register': return e.user_email || 'New account'
    case 'weather_forecast': return e.meta?.lat != null ? `lat ${e.meta.lat}, lon ${e.meta.lon}` : '—'
    case 'metar': return e.meta?.icao || '—'
    case 'taf': return e.meta?.icao || '—'
    default: return e.user_email || '—'
  }
}

export default function Activity() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getActivity(100).then((d) => setItems(d.items)).catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="empty-state">{error}</div>

  return (
    <div>
      <h1 className="page-title">Recent activity</h1>
      <p className="page-sub">Latest 100 events across the app</p>

      <div className="panel">
        {!items && <div className="loading-state">Loading activity…</div>}
        {items && items.length === 0 && <div className="empty-state">No activity recorded yet.</div>}
        {items && items.length > 0 && (
          <div className="feed-item feed-header">
            <div className="feed-time">TIME</div>
            <div className="feed-type">TYPE</div>
            <div className="feed-detail">DETAIL</div>
            <div className="feed-user">PERFORMED BY</div>
          </div>
        )}
        {items && items.map((e) => (
          <div className="feed-item" key={e.id}>
            <div className="feed-time">{formatTime(e.created_at)}</div>
            <div className="feed-type">{e.type}</div>
            <div className="feed-detail">{describe(e)}</div>
            {/* user_email is attached server-side to every event (see
                admin_activity in server.py) but is null for events logged
                before the auth-token fix, or for genuinely anonymous
                (logged-out) weather lookups — both shown as "Anonymous"
                rather than blank, so the column always reads clearly. */}
            <div className="feed-user" title={e.user_email || 'Anonymous'}>{e.user_email || 'Anonymous'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
