import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import './Sidebar.css';

function Sidebar({ onLogout, isOpen, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isGstOpen, setIsGstOpen] = useState(
    location.pathname.includes('/gst-bills') || location.pathname.includes('/gst-parties') || location.pathname.includes('/gst-history')
  );

  useEffect(() => {
    if (location.pathname.includes('/gst-bills') || location.pathname.includes('/gst-parties') || location.pathname.includes('/gst-history')) {
      setIsGstOpen(true);
    }
  }, [location.pathname]);

  const handleNavClick = (e, to) => {
    // If clicking the same active tab, just close menu and do nothing
    if (location.pathname === to) {
      if (onClose) onClose();
      return;
    }

    if ((location.pathname === '/dashboard/bills' && localStorage.getItem('billGenerationUnsaved') === 'true') ||
        (location.pathname === '/dashboard/gst-bills' && localStorage.getItem('gstBillGenerationUnsaved') === 'true')) {
      e.preventDefault(); // Stop navigation
      const isGst = location.pathname === '/dashboard/gst-bills';
      const confirmLeave = window.confirm("Are you sure you want to leave? Your unsaved billing data will be lost.");
      if (confirmLeave) {
        const saveDraft = window.confirm("Do you want to save this bill as a draft?");
        if (saveDraft) {
          // Dispatch custom event to let BillGeneration / GstBillGeneration save the draft, then redirect
          window.dispatchEvent(new CustomEvent(isGst ? 'triggerSaveGstDraft' : 'triggerSaveDraft', { detail: { nextPath: to } }));
        } else {
          // Clear unsaved flag and navigate
          localStorage.removeItem(isGst ? 'gstBillGenerationUnsaved' : 'billGenerationUnsaved');
          if (onClose) onClose();
          navigate(to);
        }
      }
    } else {
      if (onClose) onClose();
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
          onClick={(e) => handleNavClick(e, '/dashboard/analytics')}
        >
          📊 Analytics
        </NavLink>
        <NavLink
          to="/dashboard/purchase"
          className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          onClick={(e) => handleNavClick(e, '/dashboard/purchase')}
        >
          🧾 Purchase Order
        </NavLink>
        <NavLink
          to="/dashboard/stock"
          className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          onClick={(e) => handleNavClick(e, '/dashboard/stock')}
        >
          📦 Stock Management
        </NavLink>
        <NavLink
          to="/dashboard/bills"
          className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          onClick={(e) => handleNavClick(e, '/dashboard/bills')}
        >
          🧾 Bill Generation
        </NavLink>

        {/* GST Dropdown */}
        <div className="dropdown-container">
          <button
            type="button"
            className={`nav-item dropdown-toggle ${(location.pathname.includes('/gst-bills') || location.pathname.includes('/gst-parties') || location.pathname.includes('/gst-history')) ? 'active' : ''}`}
            onClick={() => setIsGstOpen(!isGstOpen)}
          >
            <span>💼 GST</span>
            <span className={`dropdown-arrow ${isGstOpen ? 'open' : ''}`}>▶</span>
          </button>
          {isGstOpen && (
            <div className="dropdown-menu-list">
              <NavLink
                to="/dashboard/gst-bills"
                className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
                onClick={(e) => handleNavClick(e, '/dashboard/gst-bills')}
              >
                📝 GST Bill Gen.
              </NavLink>
              <NavLink
                to="/dashboard/gst-parties"
                className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
                onClick={(e) => handleNavClick(e, '/dashboard/gst-parties')}
              >
                🏢 Party Mgmt.
              </NavLink>
              <NavLink
                to="/dashboard/gst-history"
                className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
                onClick={(e) => handleNavClick(e, '/dashboard/gst-history')}
              >
                📜 GST History
              </NavLink>
            </div>
          )}
        </div>

        <NavLink
          to="/dashboard/categories"
          className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          onClick={(e) => handleNavClick(e, '/dashboard/categories')}
        >
          🏷️ Brands & Categories
        </NavLink>
        <NavLink
          to="/dashboard/users"
          className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          onClick={(e) => handleNavClick(e, '/dashboard/users')}
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

