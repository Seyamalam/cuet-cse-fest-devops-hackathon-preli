#!/bin/bash
# =============================================================================
# AWS VM Initial Setup Script
# =============================================================================
# Run this script on a fresh AWS VM to prepare it for deployment
# Supports: Ubuntu 20.04/22.04, Amazon Linux 2/2023
# =============================================================================
# Usage: curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/scripts/setup-aws.sh | sudo bash
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# Detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    else
        error "Unable to detect operating system"
    fi
    info "Detected OS: $OS $VERSION"
}

# Update system packages
update_system() {
    info "Updating system packages..."
    
    case $OS in
        ubuntu|debian)
            apt-get update -y
            apt-get upgrade -y
            ;;
        amzn|amazon)
            yum update -y
            ;;
        *)
            error "Unsupported operating system: $OS"
            ;;
    esac
    
    info "System updated ✓"
}

# Install Docker
install_docker() {
    if command -v docker &> /dev/null; then
        info "Docker is already installed"
        return
    fi

    info "Installing Docker..."
    
    case $OS in
        ubuntu|debian)
            # Install prerequisites
            apt-get install -y \
                ca-certificates \
                curl \
                gnupg \
                lsb-release

            # Add Docker's official GPG key
            install -m 0755 -d /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/$OS/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            chmod a+r /etc/apt/keyrings/docker.gpg

            # Set up the repository
            echo \
                "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS \
                $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
                tee /etc/apt/sources.list.d/docker.list > /dev/null

            # Install Docker Engine
            apt-get update
            apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        amzn|amazon)
            # Install Docker from Amazon extras
            amazon-linux-extras install docker -y || yum install docker -y
            systemctl start docker
            systemctl enable docker
            
            # Install Docker Compose
            curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
            chmod +x /usr/local/bin/docker-compose
            ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
            ;;
    esac

    # Start Docker service
    systemctl start docker
    systemctl enable docker

    # Add current user to docker group
    if [ -n "${SUDO_USER:-}" ]; then
        usermod -aG docker "$SUDO_USER"
        info "Added $SUDO_USER to docker group"
    fi

    info "Docker installed ✓"
}

# Install additional tools
install_tools() {
    info "Installing additional tools..."
    
    case $OS in
        ubuntu|debian)
            apt-get install -y \
                git \
                curl \
                wget \
                vim \
                htop \
                make \
                jq \
                unzip \
                net-tools \
                fail2ban \
                ufw
            ;;
        amzn|amazon)
            yum install -y \
                git \
                curl \
                wget \
                vim \
                htop \
                make \
                jq \
                unzip \
                net-tools
            ;;
    esac
    
    info "Tools installed ✓"
}

# Configure firewall
configure_firewall() {
    info "Configuring firewall..."
    
    case $OS in
        ubuntu|debian)
            # Enable UFW
            ufw --force reset
            ufw default deny incoming
            ufw default allow outgoing
            
            # Allow SSH
            ufw allow 22/tcp
            
            # Allow application ports
            ufw allow 5921/tcp  # Gateway
            ufw allow 3000/tcp  # Grafana
            ufw allow 9090/tcp  # Prometheus
            ufw allow 5601/tcp  # Kibana
            ufw allow 9001/tcp  # MinIO Console
            
            # Enable firewall
            ufw --force enable
            ;;
        amzn|amazon)
            # Use AWS Security Groups instead
            info "Please configure AWS Security Groups for port access"
            ;;
    esac
    
    info "Firewall configured ✓"
}

# Configure system limits
configure_limits() {
    info "Configuring system limits..."

    # Increase virtual memory for Elasticsearch
    sysctl -w vm.max_map_count=262144
    echo "vm.max_map_count=262144" >> /etc/sysctl.conf

    # Increase file descriptors
    cat >> /etc/security/limits.conf << EOF
* soft nofile 65536
* hard nofile 65536
* soft nproc 65536
* hard nproc 65536
EOF

    # Apply sysctl changes
    sysctl -p

    info "System limits configured ✓"
}

# Setup fail2ban for SSH protection
setup_fail2ban() {
    info "Setting up fail2ban..."
    
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        systemctl enable fail2ban
        systemctl start fail2ban
        
        cat > /etc/fail2ban/jail.local << EOF
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
findtime = 600
EOF
        
        systemctl restart fail2ban
    fi
    
    info "Fail2ban configured ✓"
}

# Create application user
create_app_user() {
    local username="ecommerce"
    
    if id "$username" &>/dev/null; then
        info "User $username already exists"
        return
    fi

    info "Creating application user: $username"
    useradd -m -s /bin/bash "$username"
    usermod -aG docker "$username"
    
    info "User $username created ✓"
}

# Create deployment directory
setup_deployment_dir() {
    info "Setting up deployment directory..."
    
    mkdir -p /opt/ecommerce
    mkdir -p /var/lib/ecommerce/{mongo,prometheus,grafana,elasticsearch,minio,alertmanager}
    mkdir -p /var/log/ecommerce
    
    # Set permissions
    chown -R 1000:1000 /opt/ecommerce
    chown -R 1000:1000 /var/lib/ecommerce/grafana
    chown -R 1000:1000 /var/lib/ecommerce/prometheus
    
    info "Deployment directory ready ✓"
}

# Print summary
print_summary() {
    echo ""
    echo "============================================================================="
    echo "AWS VM Setup Complete!"
    echo "============================================================================="
    echo ""
    echo "Next steps:"
    echo "1. Clone your repository:"
    echo "   git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git /opt/ecommerce"
    echo ""
    echo "2. Create .env file from template:"
    echo "   cd /opt/ecommerce"
    echo "   cp .env.example .env"
    echo "   vim .env  # Edit with your credentials"
    echo ""
    echo "3. Run the deployment script:"
    echo "   cd /opt/ecommerce"
    echo "   ./scripts/deploy.sh production"
    echo ""
    echo "4. If you added a user to docker group, log out and back in"
    echo ""
    echo "Firewall ports opened:"
    echo "  - 22    (SSH)"
    echo "  - 5921  (Gateway API)"
    echo "  - 3000  (Grafana)"
    echo "  - 9090  (Prometheus)"
    echo "  - 5601  (Kibana)"
    echo "  - 9001  (MinIO Console)"
    echo ""
    echo "============================================================================="
}

# Main function
main() {
    info "Starting AWS VM setup..."
    
    detect_os
    update_system
    install_docker
    install_tools
    configure_firewall
    configure_limits
    setup_fail2ban
    create_app_user
    setup_deployment_dir
    print_summary
    
    info "Setup completed successfully!"
}

# Run main
main "$@"
