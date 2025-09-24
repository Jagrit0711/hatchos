const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔨 Building Hatch OS System...');

const buildConfig = {
  outputDir: path.join(__dirname, '../dist'),
  systemDir: path.join(__dirname, '../system'),
  configDir: path.join(__dirname, '../config'),
  appsDir: path.join(__dirname, '../apps')
};

async function buildSystem() {
  try {
    // Clean previous build
    await fs.remove(buildConfig.outputDir);
    await fs.ensureDir(buildConfig.outputDir);
    
    console.log('📁 Creating system structure...');
    
    // Create system directories
    const systemDirs = [
      'bin',
      'etc/hatch',
      'lib/hatch',
      'share/hatch',
      'var/lib/hatch',
      'var/log/hatch',
      'opt/hatch-apps'
    ];
    
    for (const dir of systemDirs) {
      await fs.ensureDir(path.join(buildConfig.outputDir, dir));
    }
    
    // Build React frontend
    console.log('⚛️  Building React frontend...');
    execSync('npm run build', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    
    // Copy built frontend
    await fs.copy(
      path.join(__dirname, '../build'),
      path.join(buildConfig.outputDir, 'share/hatch/frontend')
    );
    
    // Copy backend files
    console.log('🔧 Copying backend files...');
    await fs.copy(
      path.join(__dirname, '../src/backend'),
      path.join(buildConfig.outputDir, 'lib/hatch/backend')
    );
    
    // Copy system configuration
    console.log('⚙️  Copying system configuration...');
    await fs.copy(
      buildConfig.configDir,
      path.join(buildConfig.outputDir, 'etc/hatch')
    );
    
    // Copy applications
    console.log('📱 Copying applications...');
    await fs.copy(
      buildConfig.appsDir,
      path.join(buildConfig.outputDir, 'opt/hatch-apps')
    );
    
    // Create startup scripts
    await createStartupScripts();
    
    // Create system configuration files
    await createSystemConfigs();
    
    // Create package information
    await createPackageInfo();
    
    console.log('✅ Build completed successfully!');
    console.log(`📦 Output directory: ${buildConfig.outputDir}`);
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

async function createStartupScripts() {
  console.log('📜 Creating startup scripts...');
  
  // Main startup script
  const startupScript = `#!/bin/bash
# Hatch OS Startup Script

set -e

HATCH_HOME="/opt/hatch-os"
HATCH_DATA="/var/lib/hatch"
HATCH_LOGS="/var/log/hatch"

# Ensure directories exist
mkdir -p "$HATCH_DATA" "$HATCH_LOGS"

# Set permissions
chown -R hatch:hatch "$HATCH_DATA" "$HATCH_LOGS"

# Start backend server
cd "$HATCH_HOME/lib/hatch/backend"
node server.js &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Start frontend (Electron)
cd "$HATCH_HOME"
export DISPLAY=:0
npm start &
FRONTEND_PID=$!

# Create PID files
echo $BACKEND_PID > "$HATCH_DATA/backend.pid"
echo $FRONTEND_PID > "$HATCH_DATA/frontend.pid"

echo "🚀 Hatch OS started"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"

# Wait for processes
wait
`;

  await fs.writeFile(
    path.join(buildConfig.outputDir, 'bin/start-hatch-os'),
    startupScript
  );
  
  // Shutdown script
  const shutdownScript = `#!/bin/bash
# Hatch OS Shutdown Script

HATCH_DATA="/var/lib/hatch"

echo "🛑 Stopping Hatch OS..."

# Kill processes using PID files
if [ -f "$HATCH_DATA/frontend.pid" ]; then
    FRONTEND_PID=$(cat "$HATCH_DATA/frontend.pid")
    kill $FRONTEND_PID 2>/dev/null || true
    rm -f "$HATCH_DATA/frontend.pid"
    echo "Frontend stopped"
fi

if [ -f "$HATCH_DATA/backend.pid" ]; then
    BACKEND_PID=$(cat "$HATCH_DATA/backend.pid")
    kill $BACKEND_PID 2>/dev/null || true
    rm -f "$HATCH_DATA/backend.pid"
    echo "Backend stopped"
fi

echo "✅ Hatch OS stopped"
`;

  await fs.writeFile(
    path.join(buildConfig.outputDir, 'bin/stop-hatch-os'),
    shutdownScript
  );
  
  // Make scripts executable
  await fs.chmod(path.join(buildConfig.outputDir, 'bin/start-hatch-os'), 0o755);
  await fs.chmod(path.join(buildConfig.outputDir, 'bin/stop-hatch-os'), 0o755);
}

async function createSystemConfigs() {
  console.log('⚙️  Creating system configurations...');
  
  // Hatch OS main configuration
  const hatchConfig = {
    version: "1.0.0",
    name: "Hatch OS",
    developer: "Zylon Labs",
    
    system: {
      kioskMode: true,
      autoLogin: true,
      distractionFree: false,
      developmentMode: false
    },
    
    security: {
      multiFactorAuth: true,
      sessionTimeout: 28800, // 8 hours
      maxLoginAttempts: 3,
      lockoutDuration: 300 // 5 minutes
    },
    
    cloud: {
      syncEnabled: true,
      syncInterval: 2000, // 2 seconds
      batchSize: 100,
      retryAttempts: 3
    },
    
    ui: {
      theme: "default",
      language: "en",
      timezone: "UTC"
    },
    
    apps: {
      preInstalled: [
        "browser",
        "notes",
        "files",
        "code-editor",
        "calculator",
        "classroom"
      ],
      restricted: [
        "games",
        "social-media",
        "entertainment"
      ]
    }
  };
  
  await fs.writeJSON(
    path.join(buildConfig.outputDir, 'etc/hatch/hatch.json'),
    hatchConfig,
    { spaces: 2 }
  );
  
  // Desktop environment configuration
  const desktopConfig = `
# Hatch OS Desktop Configuration

# Window Manager Settings
openbox --config-file /etc/hatch/openbox.xml &

# Disable screen saver and power management
xset s off
xset -dpms
xset s noblank

# Set background
xsetroot -solid '#667eea'

# Start Hatch OS
/opt/hatch-os/bin/start-hatch-os
`;
  
  await fs.writeFile(
    path.join(buildConfig.outputDir, 'etc/hatch/desktop.conf'),
    desktopConfig
  );
  
  // Openbox window manager configuration
  const openboxConfig = `<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc" xmlns:xi="http://www.w3.org/2001/XInclude">
  <resistance>
    <strength>10</strength>
    <screen_edge_strength>20</screen_edge_strength>
  </resistance>
  
  <focus>
    <focusNew>yes</focusNew>
    <followMouse>no</followMouse>
    <focusLast>yes</focusLast>
    <underMouse>no</underMouse>
    <focusDelay>200</focusDelay>
    <raiseOnFocus>no</raiseOnFocus>
  </focus>
  
  <placement>
    <policy>Smart</policy>
    <center>yes</center>
    <monitor>Primary</monitor>
    <primaryMonitor>1</primaryMonitor>
  </placement>
  
  <theme>
    <name>Hatch</name>
    <titleLayout>NLIMC</titleLayout>
    <keepBorder>yes</keepBorder>
    <animateIconify>no</animateIconify>
    <font place="ActiveWindow">
      <name>sans</name>
      <size>8</size>
      <weight>bold</weight>
      <slant>normal</slant>
    </font>
    <font place="InactiveWindow">
      <name>sans</name>
      <size>8</size>
      <weight>bold</weight>
      <slant>normal</slant>
    </font>
  </theme>
  
  <keyboard>
    <chainQuitKey>C-g</chainQuitKey>
    <!-- Disable Alt+F4 to prevent accidental closes in kiosk mode -->
    <keybind key="A-F4"><action name="If"><query target="default">false</query></action></keybind>
    <!-- Emergency escape for developers -->
    <keybind key="C-A-S-E"><action name="Exit"/></keybind>
  </keyboard>
  
  <mouse>
    <dragThreshold>1</dragThreshold>
    <doubleClickTime>500</doubleClickTime>
    <screenEdgeWarpTime>0</screenEdgeWarpTime>
    <screenEdgeWarpMouse>false</screenEdgeWarpMouse>
  </mouse>
  
  <applications>
    <!-- Force all windows to be undecorated and maximized for kiosk mode -->
    <application class="*">
      <decor>no</decor>
      <maximized>true</maximized>
      <fullscreen>yes</fullscreen>
    </application>
  </applications>
</openbox_config>`;
  
  await fs.writeFile(
    path.join(buildConfig.outputDir, 'etc/hatch/openbox.xml'),
    openboxConfig
  );
}

async function createPackageInfo() {
  console.log('📦 Creating package information...');
  
  const packageInfo = {
    name: "hatch-os",
    version: "1.0.0",
    description: "Lightweight, secure, and customizable operating system for education",
    author: "Zylon Labs",
    license: "MIT",
    
    dependencies: {
      node: ">=16.0.0",
      npm: ">=8.0.0",
      electron: ">=23.0.0"
    },
    
    systemRequirements: {
      minRam: "1GB",
      minStorage: "8GB",
      supportedArchitectures: ["x86_64", "aarch64", "armv7l"],
      supportedOS: ["Debian 11+", "Ubuntu 20.04+", "Raspberry Pi OS"]
    },
    
    installation: {
      scriptPath: "scripts/install-hatch-os.sh",
      dataDirectory: "/var/lib/hatch",
      logDirectory: "/var/log/hatch",
      configDirectory: "/etc/hatch"
    },
    
    services: [
      {
        name: "hatch-backend",
        type: "systemd",
        description: "Hatch OS Backend Server"
      },
      {
        name: "hatch-frontend", 
        type: "systemd",
        description: "Hatch OS Frontend Application"
      }
    ],
    
    buildInfo: {
      buildDate: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch
    }
  };
  
  await fs.writeJSON(
    path.join(buildConfig.outputDir, 'package-info.json'),
    packageInfo,
    { spaces: 2 }
  );
  
  // Create README for the built system
  const readme = `# Hatch OS v${packageInfo.version}

Built on ${packageInfo.buildInfo.buildDate}

## Installation

1. Extract this archive to your target system
2. Run the installation script:
   \`\`\`bash
   sudo bash scripts/install-hatch-os.sh
   \`\`\`

## Default Credentials

- **Admin User:** admin / admin123 / PIN: 123456
- **Student User:** student1 / student123 / PIN: 111111
- **Teacher User:** teacher1 / teacher123 / PIN: 222222

⚠️  **IMPORTANT:** Change default credentials after installation!

## System Requirements

- RAM: ${packageInfo.systemRequirements.minRam} minimum
- Storage: ${packageInfo.systemRequirements.minStorage} minimum
- OS: ${packageInfo.systemRequirements.supportedOS.join(', ')}
- Architecture: ${packageInfo.systemRequirements.supportedArchitectures.join(', ')}

## Features

✅ Kiosk Mode - Boots directly into Hatch OS
✅ Multi-Factor Authentication (ID + Password + PIN)
✅ Cloud Sync (every 2 seconds)
✅ Distraction-Free Mode
✅ Pre-installed Educational Apps
✅ System Monitoring & Security
✅ Institution Dashboard
✅ Hardware Optimized (Raspberry Pi support)

## Support

- Documentation: https://docs.zylonlabs.com/hatch-os
- Support: support@zylonlabs.com
- GitHub: https://github.com/zylonlabs/hatch-os

---
© ${new Date().getFullYear()} Zylon Labs. All rights reserved.
`;
  
  await fs.writeFile(
    path.join(buildConfig.outputDir, 'README.md'),
    readme
  );
}

// Run the build
buildSystem();