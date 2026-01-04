# Home Server Deployment Guide

**For: Production Server Operator (Dell Desktop)**
**Version: 0.2.31**

---

## Overview

This guide walks you through deploying AgentGate SaaS on the home server. You will:

1. Set up the server environment
2. Clone the private repository
3. Configure secrets
4. Deploy with Docker
5. Set up auto-updates (optional)

**Time Required:** ~30-60 minutes

---

## Prerequisites

### Hardware Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Disk | 20 GB | 50+ GB SSD |
| Network | Stable connection | Static IP preferred |

### Software Requirements

Before starting, ensure these are installed:

```bash
# Check versions
node --version    # 20.x required
docker --version  # 20.x+ required
docker-compose --version  # 2.x required
git --version     # Any recent version

# If not installed:
# Node.js: https://nodejs.org/
# Docker: https://docs.docker.com/engine/install/ubuntu/
# Docker Compose: https://docs.docker.com/compose/install/
```

### Access Requirements

- SSH access to the server
- sudo privileges
- GitHub account with access to `agentgate-internal` repository
- SSH key registered with GitHub

---

## Step 1: Prepare the Server

### 1.1 Create Deployment Directory

```bash
# Create directory
sudo mkdir -p /opt/agentgate
sudo chown $USER:$USER /opt/agentgate
cd /opt/agentgate
```

### 1.2 Configure GitHub SSH Access

Ensure your SSH key is set up for GitHub:

```bash
# Test GitHub access
ssh -T git@github.com
# Expected: "Hi <username>! You've successfully authenticated..."

# If not set up:
ssh-keygen -t ed25519 -C "your-email@example.com"
cat ~/.ssh/id_ed25519.pub
# Add this key to GitHub: Settings → SSH and GPG keys → New SSH key
```

### 1.3 Create Agentgate User (Optional but Recommended)

```bash
# Create dedicated user for running the service
sudo useradd -m -s /bin/bash agentgate
sudo usermod -aG docker agentgate

# Switch to agentgate user for remaining steps
sudo su - agentgate
cd /opt/agentgate
```

---

## Step 2: Clone and Configure

### 2.1 Clone the Repository

```bash
cd /opt/agentgate
git clone git@github.com:org/agentgate-internal.git .

# Verify
ls -la
# Should see: packages/, infra/, docker-compose.yml, etc.
```

### 2.2 Create Environment File

Copy the example and edit with your secrets:

```bash
cp .env.example .env
nano .env  # or vim, or your preferred editor
```

**Required environment variables:**

```bash
# .env file contents

# Server Configuration
NODE_ENV=production
PORT=8080
LOG_LEVEL=info

# Stripe (for billing)
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxx

# GitHub OAuth (for user authentication)
GITHUB_CLIENT_ID=xxxxxxxxxxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxx

# Database (PostgreSQL)
DATABASE_URL=postgres://user:password@localhost:5432/agentgate

# Redis (optional, for session storage)
REDIS_URL=redis://localhost:6379

# Session secret (generate with: openssl rand -hex 32)
SESSION_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Domain (for OAuth callbacks)
PUBLIC_URL=https://your-domain.com
```

**Important:** Keep this file secure! It contains production secrets.

```bash
chmod 600 .env
```

### 2.3 Verify Configuration

```bash
# Check all required variables are set
grep -E "^[A-Z]" .env | wc -l
# Should show count of variables

# Ensure no placeholder values remain
grep "xxxx" .env
# Should return nothing
```

---

## Step 3: Build and Deploy

### 3.1 Build Docker Images

```bash
cd /opt/agentgate

# Build all images
docker-compose -f infra/docker/docker-compose.yml build

# This may take 5-10 minutes on first run
```

### 3.2 Start Services

```bash
# Start in detached mode
docker-compose -f infra/docker/docker-compose.yml up -d

# Verify containers are running
docker ps

# Expected output:
# CONTAINER ID   IMAGE                    STATUS          PORTS
# xxxxxxxxxx     agentgate-saas-server    Up 30 seconds   0.0.0.0:8080->8080/tcp
# xxxxxxxxxx     agentgate-dashboard      Up 30 seconds   0.0.0.0:3000->3000/tcp
```

### 3.3 Verify Deployment

```bash
# Check health endpoint
curl http://localhost:8080/api/v1/health

# Expected response:
# {"status":"ok","version":"0.2.31","timestamp":"..."}

# Check logs for any errors
docker-compose -f infra/docker/docker-compose.yml logs --tail 50
```

---

## Step 4: Set Up Systemd Service

Configure the service to start automatically on boot.

### 4.1 Create Service File

```bash
sudo nano /etc/systemd/system/agentgate.service
```

**Contents:**

