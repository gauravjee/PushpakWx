/**
 * Pilot Portal login screen — a single component covering 5 modes (sign
 * in, register, email verification, forgot-password request, and
 * forgot-password reset), switched via the `mode` state below rather than
 * separate routes/pages. All modes render inside the same .login-card,
 * whose dimensions (360px, 40px padding, 3px top border) are kept in sync
 * with the Main App's login.tsx and the Admin Panel's Login.jsx — update
 * all three together if the shared look changes.
 *
 * Calls the exact same backend auth endpoints as the Main App
 * (see src/api.js), so an account created in one place works in all three.
 */
import { useState } from 'react'
import { login, register, verifyEmail, resendVerification, forgotPassword, resetPassword } from '../api'

// Simple inline SVG eye / eye-off icons (Feather-style paths) — kept
// dependency-free rather than pulling in an icon library for just these two.
function EyeIcon({ off }) {
  return off ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

// Reusable labeled password input + eye toggle, used by every password
// field below (login, register, and both fields in forgot-reset). Each
// caller passes its own show/onToggle state so the login password and the
// two reset-password fields can be shown/hidden independently.
function PasswordField({ label, value, onChange, show, onToggle, autoFocus }) {
  return (
    <div className="login-field">
      <label className="login-label">{label}</label>
      <div className="password-wrap">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          required
          autoFocus={autoFocus}
        />
        <button type="button" className="password-eye-btn" onClick={onToggle} tabIndex={-1}>
          <EyeIcon off={show} />
        </button>
      </div>
    </div>
  )
}

export default function Login({ onLoggedIn }) {
  const [mode, setMode] = useState('login') // login | register | verify | forgot-request | forgot-reset
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  // Shared across modes rather than per-field, since only one mode is ever
  // visible at a time — login/register/new-password reuse showPassword,
  // and showConfirmPassword only applies to forgot-reset's second field.
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
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
      // Backend also clears any account lockout on a successful reset
      // (see reset_password in server.py) — this is the recovery path if
      // repeated failed logins have locked the account.
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
            <PasswordField
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              show={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
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
            <PasswordField
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              show={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
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
            <PasswordField
              label="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              show={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
            <PasswordField
              label="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              show={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((v) => !v)}
            />
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
