import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Settings = ({ user, systemInfo }) => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({
    theme: 'default',
    language: 'en',
    distractionFree: false,
    autoSync: true,
    notifications: true,
    developmentMode: false
  });
  const [passwordChange, setPasswordChange] = useState({
    current: '',
    new: '',
    confirm: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUserSettings();
  }, []);

  const loadUserSettings = async () => {
    // Load user settings from backend or local storage
    const saved = localStorage.getItem(`hatch_settings_${user.id}`);
    if (saved) {
      setSettings({ ...settings, ...JSON.parse(saved) });
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      // Save to local storage and sync to cloud
      localStorage.setItem(`hatch_settings_${user.id}`, JSON.stringify(settings));
      
      if (window.electronAPI) {
        await window.electronAPI.syncCloudData({
          userId: user.id,
          type: 'settings_update',
          settings: settings,
          timestamp: Date.now()
        });
      }
      
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = (key, value) => {
    setSettings({ ...settings, [key]: value });
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    
    if (passwordChange.new !== passwordChange.confirm) {
      alert('New passwords do not match');
      return;
    }
    
    if (passwordChange.new.length < 8) {
      alert('New password must be at least 8 characters long');
      return;
    }
    
    setLoading(true);
    try {
      // This would integrate with the backend auth system
      const result = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          currentPassword: passwordChange.current,
          newPassword: passwordChange.new
        })
      });
      
      if (result.ok) {
        alert('Password changed successfully!');
        setPasswordChange({ current: '', new: '', confirm: '' });
      } else {
        const error = await result.json();
        alert(error.message || 'Failed to change password');
      }
    } catch (error) {
      console.error('Password change error:', error);
      alert('Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetToDefaults = () => {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      const defaultSettings = {
        theme: 'default',
        language: 'en',
        distractionFree: false,
        autoSync: true,
        notifications: true,
        developmentMode: false
      };
      setSettings(defaultSettings);
    }
  };

  return (
    <div className="settings-page">
      <header className="settings-header">
        <button onClick={() => navigate('/')} className="back-btn">
          ← Back to Dashboard
        </button>
        <h1>Settings</h1>
      </header>

      <div className="settings-content">
        <div className="settings-sections">
          
          {/* General Settings */}
          <section className="settings-section">
            <h2>🎨 Appearance</h2>
            <div className="setting-item">
              <label>Theme</label>
              <select 
                value={settings.theme}
                onChange={(e) => handleSettingChange('theme', e.target.value)}
              >
                <option value="default">Default</option>
                <option value="dark">Dark</option>
                <option value="high-contrast">High Contrast</option>
                <option value="education">Education</option>
              </select>
            </div>
            
            <div className="setting-item">
              <label>Language</label>
              <select 
                value={settings.language}
                onChange={(e) => handleSettingChange('language', e.target.value)}
              >
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="zh">中文</option>
              </select>
            </div>
          </section>

          {/* Learning & Focus */}
          <section className="settings-section">
            <h2>🎯 Learning & Focus</h2>
            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={settings.distractionFree}
                  onChange={(e) => handleSettingChange('distractionFree', e.target.checked)}
                />
                Enable Distraction-Free Mode by Default
              </label>
              <small>Blocks social media, games, and entertainment apps</small>
            </div>
            
            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={settings.notifications}
                  onChange={(e) => handleSettingChange('notifications', e.target.checked)}
                />
                Enable System Notifications
              </label>
              <small>Show alerts for assignments, schedule changes, etc.</small>
            </div>
          </section>

          {/* Cloud & Sync */}
          <section className="settings-section">
            <h2>☁️ Cloud & Sync</h2>
            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={settings.autoSync}
                  onChange={(e) => handleSettingChange('autoSync', e.target.checked)}
                />
                Auto-Sync Data to Cloud
              </label>
              <small>Automatically backup your files and progress every 2 seconds</small>
            </div>
          </section>

          {/* Developer Settings */}
          {(user.role === 'developer' || user.role === 'admin') && (
            <section className="settings-section">
              <h2>💻 Developer</h2>
              <div className="setting-item">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.developmentMode}
                    onChange={(e) => handleSettingChange('developmentMode', e.target.checked)}
                  />
                  Enable Development Mode
                </label>
                <small>Access to terminal, developer tools, and advanced features</small>
              </div>
            </section>
          )}

          {/* System Information */}
          <section className="settings-section">
            <h2>ℹ️ System Information</h2>
            <div className="system-info-grid">
              <div className="info-item">
                <strong>Hatch OS Version:</strong>
                <span>1.0.0</span>
              </div>
              <div className="info-item">
                <strong>User Role:</strong>
                <span>{user.role}</span>
              </div>
              <div className="info-item">
                <strong>Institution:</strong>
                <span>{user.institution}</span>
              </div>
              {systemInfo && (
                <>
                  <div className="info-item">
                    <strong>OS:</strong>
                    <span>{systemInfo.os?.platform} {systemInfo.os?.arch}</span>
                  </div>
                  <div className="info-item">
                    <strong>Memory:</strong>
                    <span>{Math.round(systemInfo.memory?.total / 1024 / 1024 / 1024)}GB</span>
                  </div>
                  <div className="info-item">
                    <strong>CPU:</strong>
                    <span>{systemInfo.cpu?.manufacturer} {systemInfo.cpu?.brand}</span>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Security */}
          <section className="settings-section">
            <h2>🔒 Security</h2>
            
            <form onSubmit={handlePasswordChange} className="password-form">
              <h3>Change Password</h3>
              
              <div className="form-group">
                <label>Current Password</label>
                <input
                  type="password"
                  value={passwordChange.current}
                  onChange={(e) => setPasswordChange({...passwordChange, current: e.target.value})}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={passwordChange.new}
                  onChange={(e) => setPasswordChange({...passwordChange, new: e.target.value})}
                  minLength="8"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={passwordChange.confirm}
                  onChange={(e) => setPasswordChange({...passwordChange, confirm: e.target.value})}
                  minLength="8"
                  required
                />
              </div>
              
              <button type="submit" disabled={loading}>
                {loading ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          </section>
        </div>

        {/* Settings Actions */}
        <div className="settings-actions">
          <button onClick={saveSettings} className="save-btn" disabled={loading}>
            {loading ? 'Saving...' : '💾 Save Settings'}
          </button>
          
          <button onClick={resetToDefaults} className="reset-btn">
            🔄 Reset to Defaults
          </button>
          
          <button onClick={() => navigate('/')} className="cancel-btn">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;