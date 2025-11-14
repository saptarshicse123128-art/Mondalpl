import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

function Sidebar({ onLogout }) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Inventory System</h2>
      </div>
      <nav className="sidebar-nav">
        <NavLink
          to="/dashboard/stock"
          className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
        >
          📦 Stock Management
        </NavLink>
        <NavLink
          to="/dashboard/bills"
          className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
        >
          🧾 Bill Generation
        </NavLink>
      </nav>
      <div className="sidebar-footer">
        <button onClick={onLogout} className="logout-button">
          🚪 Logout
        </button>
      </div>
    </div>
  );
}

export default Sidebar;

