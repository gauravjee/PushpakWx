import { NavLink } from 'react-router-dom'
import { logout } from '../api'

export default function Sidebar({ email, onLogout }) {
  return (
    <div className="sidebar">
      <div className="brand">PushpakWx</div>
      <div className="brand-sub">Admin Panel</div>

      <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
        Overview
      </NavLink>
      <NavLink to="/users" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
        Users
      </NavLink>
      <NavLink to="/activity" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
        Activity
      </NavLink>

      <div className="sidebar-footer">
        <div className="sidebar-email">{email}</div>
        <button
          className="logout-btn"
          onClick={() => {
            logout()
            onLogout()
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
