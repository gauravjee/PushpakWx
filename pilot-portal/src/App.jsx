import { useState } from 'react'
import { HashRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { isLoggedIn, logout } from './api'
import Login from './pages/Login'
import FlightsList from './pages/FlightsList'
import FlightDetail from './pages/FlightDetail'

function Topbar({ onLogout }) {
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
      <button className="secondary" onClick={onLogout}>Sign out</button>
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
        <Topbar onLogout={() => { logout(); setLoggedIn(false) }} />
        <div className="main">
          <Routes>
            <Route path="/" element={<FlightsList />} />
            <Route path="/flights/:id" element={<FlightDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  )
}
