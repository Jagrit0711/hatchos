const si = require('systeminformation');
const fs = require('fs-extra');
const path = require('path');

class SystemMonitor {
  constructor() {
    this.stats = {
      cpu: 0,
      memory: { used: 0, total: 0 },
      disk: { used: 0, total: 0 },
      network: { rx: 0, tx: 0 },
      uptime: 0,
      temperature: 0
    };
    
    this.activeUsers = [];
    this.processes = [];
    
    // Initialize monitoring
    this.startMonitoring();
  }

  async getSystemInfo() {
    try {
      const [cpu, mem, osInfo, network, disk] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.osInfo(),
        si.networkInterfaces(),
        si.fsSize()
      ]);

      return {
        cpu,
        memory: mem,
        os: osInfo,
        network,
        disk: disk[0] || {}
      };
    } catch (error) {
      console.error('Error getting system info:', error);
      return null;
    }
  }

  async collectSystemStats() {
    try {
      const [
        cpuCurrentSpeed,
        cpuLoad,
        mem,
        fsSize,
        networkStats,
        osInfo,
        currentLoad,
        processes
      ] = await Promise.all([
        si.cpuCurrentSpeed(),
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
        si.osInfo(),
        si.currentLoad(),
        si.processes()
      ]);

      // Update internal stats
      this.stats = {
        cpu: Math.round(cpuLoad.currentLoad),
        memory: {
          used: mem.used,
          total: mem.total,
          percentage: Math.round((mem.used / mem.total) * 100)
        },
        disk: fsSize[0] ? {
          used: fsSize[0].used,
          total: fsSize[0].size,
          percentage: Math.round((fsSize[0].used / fsSize[0].size) * 100)
        } : { used: 0, total: 0, percentage: 0 },
        network: networkStats[0] || { rx_sec: 0, tx_sec: 0 },
        uptime: osInfo.uptime,
        processes: processes.all,
        processCount: processes.list.length,
        temperature: await this.getCpuTemperature()
      };

      // Log stats for historical data
      await this.logSystemStats();

      return this.stats;
    } catch (error) {
      console.error('Error collecting system stats:', error);
      return this.stats;
    }
  }

  async getCpuTemperature() {
    try {
      const temp = await si.cpuTemperature();
      return temp.main || 0;
    } catch (error) {
      return 0;
    }
  }

  async getActiveUsers() {
    try {
      const users = await si.users();
      this.activeUsers = users.map(user => ({
        id: user.user,
        username: user.user,
        terminal: user.tty,
        host: user.ip,
        loginTime: user.time ? new Date(user.time * 1000) : null,
        online: true
      }));

      return this.activeUsers;
    } catch (error) {
      console.error('Error getting active users:', error);
      return [];
    }
  }

  async getRunningProcesses() {
    try {
      const processes = await si.processes();
      
      // Filter for Hatch OS related processes
      const hatchProcesses = processes.list.filter(proc => 
        proc.name.includes('node') || 
        proc.name.includes('electron') || 
        proc.command.includes('hatch')
      );

      this.processes = hatchProcesses.map(proc => ({
        pid: proc.pid,
        name: proc.name,
        cpu: proc.cpu,
        memory: proc.mem,
        command: proc.command
      }));

      return this.processes;
    } catch (error) {
      console.error('Error getting processes:', error);
      return [];
    }
  }

  async logSystemStats() {
    try {
      const logDir = path.join(__dirname, '../../data/logs');
      await fs.ensureDir(logDir);
      
      const logFile = path.join(logDir, `system-${new Date().toISOString().split('T')[0]}.log`);
      
      const logEntry = {
        timestamp: Date.now(),
        stats: this.stats
      };

      await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error('Error logging system stats:', error);
    }
  }

  async getSystemAlerts() {
    const alerts = [];

    // CPU usage alert
    if (this.stats.cpu > 90) {
      alerts.push({
        type: 'cpu_high',
        severity: 'high',
        message: `High CPU usage: ${this.stats.cpu}%`,
        timestamp: Date.now()
      });
    }

    // Memory usage alert
    if (this.stats.memory.percentage > 85) {
      alerts.push({
        type: 'memory_high',
        severity: 'high', 
        message: `High memory usage: ${this.stats.memory.percentage}%`,
        timestamp: Date.now()
      });
    }

    // Disk usage alert
    if (this.stats.disk.percentage > 90) {
      alerts.push({
        type: 'disk_full',
        severity: 'high',
        message: `Disk almost full: ${this.stats.disk.percentage}%`,
        timestamp: Date.now()
      });
    }

    // Temperature alert
    if (this.stats.temperature > 80) {
      alerts.push({
        type: 'temperature_high',
        severity: 'medium',
        message: `High CPU temperature: ${this.stats.temperature}°C`,
        timestamp: Date.now()
      });
    }

    return alerts;
  }

  startMonitoring() {
    // Collect stats every 30 seconds
    setInterval(async () => {
      await this.collectSystemStats();
      
      // Check for alerts
      const alerts = await this.getSystemAlerts();
      if (alerts.length > 0) {
        console.log('System alerts:', alerts);
        // Could emit events or send notifications here
      }
    }, 30000);

    // Update user list every minute
    setInterval(async () => {
      await this.getActiveUsers();
    }, 60000);

    // Update process list every 2 minutes
    setInterval(async () => {
      await this.getRunningProcesses();
    }, 120000);
  }

  getStats() {
    return this.stats;
  }

  getHealthStatus() {
    const health = {
      overall: 'good',
      issues: []
    };

    if (this.stats.cpu > 80) {
      health.overall = 'warning';
      health.issues.push('High CPU usage');
    }

    if (this.stats.memory.percentage > 80) {
      health.overall = 'warning';
      health.issues.push('High memory usage');
    }

    if (this.stats.disk.percentage > 85) {
      health.overall = 'critical';
      health.issues.push('Low disk space');
    }

    if (this.stats.temperature > 75) {
      health.overall = 'warning';
      health.issues.push('High temperature');
    }

    return health;
  }

  // Hardware optimization functions
  async optimizePerformance() {
    try {
      console.log('🔧 Optimizing system performance...');
      
      // Clear system caches (Linux specific)
      if (process.platform === 'linux') {
        const { exec } = require('child_process');
        
        // Clear page cache, dentries and inodes
        exec('echo 3 | sudo tee /proc/sys/vm/drop_caches', (error) => {
          if (error) {
            console.error('Cache clear failed:', error);
          } else {
            console.log('✅ System caches cleared');
          }
        });
        
        // Optimize swappiness for SSD
        exec('echo 10 | sudo tee /proc/sys/vm/swappiness', (error) => {
          if (error) {
            console.error('Swappiness optimization failed:', error);
          } else {
            console.log('✅ Swappiness optimized');
          }
        });
      }

      return { success: true, message: 'Performance optimization completed' };
    } catch (error) {
      console.error('Performance optimization failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Raspberry Pi specific optimizations
  async optimizeForRaspberryPi() {
    if (process.arch !== 'arm' && process.arch !== 'arm64') {
      return { success: false, message: 'Not a Raspberry Pi system' };
    }

    try {
      console.log('🥧 Applying Raspberry Pi optimizations...');
      
      const { exec } = require('child_process');
      
      // GPU memory split for better performance
      exec('echo "gpu_mem=128" | sudo tee -a /boot/config.txt', (error) => {
        if (error) {
          console.error('GPU memory config failed:', error);
        } else {
          console.log('✅ GPU memory optimized');
        }
      });

      // Disable unnecessary services
      const servicesToDisable = [
        'bluetooth',
        'cups',
        'avahi-daemon',
        'triggerhappy'
      ];

      servicesToDisable.forEach(service => {
        exec(`sudo systemctl disable ${service}`, (error) => {
          if (!error) {
            console.log(`✅ Disabled ${service}`);
          }
        });
      });

      return { success: true, message: 'Raspberry Pi optimization completed' };
    } catch (error) {
      console.error('Raspberry Pi optimization failed:', error);
      return { success: false, error: error.message };
    }
  }
}

// Create singleton instance
const systemMonitor = new SystemMonitor();

module.exports = {
  getSystemInfo: () => systemMonitor.getSystemInfo(),
  getSystemStats: () => systemMonitor.getStats(),
  collectSystemStats: () => systemMonitor.collectSystemStats(),
  getActiveUsers: () => systemMonitor.getActiveUsers(),
  getRunningProcesses: () => systemMonitor.getRunningProcesses(),
  getSystemAlerts: () => systemMonitor.getSystemAlerts(),
  getHealthStatus: () => systemMonitor.getHealthStatus(),
  optimizePerformance: () => systemMonitor.optimizePerformance(),
  optimizeForRaspberryPi: () => systemMonitor.optimizeForRaspberryPi()
};