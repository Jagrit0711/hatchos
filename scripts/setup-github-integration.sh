#!/bin/bash

# Hatch OS GitHub Integration Setup Script
# Sets up automatic updates from GitHub repository

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/Jagrit0711/hatchos.git"
INSTALL_DIR="/opt/hatch-os"
SERVICE_USER="hatch"
BACKUP_DIR="/opt/hatch-os/backups"

# Logging
LOG_FILE="/var/log/hatch-os/github-setup.log"

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        INFO)  echo -e "${BLUE}[INFO]${NC} $message" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $message" ;;
        SUCCESS) echo -e "${GREEN}[SUCCESS]${NC} $message" ;;
    esac
    
    # Also log to file
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log ERROR "This script must be run as root"
        exit 1
    fi
}

check_system() {
    log INFO "Checking system requirements..."
    
    # Check if running on supported OS
    if ! command -v systemctl &> /dev/null; then
        log ERROR "systemd is required for service management"
        exit 1
    fi
    
    # Check if git is installed
    if ! command -v git &> /dev/null; then
        log INFO "Installing git..."
        apt-get update
        apt-get install -y git
    fi
    
    # Check if node is installed
    if ! command -v node &> /dev/null; then
        log ERROR "Node.js is required but not installed"
        log INFO "Please install Node.js 18+ first"
        exit 1
    fi
    
    # Check node version
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $node_version -lt 18 ]]; then
        log ERROR "Node.js 18+ is required (found: v$node_version)"
        exit 1
    fi
    
    log SUCCESS "System requirements check passed"
}

setup_user() {
    if ! id "$SERVICE_USER" &>/dev/null; then
        log INFO "Creating service user: $SERVICE_USER"
        useradd -r -s /bin/false -d "$INSTALL_DIR" "$SERVICE_USER"
    else
        log INFO "Service user $SERVICE_USER already exists"
    fi
}

clone_repository() {
    log INFO "Setting up repository..."
    
    if [[ -d "$INSTALL_DIR" ]]; then
        if [[ -d "$INSTALL_DIR/.git" ]]; then
            log INFO "Repository already exists, updating..."
            cd "$INSTALL_DIR"
            git fetch origin
            git reset --hard origin/main
        else
            log WARN "Directory exists but is not a git repository"
            log INFO "Backing up existing directory..."
            mv "$INSTALL_DIR" "${INSTALL_DIR}.backup.$(date +%s)"
            git clone "$REPO_URL" "$INSTALL_DIR"
        fi
    else
        log INFO "Cloning repository..."
        git clone "$REPO_URL" "$INSTALL_DIR"
    fi
    
    cd "$INSTALL_DIR"
    
    # Set up proper ownership
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
    
    log SUCCESS "Repository setup complete"
}

install_dependencies() {
    log INFO "Installing Node.js dependencies..."
    
    cd "$INSTALL_DIR"
    
    # Install production dependencies as service user
    sudo -u "$SERVICE_USER" npm install --production --no-audit --no-fund
    
    log SUCCESS "Dependencies installed"
}

setup_services() {
    log INFO "Setting up systemd services..."
    
    # Copy service files
    local services=(
        "hatch-backend.service"
        "hatch-frontend.service" 
        "hatch-updater.service"
    )
    
    for service in "${services[@]}"; do
        if [[ -f "$INSTALL_DIR/scripts/$service" ]]; then
            cp "$INSTALL_DIR/scripts/$service" "/etc/systemd/system/"
            log INFO "Installed $service"
        else
            log WARN "$service not found in scripts directory"
        fi
    done
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable services
    for service in "${services[@]}"; do
        local service_name=$(basename "$service" .service)
        if systemctl enable "$service_name" &>/dev/null; then
            log INFO "Enabled $service_name"
        else
            log WARN "Failed to enable $service_name"
        fi
    done
    
    log SUCCESS "Services configured"
}

