import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Dashboard = ({ user, systemInfo, isDistractionFree, onToggleDistractionFree, onLogout }) => {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [announcements] = useState([
    { id: 1, title: 'Welcome to Hatch OS', message: 'Your secure learning environment is ready!' },
    { id: 2, title: 'Class Schedule', message: 'Mathematics at 10:00 AM, Science at 2:00 PM' },
    { id: 3, title: 'Assignment Due', message: 'Submit your project by Friday' }
  ]);
  const [systemStats, setSystemStats] = useState({
    uptime: '0:00:00',
    memory: { used: 0, total: 0 },
    cpu: 0
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    const statsTimer = setInterval(() => {
      updateSystemStats();
    }, 5000);

    return () => {
      clearInterval(timer);
      clearInterval(statsTimer);
    };
  }, []);

  const updateSystemStats = async () => {
    try {
      if (window.electronAPI) {
        const info = await window.electronAPI.getSystemInfo();
        setSystemStats({
          uptime: formatUptime(info.os?.uptime || 0),
          memory: info.memory || { used: 0, total: 0 },
          cpu: Math.random() * 100 // Simulated CPU usage
        });
      }
    } catch (error) {
      console.error('Failed to update system stats:', error);
    }
  };

  const formatUptime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatMemory = (bytes) => {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="hatch-logo">H</div>
          <h3>Hatch OS</h3>
          <p>{user.username}</p>
          <small>{user.institution}</small>
        </div>
        
        <nav className="sidebar-nav">
          <ul>
            <li>
              <button className="active" onClick={() => navigate('/')}>
                📊 Dashboard
              </button>
            </li>
            <li>
              <button onClick={() => navigate('/apps')}>
                📱 Applications
              </button>
            </li>
            <li>
              <button onClick={() => navigate('/settings')}>
                ⚙️ Settings
              </button>
            </li>
            {user.role === 'admin' && (
              <li>
                <button onClick={() => navigate('/admin')}>
                  👨‍💼 Admin Panel
                </button>
              </li>
            )}
            <li>
              <button onClick={onToggleDistractionFree}>
                {isDistractionFree ? '🔓 Disable Focus Mode' : '🔒 Enable Focus Mode'}
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      <main className="main-content">
        <header className="header">
          <h1>Welcome back, {user.username}!</h1>
          <div className="user-info">
            <div className="user-avatar">{user.username.charAt(0).toUpperCase()}</div>
            <span>{currentTime.toLocaleTimeString()}</span>
            <button onClick={onLogout} className="logout-btn">Logout</button>
          </div>
        </header>

        {isDistractionFree && (
          <div className="distraction-free-indicator">
            🎯 Focus Mode Active
          </div>
        )}

        <div className="widget-grid">
          {/* Quick Stats Widget */}
          <div className="widget">
            <h3>📈 System Status</h3>
            <div className="stat-grid">
              <div className="stat-item">
                <span className="stat-label">Uptime:</span>
                <span className="stat-value">{systemStats.uptime}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Memory:</span>
                <span className="stat-value">
                  {formatMemory(systemStats.memory.used)} / {formatMemory(systemStats.memory.total)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">CPU:</span>
                <span className="stat-value">{systemStats.cpu.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Quick Actions Widget */}
          <div className="widget">
            <h3>⚡ Quick Actions</h3>
            <div className="quick-actions">
              <button 
                className="quick-action-btn"
                onClick={() => navigate('/apps')}
              >
                📝 Open Notes
              </button>
              <button 
                className="quick-action-btn"
                onClick={() => navigate('/apps')}
              >
                🌐 Web Browser
              </button>
              <button 
                className="quick-action-btn"
                onClick={() => navigate('/apps')}
              >
                💻 Code Editor
              </button>
              <button 
                className="quick-action-btn"
                onClick={() => navigate('/apps')}
              >
                📁 File Manager
              </button>
            </div>
          </div>

          {/* Announcements Widget */}
          <div className="widget">
            <h3>📢 Announcements</h3>
            <div className="announcements">
              {announcements.map(announcement => (
                <div key={announcement.id} className="announcement-item">
                  <h4>{announcement.title}</h4>
                  <p>{announcement.message}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Today's Schedule Widget */}
          <div className="widget">
            <h3>📅 Today's Schedule</h3>
            <div className="schedule">
              <div className="schedule-item">
                <span className="time">09:00</span>
                <span className="subject">Mathematics</span>
              </div>
              <div className="schedule-item">
                <span className="time">10:30</span>
                <span className="subject">Break</span>
              </div>
              <div className="schedule-item">
                <span className="time">11:00</span>
                <span className="subject">Science</span>
              </div>
              <div className="schedule-item">
                <span className="time">14:00</span>
                <span className="subject">Computer Lab</span>
              </div>
            </div>
          </div>

          {/* Cloud Sync Status */}
          <div className="widget">
            <h3>☁️ Cloud Sync</h3>
            <div className="sync-status">
              <div className="sync-indicator active">
                <span className="sync-dot"></span>
                <span>Connected to Zylon Cloud</span>
              </div>
              <small>Last sync: {currentTime.toLocaleString()}</small>
              <div className="sync-stats">
                <p>Files synced: 42</p>
                <p>Data usage: 15.3 MB</p>
              </div>
            </div>
          </div>

          {/* Security Status */}
          <div className="widget">
            <h3>🔒 Security Status</h3>
            <div className="security-status">
              <div className="security-item">
                <span className="status-icon green">✓</span>
                <span>System Secure</span>
              </div>
              <div className="security-item">
                <span className="status-icon green">✓</span>
                <span>Authentication Active</span>
              </div>
              <div className="security-item">
                <span className="status-icon green">✓</span>
                <span>Network Protected</span>
              </div>
              <div className="security-item">
                <span className="status-icon yellow">⚠</span>
                <span>Updates Available</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;