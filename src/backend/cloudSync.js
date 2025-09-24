const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');

// Cloud sync configuration
const CLOUD_CONFIG = {
  baseUrl: process.env.ZYLON_CLOUD_URL || 'https://api.zylonlabs.com',
  apiKey: process.env.ZYLON_API_KEY || 'demo_api_key',
  syncInterval: 2000, // 2 seconds as per PRD
  batchSize: 100,
  retryAttempts: 3,
  timeout: 5000
};

// Initialize sync database
const syncDbPath = path.join(__dirname, '../../data/sync.db');
fs.ensureDirSync(path.dirname(syncDbPath));

const syncDb = new sqlite3.Database(syncDbPath);

// Create sync tables
syncDb.serialize(() => {
  syncDb.run(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      event_type TEXT,
      data TEXT,
      timestamp INTEGER,
      sync_status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  syncDb.run(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT,
      records_synced INTEGER,
      success INTEGER,
      error_message TEXT,
      sync_duration INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  syncDb.run(`
    CREATE TABLE IF NOT EXISTS user_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      activity_type TEXT,
      details TEXT,
      timestamp INTEGER,
      synced INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

class CloudSyncManager {
  constructor() {
    this.isOnline = true;
    this.syncInProgress = false;
    this.lastSyncTime = 0;
    this.pendingData = [];
  }

  async syncData(data) {
    try {
      // Add to sync queue
      await this.addToSyncQueue(data);
      
      // If we're online and not currently syncing, trigger immediate sync
      if (this.isOnline && !this.syncInProgress) {
        await this.performSync();
      }

      return { success: true, queued: true };
    } catch (error) {
      console.error('Sync data error:', error);
      return { success: false, error: error.message };
    }
  }

  async addToSyncQueue(data) {
    return new Promise((resolve, reject) => {
      const eventData = JSON.stringify(data);
      
      syncDb.run(
        `INSERT INTO sync_queue (user_id, event_type, data, timestamp) VALUES (?, ?, ?, ?)`,
        [data.userId || 'system', data.type || 'activity', eventData, Date.now()],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  async performSync() {
    if (this.syncInProgress) {
      return { success: true, message: 'Sync already in progress' };
    }

    this.syncInProgress = true;
    const batchId = `batch_${Date.now()}`;
    const startTime = Date.now();

    try {
      // Get pending records
      const pendingRecords = await this.getPendingRecords(CLOUD_CONFIG.batchSize);
      
      if (pendingRecords.length === 0) {
        this.syncInProgress = false;
        return { success: true, message: 'No data to sync' };
      }

      console.log(`Starting sync batch ${batchId} with ${pendingRecords.length} records`);

      // Prepare data for sync
      const syncData = {
        batchId,
        timestamp: Date.now(),
        records: pendingRecords.map(record => ({
          id: record.id,
          userId: record.user_id,
          eventType: record.event_type,
          data: JSON.parse(record.data),
          timestamp: record.timestamp
        }))
      };

      // Attempt to sync with cloud
      const result = await this.sendToCloud(syncData);

      if (result.success) {
        // Mark records as synced
        await this.markRecordsSynced(pendingRecords.map(r => r.id));
        
        // Log successful sync
        await this.logSync(batchId, pendingRecords.length, true, null, Date.now() - startTime);
        
        console.log(`✅ Sync batch ${batchId} completed successfully`);
      } else {
        // Handle sync failure
        await this.handleSyncFailure(pendingRecords, result.error);
        await this.logSync(batchId, 0, false, result.error, Date.now() - startTime);
        
        console.error(`❌ Sync batch ${batchId} failed:`, result.error);
      }

      this.lastSyncTime = Date.now();
      return result;

    } catch (error) {
      console.error('Sync error:', error);
      await this.logSync(batchId, 0, false, error.message, Date.now() - startTime);
      return { success: false, error: error.message };
    } finally {
      this.syncInProgress = false;
    }
  }

  async sendToCloud(data) {
    try {
      // Check if we're in demo mode (no real cloud)
      if (CLOUD_CONFIG.apiKey === 'demo_api_key') {
        // Simulate cloud sync for demo
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
        
        // Simulate occasional failures for testing
        if (Math.random() < 0.05) {
          throw new Error('Simulated cloud sync failure');
        }
        
        return { success: true, batchId: data.batchId, recordsProcessed: data.records.length };
      }

      const response = await axios.post(
        `${CLOUD_CONFIG.baseUrl}/api/v1/hatch-os/sync`,
        data,
        {
          headers: {
            'Authorization': `Bearer ${CLOUD_CONFIG.apiKey}`,
            'Content-Type': 'application/json',
            'X-Hatch-Version': '1.0.0'
          },
          timeout: CLOUD_CONFIG.timeout
        }
      );

      return { success: true, ...response.data };
    } catch (error) {
      this.isOnline = false;
      
      // Set back online after delay
      setTimeout(() => {
        this.isOnline = true;
      }, 30000);

      if (error.response) {
        return { success: false, error: `HTTP ${error.response.status}: ${error.response.data?.message || 'Unknown error'}` };
      } else if (error.request) {
        return { success: false, error: 'Network error - offline mode activated' };
      } else {
        return { success: false, error: error.message };
      }
    }
  }

  async getPendingRecords(limit) {
    return new Promise((resolve, reject) => {
      syncDb.all(
        `SELECT * FROM sync_queue 
         WHERE sync_status = 'pending' AND retry_count < ? 
         ORDER BY created_at ASC 
         LIMIT ?`,
        [CLOUD_CONFIG.retryAttempts, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async markRecordsSynced(recordIds) {
    return new Promise((resolve, reject) => {
      const placeholders = recordIds.map(() => '?').join(',');
      syncDb.run(
        `UPDATE sync_queue SET sync_status = 'synced' WHERE id IN (${placeholders})`,
        recordIds,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async handleSyncFailure(records, error) {
    const recordIds = records.map(r => r.id);
    
    return new Promise((resolve, reject) => {
      const placeholders = recordIds.map(() => '?').join(',');
      syncDb.run(
        `UPDATE sync_queue 
         SET retry_count = retry_count + 1, sync_status = 'failed' 
         WHERE id IN (${placeholders})`,
        recordIds,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async logSync(batchId, recordsCount, success, errorMessage, duration) {
    return new Promise((resolve, reject) => {
      syncDb.run(
        `INSERT INTO sync_logs (batch_id, records_synced, success, error_message, sync_duration) 
         VALUES (?, ?, ?, ?, ?)`,
        [batchId, recordsCount, success ? 1 : 0, errorMessage, duration],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async logEvent(eventData) {
    try {
      // Add to local activity log
      await new Promise((resolve, reject) => {
        syncDb.run(
          `INSERT INTO user_activity (user_id, activity_type, details, timestamp) 
           VALUES (?, ?, ?, ?)`,
          [
            eventData.userId || 'system',
            eventData.type || 'activity',
            JSON.stringify(eventData),
            eventData.timestamp || Date.now()
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Add to sync queue for cloud sync
      await this.addToSyncQueue(eventData);

      return { success: true };
    } catch (error) {
      console.error('Log event error:', error);
      return { success: false, error: error.message };
    }
  }

  async performScheduledSync() {
    if (!this.isOnline) {
      console.log('⚠️  Offline mode - skipping scheduled sync');
      return;
    }

    const timeSinceLastSync = Date.now() - this.lastSyncTime;
    
    if (timeSinceLastSync >= CLOUD_CONFIG.syncInterval) {
      await this.performSync();
    }
  }

  async getRecentActivity(limit = 50) {
    return new Promise((resolve, reject) => {
      syncDb.all(
        `SELECT * FROM user_activity 
         ORDER BY timestamp DESC 
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else {
            const activities = rows.map(row => ({
              ...row,
              details: JSON.parse(row.details)
            }));
            resolve(activities);
          }
        }
      );
    });
  }

  async getSyncStats() {
    return new Promise((resolve, reject) => {
      syncDb.get(`
        SELECT 
          COUNT(*) as total_events,
          COUNT(CASE WHEN sync_status = 'synced' THEN 1 END) as synced_events,
          COUNT(CASE WHEN sync_status = 'pending' THEN 1 END) as pending_events,
          COUNT(CASE WHEN sync_status = 'failed' THEN 1 END) as failed_events
        FROM sync_queue
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  getStatus() {
    return {
      isOnline: this.isOnline,
      syncInProgress: this.syncInProgress,
      lastSyncTime: this.lastSyncTime,
      syncInterval: CLOUD_CONFIG.syncInterval
    };
  }
}

// Create singleton instance
const cloudSync = new CloudSyncManager();

module.exports = {
  syncData: (data) => cloudSync.syncData(data),
  logEvent: (data) => cloudSync.logEvent(data),
  performScheduledSync: () => cloudSync.performScheduledSync(),
  getRecentActivity: (limit) => cloudSync.getRecentActivity(limit),
  getSyncStats: () => cloudSync.getSyncStats(),
  getStatus: () => cloudSync.getStatus()
};