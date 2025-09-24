const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');

// Initialize database
const dbPath = path.join(__dirname, '../../data/hatch.db');
fs.ensureDirSync(path.dirname(dbPath));

const db = new sqlite3.Database(dbPath);

// Create tables if they don't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      otp_secret TEXT,
      role TEXT DEFAULT 'student',
      institution TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS auth_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      success INTEGER,
      ip_address TEXT,
      user_agent TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  // Create default admin user if none exists
  db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'", (err, row) => {
    if (err) {
      console.error('Error checking for admin user:', err);
      return;
    }
    
    if (row.count === 0) {
      console.log('Creating default admin user...');
      createUser({
        username: 'admin',
        password: 'admin123',
        pin: '123456',
        role: 'admin',
        institution: 'Zylon Labs'
      });
    }
  });

  // Create some demo users
  const demoUsers = [
    {
      username: 'student1',
      password: 'student123',
      pin: '111111',
      role: 'student',
      institution: 'Demo School'
    },
    {
      username: 'teacher1',
      password: 'teacher123',
      pin: '222222',
      role: 'teacher',
      institution: 'Demo School'
    },
    {
      username: 'developer1',
      password: 'dev123',
      pin: '333333',
      role: 'developer',
      institution: 'Zylon Labs'
    }
  ];

  demoUsers.forEach(user => {
    db.get("SELECT id FROM users WHERE username = ?", [user.username], (err, row) => {
      if (err) {
        console.error('Error checking user:', err);
        return;
      }
      
      if (!row) {
        createUser(user);
      }
    });
  });
});

const JWT_SECRET = process.env.JWT_SECRET || 'hatch_os_secret_key_2024';

async function createUser({ username, password, pin, role = 'student', institution = 'Demo School' }) {
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const pinHash = await bcrypt.hash(pin, 12);
    
    // Generate OTP secret for potential 2FA
    const otpSecret = speakeasy.generateSecret({
      name: `Hatch OS (${username})`,
      issuer: 'Zylon Labs'
    }).base32;

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO users (username, password_hash, pin_hash, otp_secret, role, institution) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [username, passwordHash, pinHash, otpSecret, role, institution],
        function(err) {
          if (err) {
            console.error('Error creating user:', err);
            reject(err);
          } else {
            console.log(`Created user: ${username} (${role})`);
            resolve({ id: this.lastID, username, role, institution });
          }
        }
      );
    });
  } catch (error) {
    console.error('Error in createUser:', error);
    throw error;
  }
}

async function authenticateUser({ username, password, pin, otp }) {
  try {
    // Step 1: Basic username/password authentication
    const user = await new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM users WHERE username = ? AND active = 1",
        [username],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!user) {
      await logAuthAttempt(null, username, false, 'User not found');
      return { success: false, message: 'Invalid credentials' };
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      await logAuthAttempt(user.id, username, false, 'Invalid password');
      return { success: false, message: 'Invalid credentials' };
    }

    // Step 2: PIN verification
    if (pin) {
      const pinValid = await bcrypt.compare(pin, user.pin_hash);
      if (!pinValid) {
        await logAuthAttempt(user.id, username, false, 'Invalid PIN');
        return { success: false, message: 'Invalid PIN' };
      }
    } else {
      await logAuthAttempt(user.id, username, false, 'PIN required');
      return { success: false, message: 'PIN is required' };
    }

    // Step 3: Optional OTP verification
    if (otp && user.otp_secret) {
      const otpValid = speakeasy.totp.verify({
        secret: user.otp_secret,
        encoding: 'base32',
        token: otp,
        window: 2
      });

      if (!otpValid) {
        await logAuthAttempt(user.id, username, false, 'Invalid OTP');
        return { success: false, message: 'Invalid OTP' };
      }
    }

    // Update last login
    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?",
        [user.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        institution: user.institution 
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    await logAuthAttempt(user.id, username, true, 'Successful login');

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        institution: user.institution
      },
      token
    };

  } catch (error) {
    console.error('Authentication error:', error);
    return { success: false, message: 'Authentication failed' };
  }
}

async function logAuthAttempt(userId, username, success, details = '') {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO auth_logs (user_id, username, success, timestamp, details) 
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [userId, username, success ? 1 : 0, details],
      function(err) {
        if (err) {
          console.error('Error logging auth attempt:', err);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

async function getUserById(id) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT id, username, role, institution, active FROM users WHERE id = ?",
      [id],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

async function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await getUserById(decoded.id);
    return user;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

async function getAuthLogs(limit = 100) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT al.*, u.username, u.role, u.institution 
       FROM auth_logs al 
       LEFT JOIN users u ON al.user_id = u.id 
       ORDER BY al.timestamp DESC 
       LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

// Security functions
async function changePassword(userId, currentPassword, newPassword) {
  try {
    const user = await getUserById(userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // Get current password hash
    const userData = await new Promise((resolve, reject) => {
      db.get("SELECT password_hash FROM users WHERE id = ?", [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Verify current password
    const currentValid = await bcrypt.compare(currentPassword, userData.password_hash);
    if (!currentValid) {
      return { success: false, message: 'Current password is incorrect' };
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        [newPasswordHash, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    return { success: true, message: 'Password updated successfully' };
  } catch (error) {
    console.error('Change password error:', error);
    return { success: false, message: 'Failed to change password' };
  }
}

module.exports = {
  authenticateUser,
  createUser,
  getUserById,
  verifyToken,
  getAuthLogs,
  changePassword,
  logAuthAttempt
};