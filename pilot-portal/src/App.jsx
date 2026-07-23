import { useState } from 'react'
import { HashRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { isLoggedIn, logout, getStoredUser } from './api'
import Login from './pages/Login'
import Overview from './pages/Overview'
import FlightsList from './pages/FlightsList'
import FlightDetail from './pages/FlightDetail'
import FlightsMap from './pages/FlightsMap'
import About from './pages/About'
import Privacy from './pages/Privacy'

function Topbar({ onLogout }) {
  const user = getStoredUser()
  return (
    <div className="topbar">
      <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="topbar-brand">
          <img src="/logo.png" alt="" className="topbar-logo" />
          <div>
            <div className="topbar-title">PushpakWx</div>
            <div className="topbar-sub">Pilot Portal</div>
          </div>
        </div>
      </Link>
      <div className="topbar-actions">
        {user && <div className="topbar-user">{user.full_name || user.email}</div>}
        <button className="secondary" onClick={onLogout}>Sign out</button>
      </div>
    </div>
  )
}

function NavTabs() {
  const location = useLocation()
  const isActive = (path) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path))
  return (
    <div className="nav-tabs">
      <Link to="/" className={`nav-tab ${isActive('/') ? 'active' : ''}`}>Overview</Link>
      <Link to="/logbook" className={`nav-tab ${isActive('/logbook') ? 'active' : ''}`}>Logbook</Link>
      <Link to="/maps" className={`nav-tab ${isActive('/maps') ? 'active' : ''}`}>Maps</Link>
      <Link to="/about" className={`nav-tab ${isActive('/about') ? 'active' : ''}`}>About</Link>
    </div>
  )
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())

  if (!loggedIn) {
    return <Login onLoggedIn={() => setLoggedIn(true)} />
  }

  return (
    <HashRouter>
      <div>
        <div className="watermark" />
        <Topbar onLogout={() => { logout(); setLoggedIn(false) }} />
        <NavTabs />
        <div className="main">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/logbook" element={<FlightsList />} />
            <Route path="/flights/:id" element={<FlightDetail />} />
            <Route path="/maps" element={<FlightsMap />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  )
}
