import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import L from 'leaflet'
import { Chart } from 'chart.js/auto'
import { jsPDF } from 'jspdf'
import { getFlight, downloadExport } from '../api'

function formatDuration(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function FlightDetail() {
  const { id } = useParams()
  const [flight, setFlight] = useState(null)
  const [error, setError] = useState('')
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  useEffect(() => {
    getFlight(id).then(setFlight).catch((e) => setError(e.message))
  }, [id])

  // Leaflet map
  useEffect(() => {
    if (!flight || !mapRef.current || mapInstanceRef.current) return
    const samples = flight.samples || []
    if (samples.length < 2) return

    const map = L.map(mapRef.current, { attributionControl: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)

    const latlngs = samples.map((s) => [s.lat, s.lon])
    const path = L.polyline(latlngs, { color: '#FF9F0A', weight: 3 }).addTo(map)
    L.circleMarker(latlngs[0], { radius: 6, color: '#32D74B', fillColor: '#32D74B', fillOpacity: 1 })
      .addTo(map).bindTooltip('Start')
    L.circleMarker(latlngs[latlngs.length - 1], { radius: 6, color: '#FF9F0A', fillColor: '#FF9F0A', fillOpacity: 1 })
      .addTo(map).bindTooltip('End')

    map.fitBounds(path.getBounds(), { padding: [24, 24] })
    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [flight])

  // Chart.js altitude/speed chart
  useEffect(() => {
    if (!flight || !chartRef.current) return
    const samples = flight.samples || []
    if (samples.length < 2) return

    const t0 = samples[0].t
    const labels = samples.map((s) => ((s.t - t0) / 60000).toFixed(1))

    if (chartInstanceRef.current) chartInstanceRef.current.destroy()
    chartInstanceRef.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Altitude (ft)',
            data: samples.map((s) => s.alt_ft),
            borderColor: '#FF9F0A',
            backgroundColor: '#FF9F0A22',
            yAxisID: 'y',
            pointRadius: 0,
            tension: 0.2,
          },
          {
            label: 'Speed (kt)',
            data: samples.map((s) => s.speed_kt),
            borderColor: '#0A84FF',
            backgroundColor: '#0A84FF22',
            yAxisID: 'y1',
            pointRadius: 0,
            tension: 0.2,
          },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#FFFFFF' } },
        },
        scales: {
          x: { title: { display: true, text: 'Minutes elapsed', color: '#A1A6AB' }, ticks: { color: '#8A9198' }, grid: { color: '#2A2F35' } },
          y: { position: 'left', title: { display: true, text: 'Altitude (ft)', color: '#FF9F0A' }, ticks: { color: '#8A9198' }, grid: { color: '#2A2F35' } },
          y1: { position: 'right', title: { display: true, text: 'Speed (kt)', color: '#0A84FF' }, ticks: { color: '#8A9198' }, grid: { drawOnChartArea: false } },
        },
      },
    })

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy()
        chartInstanceRef.current = null
      }
    }
  }, [flight])

  function downloadChartPng() {
    if (!chartRef.current) return
    const url = chartRef.current.toDataURL('image/png', 1.0)
    const a = document.createElement('a')
    a.href = url
    a.download = `flight-${id.slice(0, 8)}-chart.png`
    a.click()
  }

  function downloadChartPdf() {
    if (!chartRef.current) return
    const imgData = chartRef.current.toDataURL('image/png', 1.0)
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imgW = pageWidth - 60
    const imgH = (chartRef.current.height / chartRef.current.width) * imgW
    pdf.setFontSize(14)
    pdf.text(`PushpakWx Flight Chart — ${flight.dep_icao || '???'} to ${flight.arr_icao || '???'}`, 30, 30)
    pdf.addImage(imgData, 'PNG', 30, 45, imgW, Math.min(imgH, pageHeight - 80))
    pdf.save(`flight-${id.slice(0, 8)}-chart.pdf`)
  }

  if (error) return <div className="empty-state">{error}</div>
  if (!flight) return <div className="loading-state">Loading flight…</div>

  const hasTrack = (flight.samples || []).length >= 2

  return (
    <div>
      <Link to="/logbook" className="back-link">← Back to flights</Link>
      <h1 className="page-title">{flight.dep_icao || '???'} → {flight.arr_icao || '???'}</h1>
      <p className="page-sub">{new Date(flight.started_at).toLocaleString()}</p>

      <div className="detail-stat-grid">
        <div className="detail-stat">
          <div className="detail-stat-value">{flight.distance_nm?.toFixed(1) ?? '—'}</div>
          <div className="detail-stat-label">Distance (nm)</div>
        </div>
        <div className="detail-stat">
          <div className="detail-stat-value">{Math.round(flight.max_alt_ft ?? 0)}</div>
          <div className="detail-stat-label">Max Alt (ft)</div>
        </div>
        <div className="detail-stat">
          <div className="detail-stat-value">{flight.avg_speed_kt?.toFixed(0) ?? '—'}</div>
          <div className="detail-stat-label">Avg Speed (kt)</div>
        </div>
        <div className="detail-stat">
          <div className="detail-stat-value">{flight.max_speed_kt?.toFixed(0) ?? '—'}</div>
          <div className="detail-stat-label">Max Speed (kt)</div>
        </div>
        <div className="detail-stat">
          <div className="detail-stat-value">{formatDuration(flight.duration_s ?? 0)}</div>
          <div className="detail-stat-label">Duration</div>
        </div>
      </div>

      {hasTrack ? (
        <>
          <div className="panel">
            <div className="panel-title">Flight Path</div>
            <div className="map-container" ref={mapRef} />
            <div className="attribution">Map data © OpenStreetMap contributors</div>
          </div>

          <div className="panel">
            <div className="panel-title">Altitude &amp; Speed</div>
            <canvas ref={chartRef} height="90" />
            <div className="download-row">
              <button className="ghost" onClick={downloadChartPng}>Download Chart (PNG)</button>
              <button className="ghost" onClick={downloadChartPdf}>Download Chart (PDF)</button>
            </div>
          </div>
        </>
      ) : (
        <div className="panel"><div className="empty-state">Not enough recorded samples to show a track for this flight.</div></div>
      )}

      <div className="panel">
        <div className="panel-title">Logs</div>
        <div className="download-row">
          <button onClick={() => downloadExport(id, 'csv')}>Download Log (CSV)</button>
          <button className="secondary" onClick={() => downloadExport(id, 'geojson')}>Download Log (GeoJSON)</button>
        </div>
      </div>
    </div>
  )
}
