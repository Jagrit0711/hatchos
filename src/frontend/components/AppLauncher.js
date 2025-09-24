import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const AppLauncher = ({ user, isDistractionFree }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  // Pre-installed apps as per PRD
  const apps = [
    {
      id: 'browser',
      name: 'Web Browser',
      icon: '🌐',
      color: '#4285f4',
      description: 'Secure web browsing with content filtering',
      category: 'productivity',
      isDistractingApp: false,
      command: 'chromium-browser --kiosk'
    },
    {
      id: 'notes',
      name: 'Notes',
      icon: '📝',
      color: '#34a853',
      description: 'Take notes and organize your thoughts',
      category: 'productivity',
      isDistractingApp: false,
      command: 'hatch-notes'
    },
    {
      id: 'files',
      name: 'File Manager',
      icon: '📁',
      color: '#fbbc05',
      description: 'Manage your files and folders',
      category: 'system',
      isDistractingApp: false,
      command: 'nautilus'
    },
    {
      id: 'code-editor',
      name: 'Code Editor',
      icon: '💻',
      color: '#007acc',
      description: 'VSCode-lite for programming',
      category: 'development',
      isDistractingApp: false,
      command: 'code --user-data-dir=/tmp/hatch-vscode'
    },
    {
      id: 'terminal',
      name: 'Terminal',
      icon: '⌨️',
      color: '#000000',
      description: 'Command line interface',
      category: 'development',
      isDistractingApp: false,
      command: 'gnome-terminal',
      requiresDevMode: true
    },
    {
      id: 'calculator',
      name: 'Calculator',
      icon: '🔢',
      color: '#ea4335',
      description: 'Scientific calculator',
      category: 'utility',
      isDistractingApp: false,
      command: 'gnome-calculator'
    },
    {
      id: 'classroom',
      name: 'Classroom',
      icon: '🎓',
      color: '#9c27b0',
      description: 'Interactive classroom tools',
      category: 'education',
      isDistractingApp: false,
      command: 'hatch-classroom'
    },
    {
      id: 'whiteboard',
      name: 'Whiteboard',
      icon: '📋',
      color: '#ff9800',
      description: 'Digital whiteboard for presentations',
      category: 'education',
      isDistractingApp: false,
      command: 'hatch-whiteboard'
    },
    {
      id: 'quiz-app',
      name: 'Quiz App',
      icon: '❓',
      color: '#795548',
      description: 'Take quizzes and assessments',
      category: 'education',
      isDistractingApp: false,
      command: 'hatch-quiz'
    },
    // Potentially distracting apps (blocked in focus mode)
    {
      id: 'games',
      name: 'Educational Games',
      icon: '🎮',
      color: '#e91e63',
      description: 'Educational games and activities',
      category: 'entertainment',
      isDistractingApp: true,
      command: 'hatch-games'
    },
    {
      id: 'music',
      name: 'Music Player',
      icon: '🎵',
      color: '#673ab7',
      description: 'Listen to music during breaks',
      category: 'entertainment',
      isDistractingApp: true,
      command: 'rhythmbox'
    },
    {
      id: 'chat',
      name: 'Class Chat',
      icon: '💬',
      color: '#009688',
      description: 'Chat with classmates (supervised)',
      category: 'social',
      isDistractingApp: true,
      command: 'hatch-chat'
    }
  ];

  const filteredApps = apps.filter(app => {
    const matchesSearch = app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const isAccessible = !isDistractionFree || !app.isDistractingApp;
    const hasDevAccess = !app.requiresDevMode || user.role === 'developer' || user.role === 'admin';
    
    return matchesSearch && isAccessible && hasDevAccess;
  });

  const handleAppLaunch = async (app) => {
    if (isDistractionFree && app.isDistractingApp) {
      alert('This app is blocked in Focus Mode. Disable Focus Mode to access it.');
      return;
    }

    if (app.requiresDevMode && user.role !== 'developer' && user.role !== 'admin') {
      alert('Developer access required for this application.');
      return;
    }

    console.log(`Launching ${app.name}...`);
    
    // Log app usage for monitoring
    if (window.electronAPI) {
      await window.electronAPI.syncCloudData({
        userId: user.id,
        action: 'app_launch',
        appId: app.id,
        appName: app.name,
        timestamp: Date.now()
      });
    }

    // Launch the application
    try {
      if (window.electronAPI) {
        // Launch native application
        const { spawn } = require('child_process');
        spawn(app.command, { shell: true, detached: true });
      } else {
        // Fallback for web testing - simulate app launch
        alert(`Launching ${app.name}...\nCommand: ${app.command}`);
      }
    } catch (error) {
      console.error(`Failed to launch ${app.name}:`, error);
      alert(`Failed to launch ${app.name}. Please contact your system administrator.`);
    }
  };

  const getCategoryApps = (category) => {
    return filteredApps.filter(app => app.category === category);
  };

  const categories = [
    { name: 'Productivity', key: 'productivity', icon: '⚡' },
    { name: 'Education', key: 'education', icon: '🎓' },
    { name: 'Development', key: 'development', icon: '💻' },
    { name: 'System', key: 'system', icon: '⚙️' },
    { name: 'Utilities', key: 'utility', icon: '🔧' },
    { name: 'Entertainment', key: 'entertainment', icon: '🎨' },
    { name: 'Social', key: 'social', icon: '👥' }
  ];

  return (
    <div className="app-launcher">
      <header className="launcher-header">
        <button onClick={() => navigate('/')} className="back-btn">
          ← Back to Dashboard
        </button>
        <h1>Applications</h1>
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search applications..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </header>

      {isDistractionFree && (
        <div className="focus-mode-banner">
          🎯 Focus Mode is active - Some apps may be restricted
        </div>
      )}

      <div className="app-categories">
        {categories.map(category => {
          const categoryApps = getCategoryApps(category.key);
          
          if (categoryApps.length === 0) return null;
          
          return (
            <div key={category.key} className="app-category">
              <h2 className="category-title">
                {category.icon} {category.name}
              </h2>
              
              <div className="app-grid">
                {categoryApps.map(app => (
                  <div
                    key={app.id}
                    className={`app-tile ${isDistractionFree && app.isDistractingApp ? 'disabled' : ''}`}
                    onClick={() => handleAppLaunch(app)}
                    style={{ cursor: isDistractionFree && app.isDistractingApp ? 'not-allowed' : 'pointer' }}
                  >
                    <div 
                      className="app-icon" 
                      style={{ backgroundColor: app.color }}
                    >
                      {app.icon}
                    </div>
                    <h3 className="app-name">{app.name}</h3>
                    <p className="app-description">{app.description}</p>
                    
                    {app.requiresDevMode && (
                      <div className="dev-badge">DEV</div>
                    )}
                    
                    {isDistractionFree && app.isDistractingApp && (
                      <div className="blocked-overlay">
                        <span>🔒 Blocked</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {filteredApps.length === 0 && (
        <div className="no-apps">
          <h3>No applications found</h3>
          <p>Try adjusting your search terms or check your access permissions.</p>
        </div>
      )}

      <div className="launcher-footer">
        <p>
          Total Apps: {apps.length} | 
          Available: {filteredApps.length} | 
          User Role: {user.role}
          {isDistractionFree && ' | Focus Mode Active'}
        </p>
      </div>
    </div>
  );
};

export default AppLauncher;