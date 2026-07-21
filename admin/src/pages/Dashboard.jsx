import { useEffect, useState } from 'react'
import { getOverview, importAirports, importRunways, addAirportManually } from '../api'
import StatCard from '../components/StatCard'
import BarChart from '../components/BarChart'

const EMPTY_AIRPORT = { icao: '', name: '', city: '', country: '', lat: '', lon: '', elevation_ft: '', runway_idents: '' }

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState('')
  const [importingRunways, setImportingRunways] = useState(false)
  const [runwayResult, setRunwayResult] = useState(null)
  const [runwayError, setRunwayError] = useState('')
  const [newAirport, setNewAirport] = useState(EMPTY_AIRPORT)
  const [savingAirport, setSavingAirport] = useState(false)
  const [airportSaveResult, setAirportSaveResult] = useState(null)
  const [airportSaveError, setAirportSaveError] = useState('')

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

  async function handleImportRunways() {
    setImportingRunways(true)
    setRunwayError('')
    setRunwayResult(null)
    try {
      const result = await importRunways()
      setRunwayResult(result)
    } catch (e) {
      setRunwayError(e.message)
    } finally {
      setImportingRunways(false)
    }
  }

  async function handleAddAirport(e) {
    e.preventDefault()
    setSavingAirport(true)
    setAirportSaveError('')
    setAirportSaveResult(null)
    try {
      const payload = {
        icao: newAirport.icao.trim().toUpperCase(),
        name: newAirport.name.trim(),
        city: newAirport.city.trim() || null,
        country: newAirport.country.trim() || null,
        lat: parseFloat(newAirport.lat),
        lon: parseFloat(newAirport.lon),
        elevation_ft: newAirport.elevation_ft ? parseInt(newAirport.elevation_ft, 10) : null,
        runway_idents: newAirport.runway_idents
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      }
      if (!payload.icao || !payload.name || isNaN(payload.lat) || isNaN(payload.lon)) {
        throw new Error('ICAO code, name, latitude, and longitude are all required.')
      }
      const result = await addAirportManually(payload)
      setAirportSaveResult(result)
      setNewAirport(EMPTY_AIRPORT)
    } catch (err) {
      setAirportSaveError(err.message)
    } finally {
      setSavingAirport(false)
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

        <div style={{ height: 1, background: 'var(--line)', margin: '16px 0' }} />

        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
          Adds real runway data (~41,000 airports) so the runway wind calculator shows an
          airport's actual runways instead of a generic manual entry. Run this after importing
          airports above. Safe to re-run.
        </p>
        <button onClick={handleImportRunways} disabled={importingRunways}>
          {importingRunways ? 'Importing… this can take up to a minute' : 'Import runway database'}
        </button>
        {runwayResult && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--accent-ok, #4ade80)' }}>
            Done — {runwayResult.total_airports_with_runways} airports now have runway data.
          </div>
        )}
        {runwayError && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--accent-bad, #f87171)' }}>
            {runwayError}
          </div>
        )}

        <div style={{ height: 1, background: 'var(--line)', margin: '16px 0' }} />

        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
          Some smaller training airfields (especially in India) aren't in the free public
          dataset at all — usually because they don't have an official ICAO code on file, even
          if the flying community uses one informally. Add those here manually, with coordinates
          you look up from a chart or the AIP. Safe to re-run for the same ICAO — it updates
          rather than duplicates.
        </p>
        <form onSubmit={handleAddAirport} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 480 }}>
          <input
            placeholder="ICAO code (e.g. VASR)"
            value={newAirport.icao}
            onChange={(e) => setNewAirport({ ...newAirport, icao: e.target.value })}
            required
          />
          <input
            placeholder="Airport name"
            value={newAirport.name}
            onChange={(e) => setNewAirport({ ...newAirport, name: e.target.value })}
            required
          />
          <input
            placeholder="City"
            value={newAirport.city}
            onChange={(e) => setNewAirport({ ...newAirport, city: e.target.value })}
          />
          <input
            placeholder="Country (e.g. IN)"
            value={newAirport.country}
            onChange={(e) => setNewAirport({ ...newAirport, country: e.target.value })}
          />
          <input
            placeholder="Latitude"
            type="number"
            step="any"
            value={newAirport.lat}
            onChange={(e) => setNewAirport({ ...newAirport, lat: e.target.value })}
            required
          />
          <input
            placeholder="Longitude"
            type="number"
            step="any"
            value={newAirport.lon}
            onChange={(e) => setNewAirport({ ...newAirport, lon: e.target.value })}
            required
          />
          <input
            placeholder="Elevation (ft, optional)"
            type="number"
            value={newAirport.elevation_ft}
            onChange={(e) => setNewAirport({ ...newAirport, elevation_ft: e.target.value })}
          />
          <input
            placeholder="Runway idents, comma-separated (e.g. 09, 27)"
            value={newAirport.runway_idents}
            onChange={(e) => setNewAirport({ ...newAirport, runway_idents: e.target.value })}
            style={{ gridColumn: '1 / -1' }}
          />
          <button type="submit" disabled={savingAirport} style={{ gridColumn: '1 / -1' }}>
            {savingAirport ? 'Saving…' : 'Add / Update Airport'}
          </button>
        </form>
        {airportSaveResult && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--accent-ok, #4ade80)' }}>
            Saved — {airportSaveResult.icao} is now searchable in the app
            {airportSaveResult.runways_added > 0 ? ` with ${airportSaveResult.runways_added} runway(s).` : '.'}
          </div>
        )}
        {airportSaveError && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--accent-bad, #f87171)' }}>
            {airportSaveError}
          </div>
        )}
      </div>
    </div>
  )
}
