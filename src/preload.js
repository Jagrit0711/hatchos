const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  authenticateUser: (credentials) => ipcRenderer.invoke('authenticate-user', credentials),
  syncCloudData: (data) => ipcRenderer.invoke('sync-cloud-data', data),
  
  // System events
  onSystemEvent: (callback) => ipcRenderer.on('system-event', callback),
  removeSystemEventListeners: () => ipcRenderer.removeAllListeners('system-event')
});

// Expose Hatch OS specific APIs
contextBridge.exposeInMainWorld('hatchAPI', {
  version: '1.0.0',
  platform: process.platform,
  isKioskMode: true,
  
  // Security features
  lockScreen: () => ipcRenderer.invoke('lock-screen'),
  emergencyShutdown: () => ipcRenderer.invoke('emergency-shutdown'),
  
  // Educational features
  getClassroomMode: () => ipcRenderer.invoke('get-classroom-mode'),
  setDistractionFree: (enabled) => ipcRenderer.invoke('set-distraction-free', enabled)
});