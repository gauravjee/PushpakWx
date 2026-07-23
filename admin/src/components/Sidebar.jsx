import { NavLink } from 'react-router-dom'

export default function Sidebar() {
  return (
    <div className="sidebar">
      <div className="brand-row">
        <img src="/logo.png" alt="" className="brand-logo" />
        <div>
          <div className="brand">PushpakWx</div>
          <div className="brand-sub">Admin Panel</div>
        </div>
      </div>

      <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
        Overview
      </NavLink>
      <NavLink to="/users" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
        Users
      </NavLink>
      <NavLink to="/activity" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
        Activity
      </NavLink>
    </div>
  )
}
