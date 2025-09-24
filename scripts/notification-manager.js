#!/usr/bin/env node

/**
 * Hatch OS Update Notification System
 * Sends notifications about system updates via various channels
 */

const https = require('https');
const fs = require('fs-extra');
const path = require('path');

class NotificationManager {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    const configPath = path.join(__dirname, '../config/notifications.json');
    
    const defaultConfig = {
      enabled: true,
      channels: {
        slack: {
          enabled: false,
          webhook: process.env.SLACK_WEBHOOK_URL,
          channel: '#hatch-os-updates'
        },
        discord: {
          enabled: false,
          webhook: process.env.DISCORD_WEBHOOK_URL
        },
        email: {
          enabled: false,
          smtp: {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS
            }
          },
          to: process.env.ADMIN_EMAIL
        },
        webhook: {
          enabled: !!process.env.HATCH_WEBHOOK_URL,
          url: process.env.HATCH_WEBHOOK_URL,
          method: 'POST'
        }
      },
      templates: {
        updateStart: {
          title: '🔄 Hatch OS Update Started',
          color: '#FFA500'
        },
        updateSuccess: {
          title: '✅ Hatch OS Update Completed',
          color: '#00FF00'
        },
        updateFailed: {
          title: '❌ Hatch OS Update Failed',
          color: '#FF0000'
        },
        systemError: {
          title: '⚠️ Hatch OS System Error',
          color: '#FF6600'
        }
      }
    };

    try {
      if (fs.existsSync(configPath)) {
        const userConfig = fs.readJsonSync(configPath);
        return { ...defaultConfig, ...userConfig };
      }
    } catch (error) {
      console.warn('Failed to load notification config, using defaults');
    }

    return defaultConfig;
  }

  async sendNotification(type, message, details = {}) {
    if (!this.config.enabled) {
      return;
    }

    const template = this.config.templates[type] || this.config.templates.systemError;
    
    const notification = {
      type,
      title: template.title,
      message,
      timestamp: new Date().toISOString(),
      hostname: require('os').hostname(),
      version: this.getSystemVersion(),
      ...details
    };

    const results = await Promise.allSettled([
      this.sendSlackNotification(notification, template),
      this.sendDiscordNotification(notification, template),
      this.sendEmailNotification(notification, template),
      this.sendWebhookNotification(notification, template)
    ]);

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`📨 Sent notifications: ${successful} successful, ${failed} failed`);
  }

  async sendSlackNotification(notification, template) {
    if (!this.config.channels.slack.enabled || !this.config.channels.slack.webhook) {
      return;
    }

    const payload = {
      channel: this.config.channels.slack.channel,
      username: 'Hatch OS',
      icon_emoji: ':computer:',
      attachments: [{
        color: template.color,
        title: template.title,
        text: notification.message,
        fields: [
          {
            title: 'Hostname',
            value: notification.hostname,
            short: true
          },
          {
            title: 'Version',
            value: notification.version,
            short: true
          },
          {
            title: 'Timestamp',
            value: notification.timestamp,
            short: false
          }
        ]
      }]
    };

    return this.sendHttpRequest(this.config.channels.slack.webhook, 'POST', payload);
  }

  async sendDiscordNotification(notification, template) {
    if (!this.config.channels.discord.enabled || !this.config.channels.discord.webhook) {
      return;
    }

    const payload = {
      embeds: [{
        title: template.title,
        description: notification.message,
        color: parseInt(template.color.replace('#', ''), 16),
        fields: [
          {
            name: 'Hostname',
            value: notification.hostname,
            inline: true
          },
          {
            name: 'Version',
            value: notification.version,
            inline: true
          }
        ],
        timestamp: notification.timestamp
      }]
    };

    return this.sendHttpRequest(this.config.channels.discord.webhook, 'POST', payload);
  }

  async sendEmailNotification(notification, template) {
    if (!this.config.channels.email.enabled) {
      return;
    }

    // Email implementation would require nodemailer or similar
    // This is a placeholder for the email sending logic
    console.log('📧 Email notification would be sent here');
  }

  async sendWebhookNotification(notification, template) {
    if (!this.config.channels.webhook.enabled || !this.config.channels.webhook.url) {
      return;
    }

    const payload = {
      ...notification,
      color: template.color
    };

    return this.sendHttpRequest(
      this.config.channels.webhook.url,
      this.config.channels.webhook.method,
      payload
    );
  }

  async sendHttpRequest(url, method, data) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const payload = JSON.stringify(data);

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'Hatch-OS-Notifier/1.0.0'
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseData);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  getSystemVersion() {
    try {
      const packageJson = require('../package.json');
      return packageJson.version;
    } catch (error) {
      return '1.0.0';
    }
  }

  async testNotifications() {
    console.log('🧪 Testing notification channels...');
    
    await this.sendNotification(
      'updateStart',
      'This is a test notification from Hatch OS',
      { test: true }
    );
  }
}

// CLI interface
if (require.main === module) {
  const notifier = new NotificationManager();
  const command = process.argv[2];
  const message = process.argv[3] || 'Test notification';

  switch (command) {
    case 'test':
      notifier.testNotifications();
      break;
      
    case 'send':
      const type = process.argv[3] || 'systemError';
      const msg = process.argv[4] || 'Manual notification';
      notifier.sendNotification(type, msg);
      break;
      
    default:
      console.log('Usage: node notification-manager.js <command>');
      console.log('Commands:');
      console.log('  test           - Test all notification channels');
      console.log('  send <type>    - Send a notification');
      console.log('  Types: updateStart, updateSuccess, updateFailed, systemError');
      break;
  }
}

module.exports = NotificationManager;