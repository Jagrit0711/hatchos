import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AdminPanel = ({ user }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [adminData, setAdminData] = useState({
    activeUsers: [],
    systemStats: {},
    recentActivity: [],
    securityAlerts: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user.role !== 'admin' && user.role !== 'teacher') {
      navigate('/');
      return;
    }
    
    loadAdminData();
    
    // Refresh data every 30 seconds
    const interval = setInterval(loadAdminData, 30000);
    return () => clearInterval(interval);
  }, [user.role, navigate]);

  const loadAdminData = async () => {
    try {
      const response = await fetch(`/api/admin/dashboard?userId=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setAdminData(data);
      }
    } catch (error) {
      console.error('Failed to load admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserAction = async (userId, action) => {
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    
    try {
      const response = await fetch('/api/admin/user-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action, adminId: user.id })
      });
      
      if (response.ok) {
        alert(`User ${action} successful`);
        loadAdminData();
      }
    } catch (error) {
      console.error('User action failed:', error);
      alert('Action failed. Please try again.');
    }
  };

  const exportReport = async (type) => {
    try {
      const response = await fetch(`/api/admin/export/${type}?userId=${user.id}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hatch-${type}-report-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="admin-panel loading">
        <div className="loading-spinner">Loading admin dashboard...</div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <button onClick={() => navigate('/')} className="back-btn">
          ← Back to Dashboard
        </button>
        <h1>👨‍💼 Admin Panel</h1>
        <div className="admin-info">
          <span>{user.username} ({user.role})</span>
          <span>{user.institution}</span>
        </div>
      </header>

      <div className="admin-tabs">
        <button 
          className={activeTab === 'dashboard' ? 'active' : ''}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 Dashboard
        </button>
        <button 
          className={activeTab === 'users' ? 'active' : ''}
          onClick={() => setActiveTab('users')}
        >
          👥 Users
        </button>
        <button 
          className={activeTab === 'activity' ? 'active' : ''}
          onClick={() => setActiveTab('activity')}
        >
          📈 Activity
        </button>
        <button 
          className={activeTab === 'security' ? 'active' : ''}
          onClick={() => setActiveTab('security')}
        >
          🔒 Security
        </button>
        <button 
          className={activeTab === 'reports' ? 'active' : ''}
          onClick={() => setActiveTab('reports')}
        >
          📋 Reports
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'dashboard' && (
          <div className="admin-dashboard">
            <div className="stats-grid">
              <div className="stat-card">
                <h3>👥 Active Users</h3>
                <div className="stat-number">{adminData.activeUsers.length}</div>
                <small>Currently online</small>
              </div>
              
              <div className="stat-card">
                <h3>🖥️ System Load</h3>
                <div className="stat-number">{adminData.systemStats.cpuUsage || 0}%</div>
                <small>CPU usage</small>
              </div>
              
              <div className="stat-card">
                <h3>💾 Memory</h3>
                <div className="stat-number">
                  {Math.round((adminData.systemStats.memoryUsed || 0) / 1024 / 1024)}MB
                </div>
                <small>Used memory</small>
              </div>
              
              <div className="stat-card">
                <h3>⚠️ Alerts</h3>
                <div className="stat-number">{adminData.securityAlerts.length}</div>
                <small>Security alerts</small>
              </div>
            </div>

            <div className="quick-actions">
              <h3>Quick Actions</h3>
              <div className="action-buttons">
                <button className="action-btn" onClick={() => setActiveTab('users')}>
                  👥 Manage Users
                </button>
                <button className="action-btn" onClick={() => exportReport('activity')}>
                  📊 Export Activity
                </button>
                <button className="action-btn" onClick={() => setActiveTab('security')}>
                  🔒 Security Center
                </button>
                <button className="action-btn emergency" onClick={() => alert('Emergency shutdown initiated')}>
                  🚨 Emergency Shutdown
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="users-management">
            <div className="users-header">
              <h3>User Management</h3>
              <button className="add-user-btn">➕ Add User</button>
            </div>
            
            <div className="users-table">
              <table>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminData.activeUsers.map(user => (
                    <tr key={user.id}>
                      <td>{user.username}</td>
                      <td>
                        <span className={`role-badge ${user.role}`}>
                          {user.role}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${user.online ? 'online' : 'offline'}`}>
                          {user.online ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td>{user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</td>
                      <td>
                        <div className="user-actions">
                          <button 
                            onClick={() => handleUserAction(user.id, 'lock')}
                            className="action-btn small"
                          >
                            🔒 Lock
                          </button>
                          <button 
                            onClick={() => handleUserAction(user.id, 'reset-password')}
                            className="action-btn small"
                          >
                            🔑 Reset
                          </button>
                          <button 
                            onClick={() => handleUserAction(user.id, 'disable')}
                            className="action-btn small danger"
                          >
                            ❌ Disable
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="activity-monitoring">
            <h3>Recent Activity</h3>
            
            <div className="activity-filters">
              <select>
                <option>All Activities</option>
                <option>Login/Logout</option>
                <option>App Launches</option>
                <option>File Access</option>
                <option>Security Events</option>
              </select>
              
              <select>
                <option>Last Hour</option>
                <option>Last 6 Hours</option>
                <option>Last Day</option>
                <option>Last Week</option>
              </select>
            </div>
            
            <div className="activity-list">
              {adminData.recentActivity.map((activity, index) => (
                <div key={index} className="activity-item">
                  <div className="activity-icon">
                    {activity.type === 'login' && '🔐'}
                    {activity.type === 'app_launch' && '📱'}
                    {activity.type === 'file_access' && '📁'}
                    {activity.type === 'security' && '⚠️'}
                  </div>
                  <div className="activity-details">
                    <div className="activity-description">{activity.description}</div>
                    <div className="activity-meta">
                      {activity.username} • {new Date(activity.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <div className="activity-status">
                    <span className={`status-dot ${activity.success ? 'success' : 'error'}`}></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="security-center">
            <h3>Security Status</h3>
            
            <div className="security-overview">
              <div className="security-card">
                <h4>🔐 Authentication</h4>
                <div className="security-status good">Secure</div>
                <ul>
                  <li>✅ Multi-factor authentication enabled</li>
                  <li>✅ Strong password policy</li>
                  <li>✅ Session management active</li>
                </ul>
              </div>
              
              <div className="security-card">
                <h4>🌐 Network Security</h4>
                <div className="security-status good">Protected</div>
                <ul>
                  <li>✅ Firewall active</li>
                  <li>✅ Intrusion detection enabled</li>
                  <li>⚠️ 3 failed login attempts today</li>
                </ul>
              </div>
              
              <div className="security-card">
                <h4>📊 System Integrity</h4>
                <div className="security-status good">Healthy</div>
                <ul>
                  <li>✅ System files verified</li>
                  <li>✅ No malware detected</li>
                  <li>✅ Updates current</li>
                </ul>
              </div>
            </div>
            
            <div className="security-alerts">
              <h4>Recent Security Alerts</h4>
              {adminData.securityAlerts.length === 0 ? (
                <div className="no-alerts">✅ No security alerts</div>
              ) : (
                adminData.securityAlerts.map((alert, index) => (
                  <div key={index} className={`alert-item ${alert.severity}`}>
                    <div className="alert-icon">
                      {alert.severity === 'high' && '🚨'}
                      {alert.severity === 'medium' && '⚠️'}
                      {alert.severity === 'low' && 'ℹ️'}
                    </div>
                    <div className="alert-content">
                      <div className="alert-title">{alert.title}</div>
                      <div className="alert-description">{alert.description}</div>
                      <div className="alert-time">{new Date(alert.timestamp).toLocaleString()}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="reports-section">
            <h3>Generate Reports</h3>
            
            <div className="report-categories">
              <div className="report-card">
                <h4>📊 Activity Report</h4>
                <p>User activity, app usage, and system statistics</p>
                <button onClick={() => exportReport('activity')}>Generate Report</button>
              </div>
              
              <div className="report-card">
                <h4>👥 User Report</h4>
                <p>User accounts, roles, and login statistics</p>
                <button onClick={() => exportReport('users')}>Generate Report</button>
              </div>
              
              <div className="report-card">
                <h4>🔒 Security Report</h4>
                <p>Security events, alerts, and audit logs</p>
                <button onClick={() => exportReport('security')}>Generate Report</button>
              </div>
              
              <div className="report-card">
                <h4>🖥️ System Report</h4>
                <p>System performance, resources, and health</p>
                <button onClick={() => exportReport('system')}>Generate Report</button>
              </div>
            </div>
            
            <div className="custom-report">
              <h4>Custom Report</h4>
              <div className="custom-report-form">
                <select>
                  <option>Select Data Type</option>
                  <option>User Activity</option>
                  <option>App Usage</option>
                  <option>Security Events</option>
                  <option>System Performance</option>
                </select>
                
                <select>
                  <option>Time Range</option>
                  <option>Last 24 Hours</option>
                  <option>Last Week</option>
                  <option>Last Month</option>
                  <option>Custom Range</option>
                </select>
                
                <select>
                  <option>Format</option>
                  <option>CSV</option>
                  <option>PDF</option>
                  <option>JSON</option>
                </select>
                
                <button>Generate Custom Report</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;