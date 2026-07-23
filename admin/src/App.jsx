import { useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isLoggedIn, logout } from './api'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import Activity from './pages/Activity'

export default function App() {
  const [user, setUser] = useState(null)
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())

  if (!loggedIn) {
    return (
      <Login
        onLoggedIn={(u) => {
          setUser(u)
          setLoggedIn(true)
        }}
      />
    )
  }

  return (
    <HashRouter>
      <div className="app-shell">
        <div className="watermark" />
        <Sidebar />
        <div className="main">
          <div className="admin-topbar">
            {user?.email && <div className="admin-topbar-email">{user.email}</div>}
            <button
              className="logout-btn"
              onClick={() => {
                logout()
                setLoggedIn(false)
              }}
            >
              Sign out
            </button>
          </div>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/users" element={<Users />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  )
}
