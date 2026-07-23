const LAST_UPDATED = 'July 23, 2026'
const SUPPORT_EMAIL = 'mahesho.develop@gmail.com'

function Section({ title, children }) {
  return (
    <div className="panel">
      <div className="panel-title">{title}</div>
      <div style={{ color: 'var(--on-surface-2)', fontSize: 13, lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}

export default function Privacy() {
  return (
    <div>
      <h1 className="page-title">Privacy Policy</h1>
      <p className="page-sub">Last updated: {LAST_UPDATED}</p>

      <div className="panel">
        <p style={{ color: 'var(--on-surface-2)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          PushpakWx ("the app," "the service," "we," "us") is an aviation weather and flight logbook
          tool built for student pilots and flight training. This policy explains what information
          the service collects, how it's used, and what choices you have.
        </p>
        <p style={{ color: 'var(--on-surface-2)', fontSize: 14, lineHeight: 1.6, margin: '12px 0 0' }}>
          PushpakWx is currently operated by its developer directly, rather than through a
          registered company. If that changes, this policy will be updated to reflect the
          operating entity.
        </p>
      </div>

      <Section title="1. Information we collect">
        <p style={{ marginTop: 0 }}><strong>Account information</strong> — your email address, a
        one-way hashed password (we never store or can see your actual password), and optionally
        your full name.</p>
        <p><strong>Location and flight data</strong> — coordinates or airport codes when you check
        weather; a detailed GPS track (latitude, longitude, altitude, speed, heading) when you
        record a flight, saved as part of your logbook; aircraft type, registration, your role
        (PIC, dual, or co-pilot), instrument time, and any notes you add. Day/night flight time is
        calculated automatically from your flight's actual GPS track and timing.</p>
        <p><strong>Usage information</strong> — sign-ins, registrations, and weather lookups tied to
        your account. Weather lookups made while signed out are not tied to any account.</p>
        <p><strong>Device sensor data</strong> — while recording a flight, the app reads your
        device's compass and GPS to display heading, altitude, and speed, smoothed for display and
        stored only as part of the flight record you choose to save.</p>
        <p style={{ marginBottom: 0 }}><strong>What we don't collect</strong> — no payment
        information (the app is currently free), and no access to your contacts, photos, or other
        apps.</p>
      </Section>

      <Section title="2. How we use your information">
        <p style={{ marginTop: 0 }}>We use the information above to provide weather data, flight
        tracking, and your logbook; authenticate you and keep your account secure; generate
        DGCA/FAA-format logbook exports on request; understand usage patterns; and send
        account-related emails.</p>
        <p style={{ marginBottom: 0 }}>We do not sell your data, and we do not use it for
        advertising.</p>
      </Section>

      <Section title="3. Emails we send">
        <p style={{ margin: 0 }}>We send emails only for account actions you initiate: verifying
        your email address, resetting your password, and confirming account deletion. These are
        sent through Resend, an email delivery service, which receives your email address and the
        email content solely to deliver these messages.</p>
      </Section>

      <Section title="4. Third-party services we use">
        <p style={{ marginTop: 0 }}>To provide weather data, we send the coordinates or airport
        code you're looking up (not your account information) to Open-Meteo (forecasts),
        aviationweather.gov, operated by the U.S. National Weather Service (METAR/TAF), and
        wttr.in (backup source, used only if the above are unavailable).</p>
        <p style={{ marginBottom: 0 }}>Our infrastructure is provided by MongoDB Atlas (database),
        Render (backend hosting), and Vercel (app and web hosting). Each provider processes data
        on our behalf under their own security and privacy practices.</p>
      </Section>

      <Section title="5. How long we keep your data">
        <p style={{ marginTop: 0 }}>Your account data, flight logs, and preferences are kept for as
        long as your account exists. Verification and reset codes are automatically deleted after
        use or expiry (typically within 5–15 minutes).</p>
        <p style={{ marginBottom: 0 }}>If you delete your account, your flights, preferences,
        favorites, and account details are permanently removed. We retain a minimal record — your
        email address and the date of deletion — so a deletion request can be verified later if a
        dispute or support question arises, along with basic account-lifecycle history (that an
        account was created, signed in, and later deleted) stripped of the location-specific
        details of what was searched. No flight data, GPS tracks, or personal details are kept
        once an account is deleted.</p>
      </Section>

      <Section title="6. Deleting your account">
        <p style={{ margin: 0 }}>You can permanently delete your account and data at any time from
        Settings in the main app. This requires three separate confirmations — your password, a
        typed acknowledgment, and a one-time code sent to your email — before anything is deleted,
        given how irreversible this action is. Once confirmed, your account cannot be recovered.</p>
      </Section>

      <Section title="7. Your choices">
        <p style={{ margin: 0 }}>You can update your preferences at any time in Settings, request a
        password reset, or delete your account and data as described above. If you have questions
        about your data that aren't covered here, contact us at{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="login-link" style={{ fontSize: 13 }}>{SUPPORT_EMAIL}</a>.</p>
      </Section>

      <Section title="8. Children's privacy">
        <p style={{ margin: 0 }}>PushpakWx is intended for use by student pilots and flight
        trainees, and is not directed at children under 13. If you believe a child has provided us
        with personal information, please contact us so we can remove it.</p>
      </Section>

      <Section title="9. Security">
        <p style={{ margin: 0 }}>We use industry-standard practices to protect your data, including
        password hashing, encrypted connections, and account lockout after repeated failed login
        attempts. No service can guarantee absolute security, but we work to keep your information
        protected.</p>
      </Section>

      <Section title="10. Changes to this policy">
        <p style={{ margin: 0 }}>We may update this policy as the service evolves. Material changes
        will be reflected here with an updated date. Continued use of the service after changes
        take effect means you accept the updated policy.</p>
      </Section>

      <Section title="11. Contact">
        <p style={{ margin: 0 }}>Questions about this policy or your data can be sent to{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="login-link" style={{ fontSize: 13 }}>{SUPPORT_EMAIL}</a>.</p>
      </Section>
    </div>
  )
}