setup_directories() {
    log INFO "Setting up directories and permissions..."
    
    # Create required directories
    local dirs=(
        "$BACKUP_DIR"
        "/var/log/hatch-os"
        "/var/lib/hatch-os"
        "/etc/hatch-os"
    )
    
    for dir in "${dirs[@]}"; do
        mkdir -p "$dir"
        chown "$SERVICE_USER:$SERVICE_USER" "$dir"
        log INFO "Created directory: $dir"
    done
    
    # Set up log rotation
    cat > /etc/logrotate.d/hatch-os <<EOF
/var/log/hatch-os/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    su $SERVICE_USER $SERVICE_USER
}
EOF
    
    log SUCCESS "Directories and permissions configured"
}

configure_git_hooks() {
    log INFO "Setting up git hooks for automatic updates..."
    
    cd "$INSTALL_DIR"
    
    # Create post-merge hook for automatic service restart
    cat > .git/hooks/post-merge <<'EOF'
#!/bin/bash
# Auto-restart services after git pull

echo "$(date): Git merge detected, restarting services..." >> /var/log/hatch-os/git-hooks.log

# Install/update dependencies
npm install --production --no-audit --no-fund

# Restart services
systemctl restart hatch-backend
systemctl restart hatch-frontend

echo "$(date): Services restarted successfully" >> /var/log/hatch-os/git-hooks.log
EOF
    
    chmod +x .git/hooks/post-merge
    chown "$SERVICE_USER:$SERVICE_USER" .git/hooks/post-merge
    
    log SUCCESS "Git hooks configured"
}

configure_automatic_updates() {
    log INFO "Configuring automatic updates..."
    
    # Create update configuration
    cat > "/etc/hatch-os/update-config.json" <<EOF
{
    "enabled": true,
    "repository": "$REPO_URL",
    "branch": "main",
    "check_interval": 300000,
    "auto_restart": true,
    "backup_retention": 5,
    "notification_webhook": "",
    "maintenance_window": {
        "enabled": false,
        "start_hour": 2,
        "end_hour": 4,
        "timezone": "UTC"
    }
}
EOF
    
    chown "$SERVICE_USER:$SERVICE_USER" "/etc/hatch-os/update-config.json"
    
    # Set up cron job for periodic checks (backup to systemd service)
    cat > "/etc/cron.d/hatch-os-update" <<EOF
# Hatch OS automatic update check every 5 minutes
*/5 * * * * $SERVICE_USER cd $INSTALL_DIR && /usr/bin/node scripts/update-manager.js check >> /var/log/hatch-os/update-check.log 2>&1
EOF
    
    log SUCCESS "Automatic updates configured"
}

start_services() {
    log INFO "Starting Hatch OS services..."
    
    local services=("hatch-backend" "hatch-frontend" "hatch-updater")
    
    for service in "${services[@]}"; do
        if systemctl start "$service"; then
            log SUCCESS "Started $service"
            
            # Wait for service to start
            sleep 2
            
            if systemctl is-active --quiet "$service"; then
                log SUCCESS "$service is running"
            else
                log ERROR "$service failed to start"
                systemctl status "$service" --no-pager -l
            fi
        else
            log ERROR "Failed to start $service"
        fi
    done
}

run_health_check() {
    log INFO "Running system health check..."
    
    # Check if backend is responding
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s "http://localhost:3001/api/health" >/dev/null 2>&1; then
            log SUCCESS "Backend API is responding"
            break
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            log ERROR "Backend API health check failed after $max_attempts attempts"
            return 1
        fi
        
        log INFO "Waiting for backend API... (attempt $attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    # Check service status
    local services=("hatch-backend" "hatch-frontend" "hatch-updater")
    
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service"; then
            log SUCCESS "$service is active and running"
        else
            log WARN "$service is not running properly"
        fi
    done
    
    log SUCCESS "Health check completed"
}

