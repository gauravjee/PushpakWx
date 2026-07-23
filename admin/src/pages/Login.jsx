/**
 * Admin Panel login screen. Uses the same backend login endpoint as the
 * Main App and Pilot Portal, but additionally confirms admin access via
 * getOverview() before letting the user in — a non-admin account can
 * authenticate successfully but shouldn't reach this dashboard.
 *
 * Card dimensions (360px, 40px padding, 3px top border) are kept in sync
 * with the Main App's login.tsx and Pilot Portal's Login.jsx.
 */
import { useState } from 'react'
import { login, getOverview, logout } from '../api'

// Simple inline SVG eye / eye-off icons — same approach as the Pilot
// Portal's Login.jsx, kept dependency-free rather than adding an icon
// library for just these two.
function EyeIcon({ off }) {
  return off ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(email, password)
      if (!user) throw new Error('Login failed')
      // Confirm this account actually has admin access before entering the app —
      // login() alone succeeds for any valid account, admin or not.
      await getOverview()
      onLoggedIn(user)
    } catch (err) {
      logout()
      setError(err.status === 403 ? 'This account does not have admin access.' : err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src="/logo.png" alt="PushpakWx" className="login-logo" />
        <div className="login-title">PushpakWx Admin</div>
        <div className="login-sub">Sign in with your admin account</div>

        <label className="field-label" htmlFor="email">Email</label>
        <input
          id="email"
          className="field-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label className="field-label" htmlFor="password">Password</label>
        <div className="password-wrap">
          <input
            id="password"
            className="field-input"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="button" className="password-eye-btn" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}>
            <EyeIcon off={showPassword} />
          </button>
        </div>

        {error && <div className="error-text">{error}</div>}

        <button className="login-btn" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
