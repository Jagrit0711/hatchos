#!/bin/bash

# Hatch OS Installation Script
# This script converts a Debian-based system into Hatch OS

set -e

echo "🚀 Starting Hatch OS Installation..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use sudo)"
    exit 1
fi

# Configuration
HATCH_USER="hatch"
HATCH_HOME="/opt/hatch-os"
HATCH_DATA="/var/lib/hatch-os"
HATCH_LOGS="/var/log/hatch-os"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Step 1: System Requirements Check
log "Checking system requirements..."

# Check OS
if ! grep -q "Debian\|Ubuntu" /etc/os-release; then
    error "This installation requires Debian or Ubuntu Linux"
fi

# Check architecture
ARCH=$(uname -m)
if [ "$ARCH" != "x86_64" ] && [ "$ARCH" != "aarch64" ] && [ "$ARCH" != "armv7l" ]; then
    error "Unsupported architecture: $ARCH"
fi

# Check minimum RAM (1GB as per PRD)
TOTAL_RAM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
if [ "$TOTAL_RAM" -lt 1000 ]; then
    warn "System has less than 1GB RAM. Performance may be affected."
fi

log "System requirements check passed"

# Step 2: Update system packages
log "Updating system packages..."
apt update && apt upgrade -y

# Step 3: Install base packages
log "Installing base packages..."
apt install -y \
    curl \
    wget \
    git \
    nodejs \
    npm \
    python3 \
    python3-pip \
    sqlite3 \
    xinit \
    xserver-xorg \
    lightdm \
    openbox \
    chromium-browser \
    nautilus \
    gnome-terminal \
    gnome-calculator \
    systemd \
    ufw \
    fail2ban \
    unattended-upgrades \
    network-manager

# Step 4: Install Node.js dependencies
log "Setting up Node.js environment..."
npm install -g pm2 electron

# Step 5: Create Hatch OS user and directories
log "Creating Hatch OS user and directories..."

# Create user
if ! id "$HATCH_USER" &>/dev/null; then
    useradd -r -m -s /bin/bash "$HATCH_USER"
    log "Created user: $HATCH_USER"
fi

# Create directories
mkdir -p "$HATCH_HOME" "$HATCH_DATA" "$HATCH_LOGS"
chown -R "$HATCH_USER:$HATCH_USER" "$HATCH_HOME" "$HATCH_DATA" "$HATCH_LOGS"
chmod 755 "$HATCH_HOME" "$HATCH_DATA" "$HATCH_LOGS"