setup_firewall() {
    log INFO "Configuring firewall rules..."
    
    if command -v ufw &> /dev/null; then
        # Allow SSH (if running remotely)
        ufw allow ssh
        
        # Allow Hatch OS ports
        ufw allow 3001/tcp comment "Hatch OS Backend"
        ufw allow 3000/tcp comment "Hatch OS Frontend"
        
        # Enable firewall if not already enabled
        if ! ufw status | grep -q "Status: active"; then
            echo "y" | ufw enable
        fi
        
        log SUCCESS "Firewall configured"
    else
        log WARN "ufw not found, skipping firewall configuration"
    fi
}

create_update_script() {
    log INFO "Creating update script..."
    
    cat > "/usr/local/bin/hatch-update" <<EOF
#!/bin/bash
# Hatch OS Manual Update Script

set -e

INSTALL_DIR="$INSTALL_DIR"
SERVICE_USER="$SERVICE_USER"

echo "🔄 Starting Hatch OS update..."

# Change to install directory
cd "\$INSTALL_DIR"

# Create backup
echo "📦 Creating backup..."
sudo -u "\$SERVICE_USER" node scripts/update-manager.js backup

# Stop services
echo "⏸️  Stopping services..."
systemctl stop hatch-backend hatch-frontend

# Update code
echo "⬇️  Pulling latest changes..."
sudo -u "\$SERVICE_USER" git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
sudo -u "\$SERVICE_USER" npm install --production --no-audit --no-fund

# Restart services  
echo "▶️  Starting services..."
systemctl start hatch-backend hatch-frontend

# Wait and check
sleep 5
if systemctl is-active --quiet hatch-backend && systemctl is-active --quiet hatch-frontend; then
    echo "✅ Update completed successfully!"
else
    echo "❌ Update failed - services not running properly"
    exit 1
fi
EOF
    
    chmod +x "/usr/local/bin/hatch-update"
    
    log SUCCESS "Update script created at /usr/local/bin/hatch-update"
}

print_summary() {
    echo
    log SUCCESS "🎉 Hatch OS GitHub integration setup completed!"
    echo
    echo -e "${BLUE}📋 Setup Summary:${NC}"
    echo "  • Repository: $REPO_URL"
    echo "  • Install Directory: $INSTALL_DIR"
    echo "  • Service User: $SERVICE_USER"
    echo "  • Auto-updates: Enabled (every 5 minutes)"
    echo
    echo -e "${BLUE}🔧 Management Commands:${NC}"
    echo "  • Manual update: hatch-update"
    echo "  • Check status: systemctl status hatch-backend"
    echo "  • View logs: journalctl -u hatch-backend -f"
    echo "  • Update check: cd $INSTALL_DIR && node scripts/update-manager.js check"
    echo
    echo -e "${BLUE}🌐 Access:${NC}"
    echo "  • Backend API: http://localhost:3001"
    echo "  • Frontend: http://localhost:3000"
    echo "  • Health Check: http://localhost:3001/api/health"
    echo
    echo -e "${BLUE}📁 Important Files:${NC}"
    echo "  • Logs: /var/log/hatch-os/"
    echo "  • Config: /etc/hatch-os/"
    echo "  • Backups: $BACKUP_DIR"
    echo
    echo -e "${YELLOW}⚠️  Next Steps:${NC}"
    echo "  1. Configure notification webhooks in /etc/hatch-os/notifications.json"
    echo "  2. Set up SSL/TLS certificates if needed"
    echo "  3. Configure backup retention policies"
    echo "  4. Test the system with: curl http://localhost:3001/api/health"
    echo
    log SUCCESS "GitHub integration is now active! 🚀"
}

main() {
    log INFO "Starting Hatch OS GitHub integration setup..."
    
    check_root
    check_system
    setup_user
    clone_repository
    install_dependencies
    setup_directories
    setup_services
    configure_git_hooks
    configure_automatic_updates
    start_services
    setup_firewall
    create_update_script
    
    sleep 5  # Give services time to fully start
    run_health_check
    
    print_summary
}

# Run main function
main "$@"