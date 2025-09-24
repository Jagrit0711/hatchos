const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const cron = require('node-cron');

const auth = require('./auth');
const cloudSync = require('./cloudSync');
const systemMonitor = require('./systemMonitor');
const security = require('./security');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../build')));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// API Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, pin, otp } = req.body;
    const result = await auth.authenticateUser({ username, password, pin, otp });
    
    // Log authentication attempt
    cloudSync.logEvent({
      type: 'authentication',
      username,
      success: result.success,
      timestamp: Date.now(),
      ip: req.ip
    });
    
    res.json(result);
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ success: false, message: 'Authentication failed' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const { userId } = req.body;
    await cloudSync.logEvent({
      type: 'logout',
      userId,
      timestamp: Date.now()
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false });
  }
});

app.get('/api/system/info', async (req, res) => {
  try {
    const info = await systemMonitor.getSystemInfo();
    res.json(info);
  } catch (error) {
    console.error('System info error:', error);
    res.status(500).json({ error: 'Failed to get system info' });
  }
});

app.post('/api/cloud/sync', async (req, res) => {
  try {
    const result = await cloudSync.syncData(req.body);
    res.json(result);
  } catch (error) {
    console.error('Cloud sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/dashboard', async (req, res) => {
  try {
    const { userId } = req.query;
    
    // Verify admin access
    const user = await auth.getUserById(userId);
    if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const dashboardData = {
      activeUsers: await systemMonitor.getActiveUsers(),
      systemStats: await systemMonitor.getSystemStats(),
      recentActivity: await cloudSync.getRecentActivity(),
      securityAlerts: await security.getSecurityAlerts()
    };
    
    res.json(dashboardData);
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

app.post('/api/apps/launch', async (req, res) => {
  try {
    const { userId, appId, appName } = req.body;
    
    // Log app launch
    await cloudSync.logEvent({
      type: 'app_launch',
      userId,
      appId,
      appName,
      timestamp: Date.now()
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('App launch logging error:', error);
    res.status(500).json({ success: false });
  }
});

// Socket.IO for real-time communication
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-user', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined their room`);
  });
  
  socket.on('system-status', async () => {
    const status = await systemMonitor.getSystemInfo();
    socket.emit('system-status-update', status);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Scheduled tasks
// Cloud sync every 2 seconds (as per PRD requirement)
cron.schedule('*/2 * * * * *', async () => {
  try {
    await cloudSync.performScheduledSync();
  } catch (error) {
    console.error('Scheduled sync error:', error);
  }
});

// System monitoring every minute
cron.schedule('* * * * *', async () => {
  try {
    const stats = await systemMonitor.collectSystemStats();
    io.emit('system-stats', stats);
  } catch (error) {
    console.error('System monitoring error:', error);
  }
});

// Security check every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    await security.performSecurityCheck();
  } catch (error) {
    console.error('Security check error:', error);
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../build/index.html'));
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Hatch OS Backend Server running on port ${PORT}`);
  console.log(`📊 System monitoring active`);
  console.log(`☁️  Cloud sync enabled (every 2 seconds)`);
  console.log(`🔒 Security monitoring active`);
});

module.exports = { app, server, io };