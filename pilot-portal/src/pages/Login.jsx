import { useState } from 'react'
import { login, register, verifyEmail, resendVerification, forgotPassword, resetPassword } from '../api'

export default function Login({ onLoggedIn }) {
  const [mode, setMode] = useState('login') // login | register | verify | forgot-request | forgot-reset
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  function resetMessages() {
    setError('')
    setInfo('')
  }

  async function handleLogin(e) {
    e.preventDefault()
    resetMessages()
    setLoading(true)
    try {
      await login(email, password)
      onLoggedIn()
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e) {
    e.preventDefault()
    resetMessages()
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      await register(email, password, fullName)
      setMode('verify')
      setInfo(`A verification code was sent to ${email}`)
    } catch (err) {
      setError(err.message || 'Could not create account')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e) {
    e.preventDefault()
    resetMessages()
    setLoading(true)
    try {
      await verifyEmail(email, code)
      onLoggedIn()
    } catch (err) {
      setError(err.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    resetMessages()
    try {
      await resendVerification(email)
      setInfo('A new code has been sent')
    } catch (err) {
      setError(err.message || 'Could not resend code')
    }
  }

  async function handleForgotRequest(e) {
    e.preventDefault()
    resetMessages()
    setLoading(true)
    try {
      await forgotPassword(email)
      setMode('forgot-reset')
      setInfo(`If an account exists for ${email}, a reset code has been sent`)
    } catch (err) {
      setError(err.message || 'Could not send reset code')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotReset(e) {
    e.preventDefault()
    resetMessages()
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await resetPassword(email, code, newPassword)
      setMode('login')
      setPassword('')
      setInfo('Password reset — you can now sign in with your new password')
    } catch (err) {
      setError(err.message || 'Could not reset password')
    } finally {
      setLoading(false)
    }
  }

  function switchMode(next) {
    resetMessages()
    setMode(next)
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src="/logo.png" alt="PushpakWx" className="login-logo" />
        <div className="login-title">Pilot Portal</div>

        {mode === 'login' && (
          <form onSubmit={handleLogin}>
            <div className="login-sub">Sign in to view your flight logs</div>
            <div className="login-field">
              <label className="login-label">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="login-field">
              <label className="login-label">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <div className="login-error">{error}</div>}
            {info && <div className="login-info">{info}</div>}
            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <div className="login-link-row">
              <button type="button" className="login-link" onClick={() => switchMode('forgot-request')}>Forgot password?</button>
              <button type="button" className="login-link" onClick={() => switchMode('register')}>Create account</button>
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister}>
            <div className="login-sub">Create your PushpakWx account</div>
            <div className="login-field">
              <label className="login-label">Full name</label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
            </div>
            <div className="login-field">
              <label className="login-label">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="login-field">
              <label className="login-label">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
            <div className="login-link-row">
              <button type="button" className="login-link" onClick={() => switchMode('login')}>Already have an account? Sign in</button>
            </div>
          </form>
        )}

        {mode === 'verify' && (
          <form onSubmit={handleVerify}>
            <div className="login-sub">Enter the code sent to {email}</div>
            <div className="login-field">
              <label className="login-label">Verification code</label>
              <input
                type="text"
                className="otp-input"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
                autoFocus
                maxLength={6}
              />
            </div>
            {error && <div className="login-error">{error}</div>}
            {info && <div className="login-info">{info}</div>}
            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? 'Verifying…' : 'Verify'}
            </button>
            <div className="login-link-row">
              <button type="button" className="login-link" onClick={handleResend}>Resend code</button>
              <button type="button" className="login-link" onClick={() => switchMode('login')}>Back to sign in</button>
            </div>
          </form>
        )}

        {mode === 'forgot-request' && (
          <form onSubmit={handleForgotRequest}>
            <div className="login-sub">Enter your email to reset your password</div>
            <div className="login-field">
              <label className="login-label">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset code'}
            </button>
            <div className="login-link-row">
              <button type="button" className="login-link" onClick={() => switchMode('login')}>Back to sign in</button>
            </div>
          </form>
        )}

        {mode === 'forgot-reset' && (
          <form onSubmit={handleForgotReset}>
            <div className="login-sub">Enter the code sent to {email}, and your new password</div>
            <div className="login-field">
              <label className="login-label">Reset code</label>
              <input
                type="text"
                className="otp-input"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
                autoFocus
                maxLength={6}
              />
            </div>
            <div className="login-field">
              <label className="login-label">New password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </div>
            <div className="login-field">
              <label className="login-label">Confirm new password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            {error && <div className="login-error">{error}</div>}
            {info && <div className="login-info">{info}</div>}
            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? 'Resetting…' : 'Reset password'}
            </button>
            <div className="login-link-row">
              <button type="button" className="login-link" onClick={() => switchMode('login')}>Back to sign in</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
