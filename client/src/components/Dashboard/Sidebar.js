import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

function Sidebar({ onLogout, isOpen, onClose }) {
  const handleNavClick = () => {
    if (window.innerWidth <= 768 && onClose) {
      onClose();
    }
  };

  return (
    <div className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-header">
        <h2>Inventory System</h2>
      </div>
      <nav className="sidebar-nav">
        <NavLink
          to="/dashboard/analytics"
          className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          onClick={handleNavClick}
        >
          📊 Analytics
        </NavLink>
        <NavLink
          to="/dashboard/stock"
          className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          onClick={handleNavClick}
        >
          📦 Stock Management
        </NavLink>
        <NavLink
          to="/dashboard/bills"
          className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          onClick={handleNavClick}
        >
          🧾 Bill Generation
        </NavLink>
        <NavLink
          to="/dashboard/categories"
          className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          onClick={handleNavClick}
        >
          🏷️ Categories
        </NavLink>
        <NavLink
          to="/dashboard/users"
          className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          onClick={handleNavClick}
        >
          👥 Users
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

