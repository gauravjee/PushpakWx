import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
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

function fmtHHMM(minutes) {
  minutes = minutes || 0
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

function buildLogbookRow(f, fmt) {
  const started = new Date(f.started_at)
  const ended = new Date(f.ended_at)
  const totalMin = f.duration_s / 60
  const dayMin = f.day_minutes || 0
  const nightMin = f.night_minutes || 0
  const instrMin = f.instrument_minutes || 0
  const capacity = f.capacity
  const picMin = capacity === 'pic' ? totalMin : 0
  const dualMin = capacity === 'dual' ? totalMin : 0
  const copilotMin = capacity === 'copilot' ? totalMin : 0

  const pad = (n) => String(n).padStart(2, '0')
  const dateUtc = `${started.getUTCFullYear()}-${pad(started.getUTCMonth() + 1)}-${pad(started.getUTCDate())}`
  const blockOff = `${pad(started.getUTCHours())}:${pad(started.getUTCMinutes())}`
  const blockOn = `${pad(ended.getUTCHours())}:${pad(ended.getUTCMinutes())}`
  const route = `${f.dep_icao || '?'} - ${f.arr_icao || '?'}`

  if (fmt === 'dgca') {
    return [dateUtc, f.aircraft_type || '', f.registration || '', f.dep_icao || '', f.arr_icao || '',
      blockOff, blockOn, fmtHHMM(totalMin), fmtHHMM(dayMin), fmtHHMM(nightMin),
      fmtHHMM(picMin), fmtHHMM(copilotMin), fmtHHMM(dualMin), fmtHHMM(instrMin), f.note || '']
  }
  return [dateUtc, f.aircraft_type || '', f.registration || '', route, fmtHHMM(totalMin),
    fmtHHMM(picMin), fmtHHMM(copilotMin), fmtHHMM(dualMin), fmtHHMM(nightMin), fmtHHMM(instrMin), f.note || '']
}

const DGCA_HEADER = ['Date (UTC)', 'Aircraft Type', 'Registration', 'From', 'To', 'Block Off (UTC)', 'Block On (UTC)',
  'Total Time', 'Day', 'Night', 'PIC', 'Co-pilot', 'Dual', 'Instrument', 'Remarks']
const FAA_HEADER = ['Date', 'Aircraft Make/Model', 'Aircraft Ident', 'Route', 'Total Time',
  'PIC', 'SIC', 'Dual Received', 'Night', 'Instrument', 'Remarks']

function csvEscape(value) {
  const s = String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function presetRange(preset, customFrom, customTo) {
  const now = new Date()
  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return { from: start, to: now }
  }
  if (preset === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay())
    start.setHours(0, 0, 0, 0)
    return { from: start, to: now }
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: start, to: now }
  }
  if (preset === 'custom') {
    return {
      from: customFrom ? new Date(customFrom) : null,
      to: customTo ? new Date(customTo + 'T23:59:59') : null,
    }
  }
  return { from: null, to: null } // all time
}

export default function FlightsList() {
  const [flights, setFlights] = useState(null)
  const [error, setError] = useState('')
  const [preset, setPreset] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    getFlights().then(setFlights).catch((e) => setError(e.message))
  }, [])

  const { from, to } = presetRange(preset, customFrom, customTo)

  const matched = useMemo(() => {
    if (!flights) return []
    return flights.filter((f) => {
      const started = new Date(f.started_at)
      if (from && started < from) return false
      if (to && started > to) return false
      return true
    })
  }, [flights, from, to])

  function downloadBlob(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function exportCsv(fmt) {
    const header = fmt === 'dgca' ? DGCA_HEADER : FAA_HEADER
    const rows = matched.map((f) => buildLogbookRow(f, fmt))
    const lines = [header, ...rows].map((r) => r.map(csvEscape).join(','))
    downloadBlob(`logbook-${fmt}.csv`, lines.join('\n'), 'text/csv')
  }

  function exportPdf(fmt) {
    const header = fmt === 'dgca' ? DGCA_HEADER : FAA_HEADER
    const rows = matched.map((f) => buildLogbookRow(f, fmt))
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    doc.setFontSize(14)
    doc.text(`PushpakWx Logbook — ${fmt.toUpperCase()} format`, 30, 30)
    doc.setFontSize(9)
    doc.text(`${rows.length} flight${rows.length === 1 ? '' : 's'}`, 30, 45)
    autoTable(doc, {
      head: [header],
      body: rows,
      startY: 55,
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [255, 159, 10], textColor: [0, 0, 0] },
    })
    doc.save(`logbook-${fmt}.pdf`)
  }

  if (error) return <div className="empty-state">{error}</div>

  return (
    <div>
      <h1 className="page-title">Your Flights</h1>
      <p className="page-sub">{flights ? `${flights.length} logged flight${flights.length === 1 ? '' : 's'}` : 'Loading…'}</p>

      {flights && flights.length > 0 && (
        <div className="panel">
          <div className="panel-title">Export logbook</div>
          <p style={{ color: 'var(--on-surface-2)', fontSize: 12, marginBottom: 12 }}>Choose a range</p>
          <div className="preset-row">
            {[['all', 'All time'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['custom', 'Custom']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`preset-pill ${preset === key ? 'active' : ''}`}
                onClick={() => setPreset(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="date-range-row" style={{ opacity: preset === 'custom' ? 1 : 0.45 }}>
            <div>
              <label className="login-label">From</label>
              <input
                type="date"
                value={customFrom}
                disabled={preset !== 'custom'}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="login-label">To</label>
              <input
                type="date"
                value={customTo}
                disabled={preset !== 'custom'}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          </div>
          <p style={{ color: 'var(--brand)', fontSize: 12, margin: '10px 0 14px' }}>
            {matched.length} flight{matched.length === 1 ? '' : 's'} match this range
          </p>
          <div className="export-grid">
            <button onClick={() => exportCsv('dgca')} disabled={matched.length === 0}>DGCA · CSV</button>
            <button onClick={() => exportPdf('dgca')} disabled={matched.length === 0}>DGCA · PDF</button>
            <button onClick={() => exportCsv('faa')} disabled={matched.length === 0}>FAA · CSV</button>
            <button onClick={() => exportPdf('faa')} disabled={matched.length === 0}>FAA · PDF</button>
          </div>
        </div>
      )}

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
