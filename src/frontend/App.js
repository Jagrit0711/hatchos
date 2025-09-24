import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';
import AppLauncher from './components/AppLauncher';
import Settings from './components/Settings';
import AdminPanel from './components/AdminPanel';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const [isDistractionFree, setIsDistractionFree] = useState(false);

  useEffect(() => {
    // Initialize system
    initializeSystem();
    
    // Set up cloud sync interval (every 2 seconds as per PRD)
    const syncInterval = setInterval(syncCloudData, 2000);
    
    return () => clearInterval(syncInterval);
  }, []);

  const initializeSystem = async () => {
    try {
      if (window.electronAPI) {
        const info = await window.electronAPI.getSystemInfo();
        setSystemInfo(info);
      }
    } catch (error) {
      console.error('Failed to initialize system:', error);
    }
  };

  const syncCloudData = async () => {
    if (isAuthenticated && user) {
      try {
        const data = {
          userId: user.id,
          timestamp: Date.now(),
          activity: 'active',
          systemStatus: 'running'
        };
        
        if (window.electronAPI) {
          await window.electronAPI.syncCloudData(data);
        }
      } catch (error) {
        console.error('Cloud sync failed:', error);
      }
    }
  };

  const handleLogin = (userData) => {
    setIsAuthenticated(true);
    setUser(userData);
    
    // Log successful authentication
    console.log('User authenticated:', userData.username);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
  };

  const toggleDistractionFree = () => {
    setIsDistractionFree(!isDistractionFree);
    if (window.hatchAPI) {
      window.hatchAPI.setDistractionFree(!isDistractionFree);
    }
  };

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <Router>
      <div className="hatch-os">
        <Routes>
          <Route 
            path="/" 
            element={
              <Dashboard 
                user={user}
                systemInfo={systemInfo}
                isDistractionFree={isDistractionFree}
                onToggleDistractionFree={toggleDistractionFree}
                onLogout={handleLogout}
              />
            } 
          />
          <Route 
            path="/apps" 
            element={
              <AppLauncher 
                user={user}
                isDistractionFree={isDistractionFree}
              />
            } 
          />
          <Route 
            path="/settings" 
            element={
              <Settings 
                user={user}
                systemInfo={systemInfo}
              />
            } 
          />
          <Route 
            path="/admin" 
            element={
              <AdminPanel 
                user={user}
              />
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;