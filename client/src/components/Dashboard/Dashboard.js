import React, { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Sidebar from './Sidebar';
import StockManagement from './StockManagement';
import BillGeneration from './BillGeneration';
import Analytics from './Analytics';
import CategoryManagement from './CategoryManagement';
import Users from './Users';
import './Dashboard.css';

function Dashboard() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Map routes to page names
  const getPageName = () => {
    const path = location.pathname;
    if (path.includes('/analytics') || path === '/dashboard' || path === '/dashboard/') {
      return 'Analytics';
    } else if (path.includes('/stock')) {
      return 'Stock Management';
    } else if (path.includes('/bills')) {
      return 'Bill Generation';
    } else if (path.includes('/categories')) {
      return 'Categories';
    } else if (path.includes('/users')) {
      return 'Users';
    }
    return 'Dashboard';
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div className="dashboard-container">
      <Sidebar onLogout={handleLogout} isOpen={isSidebarOpen} onClose={closeSidebar} />
      {isSidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar}></div>}
      <div className="dashboard-content">
        <div className="dashboard-header">
          <button className="hamburger-menu" onClick={toggleSidebar} aria-label="Toggle menu">
            <span></span>
            <span></span>
            <span></span>
          </button>
          <h1 className="desktop-title">Dashboard</h1>
          <h1 className="mobile-title">{getPageName()}</h1>
          <div className="user-info desktop-user-info">
            <span>Welcome, {currentUser?.email}</span>
          </div>
        </div>
        <div className="dashboard-main">
          <Routes>
            <Route path="/" element={<Analytics />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="stock" element={<StockManagement />} />
            <Route path="categories" element={<CategoryManagement />} />
            <Route path="bills" element={<BillGeneration />} />
            <Route path="users" element={<Users />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

