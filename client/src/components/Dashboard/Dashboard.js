import React, { useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
          <h1>Dashboard</h1>
          <div className="user-info">
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

