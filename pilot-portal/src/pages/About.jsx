// __APP_VERSION__ is a build-time constant injected by vite.config.js,
// reading directly from package.json — always accurate, never needs
// manual updating on release (unlike a hardcoded version string, which
// is exactly the kind of thing that went stale once already this project).
import { Link } from 'react-router-dom'

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''

const BENEFITS = [
  {
    title: 'Real aviation weather, not a generic forecast',
    detail: 'Live METAR and TAF straight from official aviation sources, plus flight-category (VFR/MVFR/IFR/LIFR) assessment for any airport.',
  },
  {
    title: 'Runway-aware wind calculator',
    detail: 'Headwind and crosswind components computed against the actual runways at your airport, not a generic manual entry.',
  },
  {
    title: 'In-flight tracking built for training',
    detail: 'Live heading, altitude, speed, and climb rate, with sensor smoothing to keep readings steady in a real cockpit.',
  },
  {
    title: 'A logbook that meets DGCA and FAA standards',
    detail: 'Day/night time computed automatically from your actual flight, with proper aircraft, registration, and pilot-capacity tracking — exportable in either format.',
  },
  {
    title: 'Your flights, reviewable anywhere',
    detail: 'This Pilot Portal gives you the same logbook and flight history from any browser, not just your phone.',
  },
]

export default function About() {
  return (
    <div>
      <h1 className="page-title">About PushpakWx</h1>
      <p className="page-sub">Aviation weather and flight logbook, built for student pilots and flight training</p>

      <div className="panel">
        <div className="panel-title">What PushpakWx does</div>
        <p style={{ color: 'var(--on-surface-2)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          PushpakWx brings together real aviation weather, in-flight tracking, and a DGCA/FAA-compliant
          logbook in one place — built for student pilots and flight training, and usable at any airport
          worldwide. The Main App runs on Android and in the browser for day-to-day flying; this Pilot
          Portal gives you the same logbook and flight history from any browser afterward.
        </p>
      </div>

      <div className="panel">
        <div className="panel-title">Why pilots use it</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {BENEFITS.map((b) => (
            <div key={b.title}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{b.title}</div>
              <div style={{ color: 'var(--on-surface-2)', fontSize: 13, lineHeight: 1.5 }}>{b.detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Get PushpakWx</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Web app</div>
              <div style={{ color: 'var(--on-surface-2)', fontSize: 13 }}>Works on any device, no install needed</div>
            </div>
            <a href="https://pushpakwx.vercel.app" target="_blank" rel="noreferrer" className="login-link" style={{ fontSize: 13 }}>
              pushpakwx.vercel.app
            </a>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Android app</div>
              <div style={{ color: 'var(--on-surface-2)', fontSize: 13 }}>Coming soon to Google Play</div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Version</div>
        <div style={{ color: 'var(--on-surface-2)', fontSize: 13 }}>
          Pilot Portal {APP_VERSION ? `v${APP_VERSION}` : ''}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Legal</div>
        <Link to="/privacy" className="login-link" style={{ fontSize: 13 }}>Privacy Policy</Link>
      </div>
    </div>
  )
}
