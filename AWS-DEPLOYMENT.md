# AWS VM Deployment Guide

Complete guide for deploying the critical infrastructure stack on AWS EC2 with production-grade configurations.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [AWS Setup](#aws-setup)
3. [EC2 Instance Configuration](#ec2-instance-configuration)
4. [Infrastructure Installation](#infrastructure-installation)
5. [Application Deployment](#application-deployment)
6. [SSL/HTTPS Configuration](#ssltls-configuration)
7. [Monitoring & Logging](#monitoring--logging)
8. [Backup & Disaster Recovery](#backup--disaster-recovery)
9. [Scaling & High Availability](#scaling--high-availability)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### AWS Account Requirements

- AWS Account with appropriate permissions
- VPC (use default or create new)
- Key pair for SSH access
- Domain name (optional, but recommended)

### Local Tools

```bash
# macOS
brew install awscli jq terraform

# Linux
sudo apt-get install awscli jq python3-dev python3-pip

# Windows
# Use AWS CLI installer from: https://aws.amazon.com/cli/

# Configure AWS credentials
aws configure
```

---

## AWS Setup

### Step 1: Create VPC & Security Groups

```bash
# Create VPC (or use default)
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --region us-east-1

# Create Security Group
aws ec2 create-security-group \
  --group-name ecommerce-sg \
  --description "Security group for ecommerce infrastructure" \
  --vpc-id vpc-xxxxx \
  --region us-east-1

SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=ecommerce-sg" \
  --query 'SecurityGroups[0].GroupId' \
  --region us-east-1 \
  --output text)

echo "Security Group ID: $SG_ID"
```

### Step 2: Configure Security Group Rules

```bash
# Allow SSH (port 22)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 22 \
  --cidr YOUR_IP/32 \
  --region us-east-1

# Allow HTTP (port 80)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0 \
  --region us-east-1

# Allow HTTPS (port 443)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0 \
  --region us-east-1

# Allow Gateway (port 5921)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 5921 \
  --cidr 0.0.0.0/0 \
  --region us-east-1

# Allow Grafana (port 3000) - optional, restrict to office IPs
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 3000 \
  --cidr OFFICE_IP/32 \
  --region us-east-1

# Allow all outbound
aws ec2 authorize-security-group-egress \
  --group-id $SG_ID \
  --protocol -1 \
  --cidr 0.0.0.0/0 \
  --region us-east-1
```

### Step 3: Create Key Pair

```bash
# Create key pair
aws ec2 create-key-pair \
  --key-name ecommerce-key \
  --region us-east-1 \
  --output text > ecommerce-key.pem

# Set proper permissions
chmod 400 ecommerce-key.pem

# Store securely
# Never commit this file to git!
echo "ecommerce-key.pem" >> .gitignore
```

### Step 4: Create IAM Role (Optional, for AWS integration)

```bash
# Create IAM role for EC2 CloudWatch/S3 access
aws iam create-role \
  --role-name ecommerce-ec2-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ec2.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach policies
aws iam attach-role-policy \
  --role-name ecommerce-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy

aws iam attach-role-policy \
  --role-name ecommerce-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

# Create instance profile
aws iam create-instance-profile \
  --instance-profile-name ecommerce-ec2-profile

aws iam add-role-to-instance-profile \
  --instance-profile-name ecommerce-ec2-profile \
  --role-name ecommerce-ec2-role
```

---

## EC2 Instance Configuration

### Step 1: Launch EC2 Instance

```bash
# Find latest Ubuntu 22.04 LTS AMI
AMI_ID=$(aws ec2 describe-images \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
  "Name=state,Values=available" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
  --output text \
  --region us-east-1)

echo "Using AMI: $AMI_ID"

# Launch instance (t3.xlarge recommended for full stack)
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t3.xlarge \
  --key-name ecommerce-key \
  --security-group-ids $SG_ID \
  --iam-instance-profile Name=ecommerce-ec2-profile \
  --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=100,VolumeType=gp3,DeleteOnTermination=true}" \
  --monitoring Enabled=true \
  --region us-east-1 \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "Instance ID: $INSTANCE_ID"

# Wait for instance to be running
aws ec2 wait instance-running \
  --instance-ids $INSTANCE_ID \
  --region us-east-1

# Get public IP
PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text \
  --region us-east-1)

echo "Public IP: $PUBLIC_IP"
```

### Step 2: Instance Type Recommendations

| Workload | Instance Type | vCPU | Memory | Storage | Cost/month |
|----------|---------------|------|--------|---------|-----------|
| Small (dev) | t3.medium | 2 | 4GB | 20GB | ~$30 |
| Medium | t3.large | 2 | 8GB | 50GB | ~$60 |
| Large | t3.xlarge | 4 | 16GB | 100GB | ~$130 |
| Production | c6i.2xlarge | 8 | 16GB | 200GB | ~$270 |

### Step 3: Allocate Elastic IP (Optional)

```bash
# Allocate Elastic IP for static IP address
ALLOCATION_ID=$(aws ec2 allocate-address \
  --domain vpc \
  --region us-east-1 \
  --query 'AllocationId' \
  --output text)

# Associate with instance
aws ec2 associate-address \
  --instance-id $INSTANCE_ID \
  --allocation-id $ALLOCATION_ID \
  --region us-east-1
```

### Step 4: Configure Route53 (Optional)

```bash
# If using Route53 for DNS
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456789ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "api.example.com",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "'$PUBLIC_IP'"}]
      }
    }]
  }'
```

---

## Infrastructure Installation

### Step 1: Connect to Instance

```bash
# Connect via SSH
ssh -i ecommerce-key.pem ubuntu@$PUBLIC_IP

# Or use Session Manager (if IAM role configured)
aws ssm start-session \
  --target $INSTANCE_ID \
  --region us-east-1
```

### Step 2: System Updates

```bash
# Update package lists
sudo apt-get update
sudo apt-get upgrade -y

# Install essential tools
sudo apt-get install -y \
  git \
  curl \
  wget \
  build-essential \
  python3-dev \
  python3-pip \
  jq \
  htop \
  docker.io \
  docker-compose \
  nginx \
  certbot \
  python3-certbot-nginx

# Add ubuntu to docker group
sudo usermod -aG docker ubuntu

# Enable docker service
sudo systemctl enable docker
sudo systemctl start docker

# Logout and reconnect for docker group to take effect
exit
ssh -i ecommerce-key.pem ubuntu@$PUBLIC_IP
```

### Step 3: Verify Installation

```bash
# Check Docker
docker --version
docker run hello-world

# Check Docker Compose
docker-compose --version

# Check disk space
df -h

# Check memory
free -h

# Check CPU
nproc
lscpu
```

### Step 4: Setup Application Directory

```bash
# Create app directory
sudo mkdir -p /var/app
sudo chown ubuntu:ubuntu /var/app
cd /var/app

# Clone repository
git clone https://github.com/your-org/ecommerce.git .

# Or for private repo with SSH key:
# ssh-keygen -t ed25519 -C "your-email@example.com"
# Add public key to GitHub
# git clone git@github.com:your-org/ecommerce.git .

# Create environment file
cp .env.example .env

# Edit with production values
nano .env
```

---

## Application Deployment

### Step 1: Configure Environment Variables

```bash
# Update .env with production values
cat > /var/app/.env <<'EOF'
# Core Services
NODE_ENV=production
BACKEND_PORT=3847
GATEWAY_PORT=5921

# MongoDB
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=$(openssl rand -base64 32)
MONGO_APP_USERNAME=app_user
MONGO_APP_PASSWORD=$(openssl rand -base64 32)
MONGO_DATABASE=ecommerce

# Grafana
GRAFANA_PORT=3000
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 32)

# Sentry
SENTRY_PORT=9000
SENTRY_SECRET_KEY=$(openssl rand -base64 32)
SENTRY_DB_USER=sentry
SENTRY_DB_PASSWORD=$(openssl rand -base64 32)

# MinIO
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=$(openssl rand -base64 32)
MINIO_BUCKET=ecommerce

# Logging
LOG_LEVEL=info
ELASTICSEARCH_JAVA_OPTS=-Xms1g -Xmx1g
EOF

# Secure file permissions
chmod 600 /var/app/.env
```

### Step 2: Create Docker Network & Volumes

```bash
# Create networks
docker network create ecommerce-frontend-prod || true
docker network create ecommerce-backend-prod || true

# Create volumes
docker volume create ecommerce-mongo-data-prod || true
docker volume create ecommerce-elasticsearch-data-prod || true
docker volume create ecommerce-prometheus-data-prod || true
docker volume create ecommerce-grafana-storage-prod || true
docker volume create ecommerce-sentry-postgres-data-prod || true
docker volume create ecommerce-sentry-redis-data-prod || true
docker volume create ecommerce-sentry-files-prod || true
docker volume create ecommerce-minio-data-prod || true
```

### Step 3: Start Infrastructure Stack

```bash
cd /var/app

# Build production images
docker compose -f docker/compose.production.yaml build

# Start services
docker compose -f docker/compose.production.yaml up -d

# Verify services are running
docker compose -f docker/compose.production.yaml ps

# Check logs
docker compose -f docker/compose.production.yaml logs -f

# Wait for all services to be healthy (5-10 minutes)
watch -n 2 'docker compose -f docker/compose.production.yaml ps'
```

### Step 4: Verify Services

```bash
# Check API
curl http://localhost:5921/health
curl http://localhost:5921/api/health

# Check Prometheus
curl http://localhost:9090/-/healthy

# Check Grafana
curl http://localhost:3000/api/health

# Check Elasticsearch
curl http://localhost:9200/_cluster/health

# Check Kibana
curl http://localhost:5601/api/status

# Check Sentry
curl http://localhost:9000/_health/

# Check MinIO
curl http://localhost:9000/minio/health/live
```

---

## SSL/HTTPS Configuration

### Option A: Using Let's Encrypt with Nginx

```bash
# 1. Configure Nginx reverse proxy
sudo tee /etc/nginx/sites-available/ecommerce > /dev/null <<'EOF'
upstream api {
    server localhost:5921;
}

upstream grafana {
    server localhost:3000;
}

upstream kibana {
    server localhost:5601;
}

upstream sentry {
    server localhost:9000;
}

upstream minio {
    server localhost:9001;
}

server {
    listen 80;
    listen [::]:80;
    server_name api.example.com *.example.com;

    # Redirect HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    client_max_body_size 100M;

    location / {
        proxy_pass http://api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name grafana.example.com;

    ssl_certificate /etc/letsencrypt/live/grafana.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/grafana.example.com/privkey.pem;

    location / {
        proxy_pass http://grafana;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name logs.example.com;

    ssl_certificate /etc/letsencrypt/live/logs.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/logs.example.com/privkey.pem;

    location / {
        proxy_pass http://kibana;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# 2. Enable site
sudo ln -s /etc/nginx/sites-available/ecommerce /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 3. Test Nginx config
sudo nginx -t

# 4. Get SSL certificate
sudo certbot certonly \
  --nginx \
  -d api.example.com \
  -d grafana.example.com \
  -d logs.example.com \
  -d sentry.example.com \
  -d storage.example.com \
  --non-interactive \
  --agree-tos \
  -m your-email@example.com

# 5. Enable Nginx
sudo systemctl enable nginx
sudo systemctl restart nginx

# 6. Setup auto-renewal
sudo certbot renew --dry-run
```

### Option B: Using AWS Certificate Manager + Load Balancer

```bash
# Create Application Load Balancer
ALB=$(aws elbv2 create-load-balancer \
  --name ecommerce-alb \
  --subnets subnet-xxxxx \
  --security-groups $SG_ID \
  --scheme internet-facing \
  --type application \
  --region us-east-1 \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)

# Create target group
TG=$(aws elbv2 create-target-group \
  --name ecommerce-targets \
  --protocol HTTP \
  --port 5921 \
  --vpc-id vpc-xxxxx \
  --region us-east-1 \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)

# Register instance
aws elbv2 register-targets \
  --target-group-arn $TG \
  --targets Id=$INSTANCE_ID \
  --region us-east-1

# Create listener (HTTPS)
aws elbv2 create-listener \
  --load-balancer-arn $ALB \
  --protocol HTTPS \
  --port 443 \
  --certificate-arn arn:aws:acm:us-east-1:123456789:certificate/xxxxx \
  --default-actions Type=forward,TargetGroupArn=$TG \
  --region us-east-1

# Redirect HTTP to HTTPS
aws elbv2 create-listener \
  --load-balancer-arn $ALB \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=redirect,RedirectConfig="{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}" \
  --region us-east-1
```

---

## Monitoring & Logging

### Step 1: CloudWatch Agent Installation

```bash
# Download CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i amazon-cloudwatch-agent.deb

# Create config file
sudo tee /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json > /dev/null <<'EOF'
{
  "metrics": {
    "namespace": "ecommerce",
    "metrics_collected": {
      "cpu": {
        "measurement": [
          {
            "name": "cpu_usage_idle",
            "rename": "CPU_IDLE",
            "unit": "Percent"
          },
          "cpu_usage_iowait"
        ],
        "metrics_collection_interval": 60,
        "resources": ["*"],
        "totalcpu": false
      },
      "mem": {
        "measurement": [
          {
            "name": "mem_used_percent",
            "rename": "MEM_USED",
            "unit": "Percent"
          }
        ],
        "metrics_collection_interval": 60
      },
      "disk": {
        "measurement": [
          {
            "name": "used_percent",
            "rename": "DISK_USED",
            "unit": "Percent"
          }
        ],
        "metrics_collection_interval": 60,
        "resources": ["/"]
      }
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/syslog",
            "log_group_name": "/aws/ec2/ecommerce/system",
            "log_stream_name": "syslog"
          },
          {
            "file_path": "/var/log/docker",
            "log_group_name": "/aws/ec2/ecommerce/docker",
            "log_stream_name": "docker"
          }
        ]
      }
    }
  }
}
EOF

# Start agent
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json \
  -s

# Verify
sudo systemctl status amazon-cloudwatch-agent
```

### Step 2: CloudWatch Dashboards

```bash
# Create dashboard
aws cloudwatch put-dashboard \
  --dashboard-name ecommerce-prod \
  --dashboard-body file://cloudwatch-dashboard.json \
  --region us-east-1
```

### Step 3: CloudWatch Alarms

```bash
# High CPU alarm
aws cloudwatch put-metric-alarm \
  --alarm-name ecommerce-high-cpu \
  --alarm-description "Alert when CPU > 80%" \
  --metric-name CPU_IDLE \
  --namespace ecommerce \
  --statistic Average \
  --period 300 \
  --threshold 20 \
  --comparison-operator LessThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:123456789:alerts \
  --region us-east-1

# High memory alarm
aws cloudwatch put-metric-alarm \
  --alarm-name ecommerce-high-memory \
  --alarm-description "Alert when memory > 80%" \
  --metric-name MEM_USED \
  --namespace ecommerce \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:123456789:alerts \
  --region us-east-1
```

---

## Backup & Disaster Recovery

### Step 1: Automated Backups

```bash
# Create backup script
sudo tee /usr/local/bin/ecommerce-backup.sh > /dev/null <<'EOF'
#!/bin/bash
set -e

BACKUP_DIR="/backups/$(date +%Y-%m-%d_%H-%M-%S)"
S3_BUCKET="s3://ecommerce-backups-$(aws sts get-caller-identity --query Account --output text)"
mkdir -p $BACKUP_DIR

echo "Starting backup at $(date)"

# Backup MongoDB
cd /var/app
docker compose -f docker/compose.production.yaml exec -T mongo \
  mongodump --authenticationDatabase admin \
  -u admin -p $(grep MONGO_INITDB_ROOT_PASSWORD .env | cut -d= -f2) \
  --archive > $BACKUP_DIR/mongodb.archive

# Backup MinIO
docker exec minio-prod /usr/bin/mc mirror myminio/ecommerce $BACKUP_DIR/minio

# Backup application code
tar -czf $BACKUP_DIR/app-code.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.env \
  /var/app

# Backup environment (encrypted)
sudo openssl enc -aes-256-cbc -in /var/app/.env -out $BACKUP_DIR/.env.enc -pass pass:$(cat /var/app/.backup-key)

# Upload to S3
aws s3 sync $BACKUP_DIR $S3_BUCKET/$(date +%Y/%m/%d)/

# Keep only last 30 days locally
find /backups -type f -mtime +30 -delete

echo "Backup completed successfully at $(date)"
EOF

# Make executable
sudo chmod +x /usr/local/bin/ecommerce-backup.sh

# Test backup
sudo /usr/local/bin/ecommerce-backup.sh
```

### Step 2: Automated Backup Scheduling

```bash
# Create cron job for daily backups at 2 AM
sudo tee /etc/cron.d/ecommerce-backup > /dev/null <<'EOF'
0 2 * * * root /usr/local/bin/ecommerce-backup.sh >> /var/log/ecommerce-backup.log 2>&1
EOF

# Verify cron job
sudo crontab -l
```

### Step 3: Restore Procedures

```bash
# Restore MongoDB from backup
docker compose -f docker/compose.production.yaml down

# Download from S3
aws s3 cp s3://ecommerce-backups-123456789/2024/01/15/mongodb.archive .

# Restore to MongoDB
docker compose -f docker/compose.production.yaml up -d mongo
sleep 30

docker compose -f docker/compose.production.yaml exec -T mongo \
  mongorestore --authenticationDatabase admin \
  -u admin -p $MONGO_PASSWORD \
  --archive < mongodb.archive

# Restore application
docker compose -f docker/compose.production.yaml up -d
```

---

## Scaling & High Availability

### Vertical Scaling

```bash
# Stop services
docker compose -f docker/compose.production.yaml down

# Increase instance size
# In AWS Console: Right-click instance → Instance State → Stop
# Instance Settings → Change Instance Type → Select larger type
# Start instance

# Restart services
docker compose -f docker/compose.production.yaml up -d
```

### Horizontal Scaling (Multi-instance)

```bash
# Create AMI from current instance
AMI=$(aws ec2 create-image \
  --instance-id $INSTANCE_ID \
  --name ecommerce-prod-$(date +%s) \
  --region us-east-1 \
  --query 'ImageId' \
  --output text)

# Launch additional instances from AMI
for i in {2..3}; do
  INSTANCE=$(aws ec2 run-instances \
    --image-id $AMI \
    --instance-type t3.xlarge \
    --key-name ecommerce-key \
    --security-group-ids $SG_ID \
    --region us-east-1 \
    --query 'Instances[0].InstanceId' \
    --output text)
  
  # Register with load balancer
  aws elbv2 register-targets \
    --target-group-arn $TG \
    --targets Id=$INSTANCE \
    --region us-east-1
done
```

### Auto Scaling

```bash
# Create launch template
aws ec2 create-launch-template \
  --launch-template-name ecommerce \
  --launch-template-data '{
    "ImageId":"'$AMI'",
    "InstanceType":"t3.xlarge",
    "KeyName":"ecommerce-key",
    "SecurityGroupIds":["'$SG_ID'"]
  }' \
  --region us-east-1

# Create Auto Scaling group
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name ecommerce-asg \
  --launch-template "LaunchTemplateName=ecommerce,Version=\$Latest" \
  --min-size 2 \
  --max-size 10 \
  --desired-capacity 3 \
  --target-group-arns $TG \
  --health-check-type ELB \
  --health-check-grace-period 300 \
  --region us-east-1

# Create scaling policy (scale up)
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name ecommerce-asg \
  --policy-name scale-up \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "TargetValue":70.0,
    "PredefinedMetricSpecification":{"PredefinedMetricType":"ASGAverageCPUUtilization"}
  }' \
  --region us-east-1
```

---

## Troubleshooting

### Common Issues

#### Services Won't Start

```bash
# Check logs
docker compose -f docker/compose.production.yaml logs

# Check disk space
df -h
# If full, cleanup old images: docker image prune -a

# Check memory
free -h

# Check ports in use
sudo ss -tulpn | grep LISTEN

# Restart Docker
sudo systemctl restart docker
```

#### Slow Performance

```bash
# Monitor real-time resource usage
docker stats

# Check Prometheus metrics
curl 'http://localhost:9090/api/v1/query?query=container_cpu_usage_seconds_total'

# Check Elasticsearch indices size
curl http://localhost:9200/_cat/indices?v

# Rotate/delete old indices
curl -X DELETE "http://localhost:9200/backend-logs-2024-01*"
```

#### Connectivity Issues

```bash
# Check instance security group
aws ec2 describe-security-groups --group-ids $SG_ID --region us-east-1

# Check network ACLs
aws ec2 describe-network-acls --region us-east-1

# Test DNS resolution
nslookup api.example.com
dig api.example.com

# Test connectivity to instance
aws ec2 describe-instances --instance-ids $INSTANCE_ID --region us-east-1 | grep PublicIpAddress
```

#### Database Corruption

```bash
# Check MongoDB status
docker compose -f docker/compose.production.yaml exec mongo mongosh \
  --eval "db.adminCommand('ping')"

# Repair database
docker compose -f docker/compose.production.yaml exec mongo mongosh \
  --eval "db.repairDatabase()"

# If all else fails, restore from backup
docker compose -f docker/compose.production.yaml down
# ... restore from backup ...
docker compose -f docker/compose.production.yaml up -d
```

---

## Maintenance & Updates

### Regular Maintenance

```bash
# Weekly health checks
docker compose -f docker/compose.production.yaml ps
curl http://localhost:5921/health

# Monthly Docker cleanup
docker system prune -a --volumes

# Update Docker
sudo apt-get update && sudo apt-get upgrade -y

# Check certificate expiration
sudo certbot certificates

# Review logs
tail -f /var/log/nginx/access.log
```

### Security Updates

```bash
# Enable unattended upgrades
sudo apt-get install -y unattended-upgrades
sudo systemctl enable unattended-upgrades

# Check for vulnerabilities
trivy image backend:latest
trivy image gateway:latest

# Update base images
docker pull mongo:7
docker pull prom/prometheus:latest
docker pull grafana/grafana:latest
docker pull docker.elastic.co/elasticsearch/elasticsearch:8.11.0

# Rebuild with new images
docker compose -f docker/compose.production.yaml build
docker compose -f docker/compose.production.yaml up -d
```

---

## Cost Optimization

### Recommendations

1. **Use Reserved Instances** - Save 40% on compute
2. **Enable S3 Intelligent Tiering** - Automatic cost optimization
3. **Use VPC Endpoints** - Reduce data transfer costs
4. **Enable CloudWatch Insights** - Better cost visibility
5. **Set up Budget Alerts** - Prevent surprise bills

```bash
# Create billing alert
aws budgets create-budget \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget file://budget.json \
  --notifications-with-subscribers file://notifications.json
```

---

**Last Updated:** December 2024
**Version:** 1.0.0
