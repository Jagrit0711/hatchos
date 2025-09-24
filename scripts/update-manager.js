#!/usr/bin/env node

/**
 * Hatch OS GitHub Auto-Update Client
 * Checks for updates and automatically deploys from GitHub
 */

const fs = require('fs-extra');
const path = require('path');
const { exec, spawn } = require('child_process');
const https = require('https');
const crypto = require('crypto');

class HatchOSUpdater {
  constructor() {
    this.config = {
      repo: 'Jagrit0711/hatchos',
      branch: 'main',
      githubApiUrl: 'https://api.github.com',
      updateCheckInterval: 300000, // 5 minutes
      backupRetention: 5,
      autoRestart: true
    };
    
    this.currentVersion = this.getCurrentVersion();
    this.isUpdating = false;
  }

  getCurrentVersion() {
    try {
      const packageJson = require('../package.json');
      return packageJson.version;
    } catch (error) {
      return '1.0.0';
    }
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    console.log(logMessage);
    
    // Also write to log file
    const logFile = path.join(__dirname, '../logs/updater.log');
    fs.ensureFileSync(logFile);
    fs.appendFileSync(logFile, logMessage + '\n');
  }

  async checkForUpdates() {
    try {
      this.log('info', 'Checking for updates...');
      
      const latestRelease = await this.getLatestRelease();
      const currentCommit = await this.getCurrentCommit();
      
      if (latestRelease.sha !== currentCommit) {
        this.log('info', `Update available: ${currentCommit} -> ${latestRelease.sha}`);
        return {
          available: true,
          current: currentCommit,
          latest: latestRelease.sha,
          version: latestRelease.version,
          downloadUrl: latestRelease.downloadUrl
        };
      } else {
        this.log('info', 'No updates available');
        return { available: false };
      }
    } catch (error) {
      this.log('error', `Failed to check for updates: ${error.message}`);
      return { available: false, error: error.message };
    }
  }

