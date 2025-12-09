import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '../../firebase';
import './Users.css';

function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Real-time listener for users who have logged in
  useEffect(() => {
    try {
      // Query users who have a lastLogin timestamp (meaning they've logged in)
      const q = query(
        collection(db, 'users'),
        where('lastLogin', '!=', null),
        orderBy('lastLogin', 'desc')
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const userList = [];
        snapshot.forEach((doc) => {
          userList.push({
            id: doc.id,
            email: doc.data().email || 'N/A',
            name: doc.data().name || 'N/A',
            role: doc.data().role || 'User',
            lastLogin: doc.data().lastLogin ? new Date(doc.data().lastLogin).toLocaleString('en-IN') : 'Never',
            createdAt: doc.data().createdAt ? new Date(doc.data().createdAt.toDate()).toLocaleString('en-IN') : 'N/A',
            status: doc.data().status || 'Active',
            isOnline: doc.data().isOnline || false
          });
        });
        setUsers(userList);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error('Error fetching users:', error);
      setLoading(false);
    }
  }, []);

  if (loading) {
    return <div className="users-container"><p className="loading">Loading users...</p></div>;
  }

  return (
    <div className="users-container">
      <h2>👥 Logged In Users & Admins</h2>

      {/* Users Stats */}
      <div className="users-stats">
        <div className="stat-card">
          <div className="stat-icon">👤</div>
          <div className="stat-content">
            <h3>Total Logged In</h3>
            <p className="stat-value">{users.length}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🟢</div>
          <div className="stat-content">
            <h3>Currently Online</h3>
            <p className="stat-value">{users.filter(u => u.isOnline).length}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🔐</div>
          <div className="stat-content">
            <h3>Admins</h3>
            <p className="stat-value">{users.filter(u => u.role === 'Admin').length}</p>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="users-section">
        <h3>📋 Logged In Users List</h3>
        {users.length > 0 ? (
          <div className="users-table-wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Online</th>
                  <th>Last Login</th>
                  <th>Joined Date</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, index) => (
                  <tr key={user.id} className={`user-row status-${user.status.toLowerCase()}`}>
                    <td className="rank">{index + 1}</td>
                    <td className="email">{user.email}</td>
                    <td className="name">{user.name}</td>
                    <td className="role">
                      <span className={`role-badge role-${user.role.toLowerCase()}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="status">
                      <span className={`status-badge status-${user.status.toLowerCase()}`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="online">
                      <span className={`online-badge ${user.isOnline ? 'online' : 'offline'}`}>
                        {user.isOnline ? '🟢 Online' : '⚪ Offline'}
                      </span>
                    </td>
                    <td className="last-login">{user.lastLogin}</td>
                    <td className="created-at">{user.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="no-data">No users have logged in yet</p>
        )}
      </div>
    </div>
  );
}

export default Users;