```ini
[Unit]
Description=AgentGate SaaS Server
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=agentgate
Group=docker
WorkingDirectory=/opt/agentgate
ExecStart=/usr/bin/docker-compose -f infra/docker/docker-compose.yml up
ExecStop=/usr/bin/docker-compose -f infra/docker/docker-compose.yml down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 4.2 Enable and Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable auto-start on boot
sudo systemctl enable agentgate

# Start the service
sudo systemctl start agentgate

# Check status
sudo systemctl status agentgate
```

---

## Step 5: Configure Network Access (Optional)

### 5.1 Firewall Rules

If using UFW:

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Or just the application port
sudo ufw allow 8080/tcp
sudo ufw allow 3000/tcp
```

### 5.2 Reverse Proxy (Recommended for Production)

If you want to expose the service with a domain name and SSL:

**Using Nginx:**

```bash
sudo apt install nginx certbot python3-certbot-nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/agentgate
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/agentgate /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

---

## Step 6: Set Up Automatic Updates (Optional)

### 6.1 Create Update Script

```bash
nano /opt/agentgate/update.sh
```

```bash
#!/bin/bash
set -e

echo "$(date): Starting update..."

cd /opt/agentgate

# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose -f infra/docker/docker-compose.yml build
docker-compose -f infra/docker/docker-compose.yml up -d

# Verify
sleep 10
curl -f http://localhost:8080/api/v1/health || {
    echo "Health check failed!"
    exit 1
}

echo "$(date): Update complete"
```

```bash
chmod +x /opt/agentgate/update.sh
```

### 6.2 Set Up Cron Job

```bash
crontab -e
```

Add this line for daily updates at 3 AM:

```cron
0 3 * * * /opt/agentgate/update.sh >> /var/log/agentgate-update.log 2>&1
```

---

## Common Operations

### View Logs

```bash
# All services
docker-compose -f /opt/agentgate/infra/docker/docker-compose.yml logs

# Specific service, last 100 lines
docker-compose -f /opt/agentgate/infra/docker/docker-compose.yml logs --tail 100 saas-server

# Follow logs in real-time
docker-compose -f /opt/agentgate/infra/docker/docker-compose.yml logs -f
```

### Restart Services

```bash
# Graceful restart
sudo systemctl restart agentgate

# Or directly with docker-compose
docker-compose -f /opt/agentgate/infra/docker/docker-compose.yml restart
```

### Stop Services

```bash
sudo systemctl stop agentgate

# Or
docker-compose -f /opt/agentgate/infra/docker/docker-compose.yml down
```

### Manual Update

```bash
cd /opt/agentgate
./update.sh
```

### Check Disk Usage

```bash
# Docker disk usage
docker system df

# Clean up unused images
docker system prune -a
```

---

## Troubleshooting

### Health Check Failing

```bash
# Check if containers are running
docker ps

# If not running, check logs
docker-compose -f infra/docker/docker-compose.yml logs

# Common issues:
# - Missing environment variables
# - Database connection failed
# - Port already in use
```

### Database Connection Issues

```bash
# Test database connection
docker-compose -f infra/docker/docker-compose.yml exec saas-server \
  node -e "require('pg').Pool({connectionString: process.env.DATABASE_URL}).query('SELECT 1')"

# Check DATABASE_URL format:
# postgres://username:password@host:port/database
```

### Permission Denied

```bash
# Ensure agentgate user is in docker group
sudo usermod -aG docker agentgate

# Fix ownership
sudo chown -R agentgate:agentgate /opt/agentgate
```

### Container Won't Start

```bash
# Check for port conflicts
sudo netstat -tlnp | grep -E "8080|3000"

# Check Docker daemon
sudo systemctl status docker

# Reset and try again
docker-compose -f infra/docker/docker-compose.yml down -v
docker-compose -f infra/docker/docker-compose.yml up -d
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Start services | `sudo systemctl start agentgate` |
| Stop services | `sudo systemctl stop agentgate` |
| Restart services | `sudo systemctl restart agentgate` |
| Check status | `sudo systemctl status agentgate` |
| View logs | `docker-compose -f /opt/agentgate/infra/docker/docker-compose.yml logs -f` |
| Health check | `curl http://localhost:8080/api/v1/health` |
| Manual update | `cd /opt/agentgate && ./update.sh` |
| Shell into container | `docker-compose exec saas-server sh` |

---

## Support

If you encounter issues:

1. Check the logs: `docker-compose logs --tail 100`
2. Verify health: `curl localhost:8080/api/v1/health`
3. Contact the development team with:
   - Error messages from logs
   - Output of `docker ps`
   - Output of health check

---

## Security Notes

1. **Environment file**: Keep `.env` secure (chmod 600)
2. **Firewall**: Only expose necessary ports
3. **Updates**: Keep Docker and system packages updated
4. **Backups**: Regularly backup `/opt/agentgate/data/`
5. **SSH**: Use key-based authentication only
6. **Secrets rotation**: Rotate API keys periodically
