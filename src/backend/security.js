const fs = require('fs-extra');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Security monitoring and management
class SecurityManager {
  constructor() {
    this.securityDb = this.initializeSecurityDb();
    this.alerts = [];
    this.blockedIPs = new Set();
    this.loginAttempts = new Map();
    
    this.startSecurityMonitoring();
  }

  initializeSecurityDb() {
    const dbPath = path.join(__dirname, '../../data/security.db');
    fs.ensureDirSync(path.dirname(dbPath));
    
    const db = new sqlite3.Database(dbPath);
    
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS security_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          description TEXT NOT NULL,
          ip_address TEXT,
          user_id TEXT,
          details TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      db.run(`
        CREATE TABLE IF NOT EXISTS blocked_ips (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ip_address TEXT UNIQUE NOT NULL,
          reason TEXT NOT NULL,
          blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME,
          active INTEGER DEFAULT 1
        )
      `);
      
      db.run(`
        CREATE TABLE IF NOT EXISTS security_policies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          policy_name TEXT UNIQUE NOT NULL,
          policy_value TEXT NOT NULL,
          description TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Insert default security policies
      const defaultPolicies = [
        ['max_login_attempts', '5', 'Maximum login attempts before account lockout'],
        ['lockout_duration', '300', 'Account lockout duration in seconds'],
        ['session_timeout', '28800', 'Session timeout in seconds (8 hours)'],
        ['password_min_length', '8', 'Minimum password length'],
        ['require_pin', '1', 'Require PIN for authentication'],
        ['enable_2fa', '0', 'Enable two-factor authentication'],
        ['block_suspicious_ips', '1', 'Automatically block suspicious IP addresses']
      ];
      
      defaultPolicies.forEach(([name, value, description]) => {
        db.run(
          'INSERT OR IGNORE INTO security_policies (policy_name, policy_value, description) VALUES (?, ?, ?)',
          [name, value, description]
        );
      });
    });
    
    return db;
  }

  async logSecurityEvent(eventType, severity, description, ipAddress = null, userId = null, details = null) {
    return new Promise((resolve, reject) => {
      this.securityDb.run(
        `INSERT INTO security_events (event_type, severity, description, ip_address, user_id, details) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [eventType, severity, description, ipAddress, userId, JSON.stringify(details)],
        function(err) {
          if (err) {
            console.error('Failed to log security event:', err);
            reject(err);
          } else {
            console.log(`🔒 Security Event: [${severity.toUpperCase()}] ${description}`);
            resolve(this.lastID);
          }
        }
      );
    });
  }

  async checkLoginAttempts(ipAddress, username) {
    const key = `${ipAddress}:${username}`;
    const attempts = this.loginAttempts.get(key) || { count: 0, lastAttempt: 0 };
    const now = Date.now();
    
    // Reset attempts if more than 1 hour has passed
    if (now - attempts.lastAttempt > 3600000) {
      attempts.count = 0;
    }
    
    attempts.count++;
    attempts.lastAttempt = now;
    this.loginAttempts.set(key, attempts);
    
    const maxAttempts = await this.getSecurityPolicy('max_login_attempts');
    
    if (attempts.count >= parseInt(maxAttempts)) {
      await this.blockIP(ipAddress, `Exceeded login attempts for user ${username}`);
      await this.logSecurityEvent(
        'login_blocked',
        'high',
        `IP ${ipAddress} blocked for excessive login attempts`,
        ipAddress,
        username,
        { attempts: attempts.count }
      );
      
      return { blocked: true, attempts: attempts.count };
    }
    
    return { blocked: false, attempts: attempts.count };
  }

  async blockIP(ipAddress, reason, duration = null) {
    const expiresAt = duration ? new Date(Date.now() + duration * 1000) : null;
    
    return new Promise((resolve, reject) => {
      this.securityDb.run(
        'INSERT OR REPLACE INTO blocked_ips (ip_address, reason, expires_at) VALUES (?, ?, ?)',
        [ipAddress, reason, expiresAt],
        function(err) {
          if (err) {
            reject(err);
          } else {
            this.blockedIPs.add(ipAddress);
            console.log(`🚫 IP ${ipAddress} blocked: ${reason}`);
            resolve(this.lastID);
          }
        }
      );
    });
  }

  isIPBlocked(ipAddress) {
    return this.blockedIPs.has(ipAddress);
  }

  async getSecurityPolicy(policyName) {
    return new Promise((resolve, reject) => {
      this.securityDb.get(
        'SELECT policy_value FROM security_policies WHERE policy_name = ?',
        [policyName],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row ? row.policy_value : null);
          }
        }
      );
    });
  }

  async updateSecurityPolicy(policyName, policyValue) {
    return new Promise((resolve, reject) => {
      this.securityDb.run(
        'UPDATE security_policies SET policy_value = ?, updated_at = CURRENT_TIMESTAMP WHERE policy_name = ?',
        [policyValue, policyName],
        function(err) {
          if (err) {
            reject(err);
          } else {
            console.log(`🔧 Security policy updated: ${policyName} = ${policyValue}`);
            resolve(this.changes);
          }
        }
      );
    });
  }

  async getSecurityAlerts(limit = 50) {
    return new Promise((resolve, reject) => {
      this.securityDb.all(
        `SELECT * FROM security_events 
         WHERE severity IN ('high', 'critical') 
         ORDER BY timestamp DESC 
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(row => ({
              ...row,
              details: row.details ? JSON.parse(row.details) : null,
              timestamp: new Date(row.timestamp).getTime()
            })));
          }
        }
      );
    });
  }

  async performSecurityCheck() {
    console.log('🔍 Performing security check...');
    
    const checks = [
      this.checkSystemIntegrity(),
      this.checkUnauthorizedAccess(),
      this.checkResourceUsage(),
      this.cleanupExpiredBlocks(),
      this.scanForMalware()
    ];

    try {
      const results = await Promise.all(checks);
      const issues = results.filter(result => !result.success);
      
      if (issues.length > 0) {
        console.log(`⚠️  Found ${issues.length} security issues`);
        
        for (const issue of issues) {
          await this.logSecurityEvent(
            'security_check',
            'medium',
            issue.message,
            null,
            null,
            issue.details
          );
        }
      } else {
        console.log('✅ Security check passed - no issues found');
      }
      
      return { success: true, issues };
    } catch (error) {
      console.error('Security check failed:', error);
      await this.logSecurityEvent(
        'security_check_failed',
        'high',
        'Security check process failed',
        null,
        null,
        { error: error.message }
      );
      
      return { success: false, error: error.message };
    }
  }

  async checkSystemIntegrity() {
    try {
      // Check for critical system files
      const criticalFiles = [
        '/etc/passwd',
        '/etc/shadow',
        '/etc/sudoers'
      ];
      
      for (const file of criticalFiles) {
        if (process.platform === 'linux') {
          const exists = await fs.pathExists(file);
          if (!exists) {
            return {
              success: false,
              message: `Critical system file missing: ${file}`,
              details: { file }
            };
          }
        }
      }
      
      // Check Hatch OS files integrity
      const hatchFiles = [
        path.join(__dirname, '../main.js'),
        path.join(__dirname, 'server.js'),
        path.join(__dirname, 'auth.js')
      ];
      
      for (const file of hatchFiles) {
        const exists = await fs.pathExists(file);
        if (!exists) {
          return {
            success: false,
            message: `Hatch OS file missing: ${path.basename(file)}`,
            details: { file }
          };
        }
      }
      
      return { success: true, message: 'System integrity check passed' };
    } catch (error) {
      return {
        success: false,
        message: 'System integrity check failed',
        details: { error: error.message }
      };
    }
  }

  async checkUnauthorizedAccess() {
    try {
      // Check for suspicious login patterns
      const recentEvents = await new Promise((resolve, reject) => {
        this.securityDb.all(
          `SELECT * FROM security_events 
           WHERE event_type = 'authentication' 
           AND timestamp > datetime('now', '-1 hour')
           ORDER BY timestamp DESC`,
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      const failedLogins = recentEvents.filter(event => 
        event.description.includes('failed') || event.description.includes('invalid')
      );

      if (failedLogins.length > 10) {
        return {
          success: false,
          message: `High number of failed login attempts: ${failedLogins.length}`,
          details: { failedLogins: failedLogins.length }
        };
      }

      return { success: true, message: 'No unauthorized access detected' };
    } catch (error) {
      return {
        success: false,
        message: 'Unauthorized access check failed',
        details: { error: error.message }
      };
    }
  }

  async checkResourceUsage() {
    try {
      const systemMonitor = require('./systemMonitor');
      const stats = systemMonitor.getSystemStats();
      
      // Check for resource exhaustion attacks
      if (stats.cpu > 95) {
        return {
          success: false,
          message: `Extremely high CPU usage: ${stats.cpu}%`,
          details: { cpu: stats.cpu }
        };
      }
      
      if (stats.memory.percentage > 95) {
        return {
          success: false,
          message: `Extremely high memory usage: ${stats.memory.percentage}%`,
          details: { memory: stats.memory.percentage }
        };
      }
      
      return { success: true, message: 'Resource usage within normal limits' };
    } catch (error) {
      return {
        success: false,
        message: 'Resource usage check failed',
        details: { error: error.message }
      };
    }
  }

  async cleanupExpiredBlocks() {
    try {
      const expired = await new Promise((resolve, reject) => {
        this.securityDb.run(
          'UPDATE blocked_ips SET active = 0 WHERE expires_at IS NOT NULL AND expires_at < datetime("now")',
          function(err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });

      if (expired > 0) {
        console.log(`🧹 Cleaned up ${expired} expired IP blocks`);
      }

      return { success: true, message: `Cleaned up ${expired} expired blocks` };
    } catch (error) {
      return {
        success: false,
        message: 'Cleanup expired blocks failed',
        details: { error: error.message }
      };
    }
  }

  async scanForMalware() {
    try {
      // Basic malware detection - check for suspicious files
      const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.com'];
      const uploadDir = path.join(__dirname, '../../uploads');
      
      if (await fs.pathExists(uploadDir)) {
        const files = await fs.readdir(uploadDir);
        const suspiciousFiles = files.filter(file => 
          suspiciousExtensions.some(ext => file.toLowerCase().endsWith(ext))
        );
        
        if (suspiciousFiles.length > 0) {
          return {
            success: false,
            message: `Found ${suspiciousFiles.length} suspicious files`,
            details: { files: suspiciousFiles }
          };
        }
      }
      
      return { success: true, message: 'No malware detected' };
    } catch (error) {
      return {
        success: false,
        message: 'Malware scan failed',
        details: { error: error.message }
      };
    }
  }

  startSecurityMonitoring() {
    // Load blocked IPs into memory
    this.securityDb.all(
      'SELECT ip_address FROM blocked_ips WHERE active = 1',
      (err, rows) => {
        if (!err) {
          rows.forEach(row => this.blockedIPs.add(row.ip_address));
          console.log(`🔒 Loaded ${rows.length} blocked IP addresses`);
        }
      }
    );

    console.log('🛡️  Security monitoring started');
  }

  // Network security functions
  async enableFirewall() {
    if (process.platform !== 'linux') {
      return { success: false, message: 'Firewall only supported on Linux' };
    }

    try {
      const { exec } = require('child_process');
      
      return new Promise((resolve) => {
        exec('sudo ufw --force enable', (error, stdout, stderr) => {
          if (error) {
            resolve({ success: false, error: error.message });
          } else {
            resolve({ success: true, message: 'Firewall enabled' });
          }
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async configureFirewallRules() {
    if (process.platform !== 'linux') {
      return { success: false, message: 'Firewall only supported on Linux' };
    }

    try {
      const { exec } = require('child_process');
      
      const commands = [
        'sudo ufw default deny incoming',
        'sudo ufw default allow outgoing',
        'sudo ufw allow 22',    // SSH
        'sudo ufw allow 3000',  // Hatch OS Frontend
        'sudo ufw allow 3001'   // Hatch OS Backend
      ];

      for (const command of commands) {
        await new Promise((resolve, reject) => {
          exec(command, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }

      return { success: true, message: 'Firewall rules configured' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Create singleton instance
const securityManager = new SecurityManager();

module.exports = {
  logSecurityEvent: (type, severity, description, ip, userId, details) => 
    securityManager.logSecurityEvent(type, severity, description, ip, userId, details),
  checkLoginAttempts: (ip, username) => 
    securityManager.checkLoginAttempts(ip, username),
  blockIP: (ip, reason, duration) => 
    securityManager.blockIP(ip, reason, duration),
  isIPBlocked: (ip) => 
    securityManager.isIPBlocked(ip),
  getSecurityAlerts: (limit) => 
    securityManager.getSecurityAlerts(limit),
  performSecurityCheck: () => 
    securityManager.performSecurityCheck(),
  getSecurityPolicy: (policy) => 
    securityManager.getSecurityPolicy(policy),
  updateSecurityPolicy: (policy, value) => 
    securityManager.updateSecurityPolicy(policy, value),
  enableFirewall: () => 
    securityManager.enableFirewall(),
  configureFirewallRules: () => 
    securityManager.configureFirewallRules()
};