# Step 6: Copy Hatch OS files
log "Installing Hatch OS files..."
cp -r ./* "$HATCH_HOME/"
chown -R "$HATCH_USER:$HATCH_USER" "$HATCH_HOME"

# Step 7: Install Node.js dependencies for Hatch OS
log "Installing Hatch OS dependencies..."
cd "$HATCH_HOME"
sudo -u "$HATCH_USER" npm install
sudo -u "$HATCH_USER" npm run build

# Step 8: Configure system for kiosk mode
log "Configuring kiosk mode..."

# Create X11 autostart script
cat > /home/hatch/.xinitrc << EOF
#!/bin/bash
# Hatch OS X11 startup script

# Disable screen saver and power management
xset s off
xset -dpms
xset s noblank

# Start window manager
openbox &

# Wait for window manager to start
sleep 2

# Start Hatch OS
cd $HATCH_HOME
npm start

# Keep X running
wait
EOF

chmod +x /home/hatch/.xinitrc
chown hatch:hatch /home/hatch/.xinitrc

# Configure LightDM for auto-login
cat > /etc/lightdm/lightdm.conf.d/hatch-autologin.conf << EOF
[Seat:*]
autologin-user=hatch
autologin-user-timeout=0
autologin-session=openbox
EOF

# Step 9: Create systemd services
log "Creating systemd services..."

# Hatch OS Backend Service
cat > /etc/systemd/system/hatch-backend.service << EOF
[Unit]
Description=Hatch OS Backend Server
After=network.target
Wants=network.target

[Service]
Type=simple
User=hatch
Group=hatch
WorkingDirectory=$HATCH_HOME
Environment=NODE_ENV=production
Environment=PORT=3001
ExecStart=/usr/bin/node src/backend/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=hatch-backend

[Install]
WantedBy=multi-user.target
EOF

# Hatch OS Frontend Service (for non-X environments)
cat > /etc/systemd/system/hatch-frontend.service << EOF
[Unit]
Description=Hatch OS Frontend
After=network.target hatch-backend.service
Wants=network.target
Requires=hatch-backend.service

[Service]
Type=simple
User=hatch
Group=hatch
WorkingDirectory=$HATCH_HOME
Environment=NODE_ENV=production
Environment=DISPLAY=:0
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=hatch-frontend

[Install]
WantedBy=multi-user.target
EOF

# Enable services
systemctl daemon-reload
systemctl enable hatch-backend
systemctl enable hatch-frontend

# Step 10: Configure firewall
log "Configuring firewall..."
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow 22   # SSH
ufw allow 3000 # Hatch OS Frontend
ufw allow 3001 # Hatch OS Backend

# Step 11: Configure security
log "Configuring security..."

# Configure fail2ban
cat > /etc/fail2ban/jail.d/hatch.conf << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true

[hatch-auth]
enabled = true
port = 3001
filter = hatch-auth
logpath = $HATCH_LOGS/auth.log
maxretry = 5
bantime = 7200
EOF

# Create fail2ban filter for Hatch OS
cat > /etc/fail2ban/filter.d/hatch-auth.conf << EOF
[Definition]
failregex = Authentication failed.*<HOST>.*
ignoreregex =
EOF

# Step 12: Configure automatic updates
log "Configuring automatic updates..."
cat > /etc/apt/apt.conf.d/50unattended-upgrades << EOF
Unattended-Upgrade::Allowed-Origins {
    "\${distro_id}:\${distro_codename}-security";
    "\${distro_id}ESMApps:\${distro_codename}-apps-security";
    "\${distro_id}ESM:\${distro_codename}-infra-security";
};

Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

# Step 13: Create boot optimization
log "Optimizing boot process..."

# Disable unnecessary services for faster boot
systemctl disable bluetooth.service
systemctl disable cups.service
systemctl disable avahi-daemon.service

# Create custom boot target
cat > /etc/systemd/system/hatch.target << EOF
[Unit]
Description=Hatch OS Target
Requires=multi-user.target
After=multi-user.target
AllowIsolate=yes

[Install]
Alias=default.target
EOF

# Step 14: Configure Raspberry Pi specific settings (if applicable)
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "armv7l" ]; then
    log "Applying Raspberry Pi optimizations..."
    
    # GPU memory split
    echo "gpu_mem=128" >> /boot/config.txt
    
    # Disable swap for SD card longevity
    systemctl disable dphys-swapfile
    
    # Enable SSH by default for Raspberry Pi
    systemctl enable ssh
fi

# Step 15: Create startup script
log "Creating startup script..."
cat > /usr/local/bin/start-hatch-os << EOF
#!/bin/bash
# Hatch OS Startup Script

# Set environment variables
export HATCH_HOME="$HATCH_HOME"
export HATCH_DATA="$HATCH_DATA"
export HATCH_LOGS="$HATCH_LOGS"

# Create log directory if it doesn't exist
mkdir -p "$HATCH_LOGS"

# Start services
systemctl start hatch-backend
systemctl start hatch-frontend

# Wait for services to start
sleep 5

# Check if services are running
if systemctl is-active --quiet hatch-backend && systemctl is-active --quiet hatch-frontend; then
    echo "✅ Hatch OS started successfully"
    echo "🌐 Frontend: http://localhost:3000"
    echo "🔧 Backend: http://localhost:3001"
else
    echo "❌ Failed to start Hatch OS services"
    echo "Check logs: journalctl -u hatch-backend -u hatch-frontend"
fi
EOF

chmod +x /usr/local/bin/start-hatch-os

# Step 16: Final configuration
log "Completing installation..."

# Set default target to Hatch OS
systemctl set-default hatch.target

# Create desktop shortcut for emergency access
mkdir -p /home/hatch/Desktop
cat > /home/hatch/Desktop/emergency-terminal.desktop << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Emergency Terminal
Comment=Emergency access terminal
Exec=gnome-terminal
Icon=terminal
Terminal=false
Categories=System;
EOF

chmod +x /home/hatch/Desktop/emergency-terminal.desktop
chown hatch:hatch /home/hatch/Desktop/emergency-terminal.desktop

# Step 17: Installation summary
log "Installation completed successfully!"
echo ""
echo "📋 Installation Summary:"
echo "------------------------"
echo "🏠 Hatch OS Home: $HATCH_HOME"
echo "💾 Data Directory: $HATCH_DATA"
echo "📝 Logs Directory: $HATCH_LOGS"
echo "👤 Hatch User: $HATCH_USER"
echo ""
echo "🔧 Next Steps:"
echo "1. Reboot the system: sudo reboot"
echo "2. System will boot into Hatch OS automatically"
echo "3. Login with default admin credentials:"
echo "   Username: admin"
echo "   Password: admin123"
echo "   PIN: 123456"
echo ""
echo "⚠️  IMPORTANT: Change default credentials after first login!"
echo ""
echo "📚 Documentation: https://docs.zylonlabs.com/hatch-os"
echo "🆘 Support: support@zylonlabs.com"

# Prompt for reboot
echo ""
read -p "Reboot now to start Hatch OS? (y/n): " -r
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log "Rebooting system..."
    reboot
else
    log "Installation complete. Please reboot manually to start Hatch OS."
fi