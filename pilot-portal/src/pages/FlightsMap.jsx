import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { getFlights, getFlight } from '../api'

const ROUTE_COLORS = ['#FF9F0A', '#0A84FF', '#32D74B', '#BF5AF2', '#FF453A', '#FFD60A', '#64D2FF', '#FF6482']

export default function FlightsMap() {
  const [flights, setFlights] = useState(null)
  const [detailed, setDetailed] = useState(null)
  const [error, setError] = useState('')
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)

  useEffect(() => {
    getFlights().then(setFlights).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!flights) return
    if (flights.length === 0) {
      setDetailed([])
      return
    }
    Promise.all(flights.map((f) => getFlight(f.id).catch(() => null)))
      .then((results) => setDetailed(results.filter((r) => r && (r.samples || []).length >= 2)))
      .catch((e) => setError(e.message))
  }, [flights])

  useEffect(() => {
    if (!detailed || !mapRef.current || mapInstanceRef.current) return
    if (detailed.length === 0) return

    const map = L.map(mapRef.current, { attributionControl: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)

    const allBounds = []
    detailed.forEach((f, i) => {
      const color = ROUTE_COLORS[i % ROUTE_COLORS.length]
      const latlngs = f.samples.map((s) => [s.lat, s.lon])
      const path = L.polyline(latlngs, { color, weight: 3, opacity: 0.85 })
        .addTo(map)
        .bindTooltip(`${f.dep_icao || '???'} → ${f.arr_icao || '???'}`)
      allBounds.push(path.getBounds())
    })

    if (allBounds.length > 0) {
      let combined = allBounds[0]
      allBounds.forEach((b) => { combined = combined.extend(b) })
      map.fitBounds(combined, { padding: [24, 24] })
    }

    mapInstanceRef.current = map
    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [detailed])

  if (error) return <div className="empty-state">{error}</div>

  return (
    <div>
      <h1 className="page-title">All Flights Map</h1>
      <p className="page-sub">Every logged flight path, overlaid on one map</p>

      {(!flights || !detailed) && <div className="loading-state">Loading flight paths…</div>}

      {detailed && detailed.length === 0 && (
        <div className="panel">
          <div className="empty-state">No flight tracks available yet to show on a map.</div>
        </div>
      )}

      {detailed && detailed.length > 0 && (
        <div className="panel">
          <div className="map-container" style={{ height: 480 }} ref={mapRef} />
          <div className="attribution">Map data © OpenStreetMap contributors</div>
          <div className="legend-row">
            {detailed.map((f, i) => (
              <div className="legend-item" key={f.id}>
                <span className="legend-dot" style={{ background: ROUTE_COLORS[i % ROUTE_COLORS.length] }} />
                {f.dep_icao || '???'} → {f.arr_icao || '???'}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