  async getLatestRelease() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.config.repo}/commits/${this.config.branch}`,
        method: 'GET',
        headers: {
          'User-Agent': 'Hatch-OS-Updater/1.0.0',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const commit = JSON.parse(data);
            resolve({
              sha: commit.sha,
              version: commit.commit.message.match(/v(\d+\.\d+\.\d+)/) ? 
                      commit.commit.message.match(/v(\d+\.\d+\.\d+)/)[1] : 
                      this.currentVersion,
              downloadUrl: `https://github.com/${this.config.repo}/archive/${commit.sha}.zip`
            });
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  async getCurrentCommit() {
    return new Promise((resolve, reject) => {
      exec('git rev-parse HEAD', (error, stdout) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  async performUpdate(updateInfo) {
    if (this.isUpdating) {
      this.log('warn', 'Update already in progress');
      return false;
    }

    this.isUpdating = true;
    
    try {
      this.log('info', `Starting update to version ${updateInfo.version}`);
      
      // Create backup
      await this.createBackup();
      
      // Stop services
      await this.stopServices();
      
      // Download and apply update
      await this.downloadUpdate(updateInfo);
      
      // Install dependencies
      await this.installDependencies();
      
      // Build application
      await this.buildApplication();
      
      // Start services
      await this.startServices();
      
      // Verify update
      await this.verifyUpdate();
      
      this.log('info', '✅ Update completed successfully');
      
      // Send notification
      await this.sendNotification('success', `Hatch OS updated to ${updateInfo.version}`);
      
      return true;
    } catch (error) {
      this.log('error', `Update failed: ${error.message}`);
      
      // Attempt rollback
      await this.rollback();
      
      // Send notification
      await this.sendNotification('error', `Hatch OS update failed: ${error.message}`);
      
      return false;
    } finally {
      this.isUpdating = false;
    }
  }

  async createBackup() {
    this.log('info', 'Creating backup...');
    const backupDir = path.join(__dirname, `../backups/backup-${Date.now()}`);
    
    await fs.ensureDir(backupDir);
    await fs.copy(path.join(__dirname, '..'), backupDir, {
      filter: (src) => !src.includes('node_modules') && !src.includes('.git') && !src.includes('backups')
    });
    
    // Cleanup old backups
    await this.cleanupOldBackups();
    
    this.log('info', `Backup created: ${backupDir}`);
    this.lastBackup = backupDir;
  }

  async cleanupOldBackups() {
    const backupsDir = path.join(__dirname, '../backups');
    
    if (await fs.pathExists(backupsDir)) {
      const backups = await fs.readdir(backupsDir);
      const sortedBackups = backups
        .filter(name => name.startsWith('backup-'))
        .sort((a, b) => b.localeCompare(a));
      
      // Keep only the latest N backups
      if (sortedBackups.length > this.config.backupRetention) {
        const toDelete = sortedBackups.slice(this.config.backupRetention);
        for (const backup of toDelete) {
          await fs.remove(path.join(backupsDir, backup));
        }
        this.log('info', `Cleaned up ${toDelete.length} old backups`);
      }
    }
  }

  async stopServices() {
    this.log('info', 'Stopping services...');
    
    const services = ['hatch-backend', 'hatch-frontend'];
    
    for (const service of services) {
      try {
        await this.execCommand(`systemctl stop ${service}`);
        this.log('info', `Stopped ${service}`);
      } catch (error) {
        this.log('warn', `Failed to stop ${service}: ${error.message}`);
      }
    }
  }

  async startServices() {
    this.log('info', 'Starting services...');
    
    const services = ['hatch-backend', 'hatch-frontend'];
    
    // Reload systemd
    await this.execCommand('systemctl daemon-reload');
    
    for (const service of services) {
      try {
        await this.execCommand(`systemctl start ${service}`);
        this.log('info', `Started ${service}`);
        
        // Wait a bit before starting next service
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        this.log('error', `Failed to start ${service}: ${error.message}`);
        throw error;
      }
    }
  }

  async downloadUpdate(updateInfo) {
    this.log('info', 'Downloading update...');
    
    return new Promise((resolve, reject) => {
      exec(`git pull origin ${this.config.branch}`, (error, stdout, stderr) => {
        if (error) {
          this.log('error', `Git pull failed: ${stderr}`);
          reject(error);
        } else {
          this.log('info', 'Update downloaded successfully');
          resolve();
        }
      });
    });
  }

  async installDependencies() {
    this.log('info', 'Installing dependencies...');
    await this.execCommand('npm install --production');
  }

  async buildApplication() {
    this.log('info', 'Building application...');
    
    try {
      await this.execCommand('npm run build');
    } catch (error) {
      this.log('warn', `Build failed, continuing: ${error.message}`);
    }
  }

  async verifyUpdate() {
    this.log('info', 'Verifying update...');
    
    // Check if services are running
    const services = ['hatch-backend'];
    
    for (const service of services) {
      try {
        await this.execCommand(`systemctl is-active ${service}`);
        this.log('info', `✅ ${service} is running`);
      } catch (error) {
        throw new Error(`Service ${service} is not running after update`);
      }
    }
    
    // Check if API is responding
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('API health check timeout')), 30000);
      
      const checkHealth = () => {
        exec('curl -f http://localhost:3001/api/health', (error) => {
          if (error) {
            setTimeout(checkHealth, 2000);
          } else {
            clearTimeout(timeout);
            resolve();
          }
        });
      };
      
      checkHealth();
    });
    
    this.log('info', '✅ API is responding');
  }

  async rollback() {
    if (!this.lastBackup) {
      this.log('error', 'No backup available for rollback');
      return;
    }
    
    this.log('warn', 'Performing rollback...');
    
    try {
      // Stop services
      await this.stopServices();
      
      // Restore backup
      const currentDir = path.join(__dirname, '..');
      await fs.remove(currentDir);
      await fs.move(this.lastBackup, currentDir);
      
      // Install dependencies
      await this.installDependencies();
      
      // Start services
      await this.startServices();
      
      this.log('info', '✅ Rollback completed');
    } catch (error) {
      this.log('error', `Rollback failed: ${error.message}`);
    }
  }

  async execCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Command failed: ${command}\n${stderr}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  async sendNotification(type, message) {
    // Send webhook notification if configured
    const webhookUrl = process.env.HATCH_WEBHOOK_URL;
    
    if (webhookUrl) {
      try {
        const payload = {
          text: `${type === 'success' ? '✅' : '❌'} ${message}`,
          timestamp: new Date().toISOString()
        };
        
        // Implementation would depend on webhook service (Slack, Discord, etc.)
        this.log('info', 'Notification sent');
      } catch (error) {
        this.log('warn', `Failed to send notification: ${error.message}`);
      }
    }
  }

  async startAutoUpdater() {
    this.log('info', `Starting auto-updater (check interval: ${this.config.updateCheckInterval}ms)`);
    
    const checkAndUpdate = async () => {
      try {
        const updateInfo = await this.checkForUpdates();
        
        if (updateInfo.available) {
          this.log('info', 'Update available, starting automatic update');
          await this.performUpdate(updateInfo);
        }
      } catch (error) {
        this.log('error', `Auto-update check failed: ${error.message}`);
      }
    };
    
    // Initial check
    await checkAndUpdate();
    
    // Schedule periodic checks
    setInterval(checkAndUpdate, this.config.updateCheckInterval);
  }
}

// CLI interface
if (require.main === module) {
  const updater = new HatchOSUpdater();
  const command = process.argv[2];
  
  switch (command) {
    case 'check':
      updater.checkForUpdates().then(result => {
        if (result.available) {
          console.log(`Update available: ${result.current} -> ${result.latest}`);
          process.exit(0);
        } else {
          console.log('No updates available');
          process.exit(1);
        }
      });
      break;
      
    case 'update':
      updater.checkForUpdates().then(result => {
        if (result.available) {
          return updater.performUpdate(result);
        } else {
          console.log('No updates available');
          return false;
        }
      }).then(success => {
        process.exit(success ? 0 : 1);
      });
      break;
      
    case 'auto':
      updater.startAutoUpdater();
      break;
      
    default:
      console.log('Usage: node update-manager.js <command>');
      console.log('Commands:');
      console.log('  check  - Check for updates');
      console.log('  update - Download and install updates');  
      console.log('  auto   - Start auto-updater daemon');
      process.exit(1);
  }
}

module.exports = HatchOSUpdater;