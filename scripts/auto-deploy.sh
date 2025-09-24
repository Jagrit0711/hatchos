#!/bin/bash

# Hatch OS Auto-Deploy Script
# Automatically deploy updates from GitHub repository

set -e

echo "🚀 Hatch OS Auto-Deploy Script v1.0.0"
echo "======================================"

# Configuration
GITHUB_REPO="https://github.com/Jagrit0711/hatchos.git"
DEPLOY_DIR="/opt/hatch-os"
BACKUP_DIR="/opt/hatch-os-backup-$(date +%Y%m%d-%H%M%S)"
SERVICE_NAME="hatch-backend"
BRANCH="main"

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

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "Please run as root (use sudo)"
fi

# Check if git is installed
if ! command -v git &> /dev/null; then
    log "Installing Git..."
    apt update && apt install -y git
fi

# Check if current directory is a git repository
if [ ! -d ".git" ]; then
    error "This script must be run from the Hatch OS git repository"
fi

# Function to check if service is running
is_service_running() {
    systemctl is-active --quiet "$1"
}

# Function to backup current installation
backup_current() {
    log "Creating backup of current installation..."
    if [ -d "$DEPLOY_DIR" ]; then
        cp -r "$DEPLOY_DIR" "$BACKUP_DIR"
        log "Backup created at: $BACKUP_DIR"
    fi
}

# Function to restore backup
restore_backup() {
    warn "Restoring from backup..."
    if [ -d "$BACKUP_DIR" ]; then
        rm -rf "$DEPLOY_DIR"
        mv "$BACKUP_DIR" "$DEPLOY_DIR"
        log "Backup restored successfully"
    else
        error "Backup directory not found"
    fi
}

# Function to check for updates
check_updates() {
    log "Checking for updates from GitHub..."
    
    # Fetch latest changes
    git fetch origin $BRANCH
    
    # Check if there are updates
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/$BRANCH)
    
    if [ "$LOCAL" = "$REMOTE" ]; then
        info "No updates available"
        return 1
    else
        info "Updates available: $LOCAL -> $REMOTE"
        return 0
    fi
}

# Function to apply updates
apply_updates() {
    log "Applying updates..."
    
    # Stop services
    if is_service_running $SERVICE_NAME; then
        log "Stopping Hatch OS services..."
        systemctl stop hatch-backend hatch-frontend || warn "Some services may not be running"
    fi
    
    # Pull latest changes
    git pull origin $BRANCH
    
    # Install/update dependencies
    log "Updating dependencies..."
    npm install --production
    
    # Run any migration scripts
    if [ -f "scripts/migrate.sh" ]; then
        log "Running migration scripts..."
        bash scripts/migrate.sh
    fi
    
    # Rebuild if necessary
    if [ -f "package.json" ] && grep -q "\"build\":" package.json; then
        log "Building application..."
        npm run build
    fi
    
    # Update system files
    if [ -f "scripts/update-system.sh" ]; then
        log "Updating system configuration..."
        bash scripts/update-system.sh
    fi
    
    # Restart services
    log "Starting Hatch OS services..."
    systemctl daemon-reload
    systemctl start hatch-backend hatch-frontend
    
    # Verify services are running
    sleep 5
    if is_service_running $SERVICE_NAME; then
        log "✅ Hatch OS services started successfully"
    else
        error "❌ Failed to start Hatch OS services"
    fi
}

# Function to verify deployment
verify_deployment() {
    log "Verifying deployment..."
    
    # Check if services are running
    if ! is_service_running $SERVICE_NAME; then
        error "Hatch OS backend service is not running"
    fi
    
    # Check if frontend is accessible
    if command -v curl &> /dev/null; then
        if curl -f -s "http://localhost:3001/api/health" > /dev/null; then
            log "✅ Backend API is responding"
        else
            error "❌ Backend API is not responding"
        fi
        
        if curl -f -s "http://localhost:3000" > /dev/null; then
            log "✅ Frontend is accessible"
        else
            warn "⚠️ Frontend may not be accessible"
        fi
    fi
    
    # Check system resources
    MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    CPU_USAGE=$(top -bn1 | grep load | awk '{printf "%.1f", $(NF-2)}')
    
    info "System status after deployment:"
    info "- Memory usage: ${MEMORY_USAGE}%"
    info "- CPU load: ${CPU_USAGE}"
    
    log "✅ Deployment verification completed"
}

# Function to rollback deployment
rollback_deployment() {
    error_msg="$1"
    warn "Deployment failed: $error_msg"
    warn "Initiating rollback procedure..."
    
    restore_backup
    
    # Restart services
    systemctl daemon-reload
    systemctl start hatch-backend hatch-frontend
    
    if is_service_running $SERVICE_NAME; then
        log "✅ Rollback completed successfully"
    else
        error "❌ Rollback failed - manual intervention required"
    fi
    
    exit 1
}

# Main deployment process
main() {
    log "Starting Hatch OS auto-deployment process..."
    
    # Trap errors and rollback
    trap 'rollback_deployment "Unexpected error occurred"' ERR
    
    # Check for updates
    if ! check_updates; then
        log "No updates to deploy"
        exit 0
    fi
    
    # Create backup
    backup_current
    
    # Apply updates
    apply_updates
    
    # Verify deployment
    verify_deployment
    
    # Cleanup old backups (keep last 5)
    log "Cleaning up old backups..."
    find /opt -name "hatch-os-backup-*" -type d -mtime +30 -exec rm -rf {} + 2>/dev/null || true
    
    # Send notification (if configured)
    if [ -n "$NOTIFICATION_WEBHOOK" ]; then
        curl -X POST "$NOTIFICATION_WEBHOOK" \
             -H "Content-Type: application/json" \
             -d "{\"text\":\"🚀 Hatch OS successfully updated to $(git rev-parse --short HEAD)\"}" \
             2>/dev/null || warn "Failed to send notification"
    fi
    
    log "🎉 Deployment completed successfully!"
    log "Current version: $(git rev-parse --short HEAD)"
    log "Deployment time: $(date)"
    
    # Optional: Schedule next check
    if [ "$AUTO_SCHEDULE" = "true" ]; then
        log "Scheduling next auto-update check..."
        (crontab -l 2>/dev/null; echo "0 2 * * * cd $PWD && sudo bash $0") | crontab -
    fi
}

# Command line options
while getopts "hfb:s" opt; do
    case $opt in
        h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -h          Show this help message"
            echo "  -f          Force update even if no changes detected"
            echo "  -b BRANCH   Deploy from specific branch (default: main)"
            echo "  -s          Schedule automatic updates"
            echo ""
            echo "Environment Variables:"
            echo "  NOTIFICATION_WEBHOOK  Webhook URL for deployment notifications"
            echo "  AUTO_SCHEDULE         Set to 'true' to auto-schedule updates"
            exit 0
            ;;
        f)
            FORCE_UPDATE=true
            ;;
        b)
            BRANCH="$OPTARG"
            ;;
        s)
            AUTO_SCHEDULE=true
            ;;
        \?)
            error "Invalid option -$OPTARG"
            ;;
    esac
done

# Run main function
main "$@"