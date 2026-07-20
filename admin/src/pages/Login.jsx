import { useState } from 'react'
import { login, getOverview, logout } from '../api'

export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(email, password)
      if (!user) throw new Error('Login failed')
      // Confirm this account actually has admin access before entering the app
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
        <input
          id="password"
          className="field-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <div className="error-text">{error}</div>}

        <button className="login-btn" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
