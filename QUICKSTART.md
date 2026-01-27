# Vaultrix Quick Start Guide

Get Vaultrix up and running in under 5 minutes!

> **ℹ️ First-Time Setup**: If using a seeded database, a temporary admin account is available:
> - Email: `admin@invetrix.local`
> - Password: `Admin@123!`
> 
> **This account is automatically deleted** after you complete the setup wizard and create your own admin account.

## Prerequisites

- Docker and Docker Compose installed
- 2GB RAM minimum
- 10GB disk space

## Installation

### Option 1: Using Docker Compose (Recommended)

1. **Create a directory for Vaultrix**:
   ```bash
   mkdir vaultrix && cd vaultrix
   ```

2. **Download the docker-compose file**:
   ```bash
   curl -O https://raw.githubusercontent.com/MendesCorporation/vaultrix/main/docker-compose.yml
   curl -O https://raw.githubusercontent.com/MendesCorporation/vaultrix/main/.env.example
   ```

3. **Create your environment file**:
   ```bash
   cp .env.example .env
   ```

4. **Generate secrets**:
   ```bash
   # Generate AUTH_SECRET
   openssl rand -base64 32
   
   # Generate ENCRYPTION_PEPPER
   openssl rand -hex 32
   ```

5. **Edit the .env file**:
   ```bash
   nano .env
   ```
   
   Update these values:
   ```env
   DB_USER=vaultrix
   DB_PASSWORD=your_secure_password_here
   DB_NAME=vaultrix
   AUTH_SECRET=paste_generated_auth_secret_here
   ENCRYPTION_PEPPER=paste_generated_encryption_pepper_here
   AUTH_URL=http://localhost:3000
   ```

6. **Start Vaultrix**:
   ```bash
   docker-compose up -d
   ```

7. **Access Vaultrix**:
   - Open your browser: `http://localhost:3000`
   - You'll be redirected to the setup wizard
   - Create your admin account

   **First-Time Setup Only**: If the database was seeded, you can login with temporary credentials:
   - **Email**: `admin@invetrix.local`
   - **Password**: `Admin@123!`
   - This temporary account is **automatically deleted** after completing the setup wizard

### Option 2: Using Docker Run

```bash
# Start PostgreSQL
docker run -d \
  --name vaultrix-db \
  -e POSTGRES_USER=vaultrix \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=vaultrix \
  -v vaultrix-db:/var/lib/postgresql/data \
  postgres:16-alpine

# Start Vaultrix
docker run -d \
  --name vaultrix-app \
  --link vaultrix-db:db \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://vaultrix:your_password@db:5432/vaultrix \
  -e AUTH_SECRET=$(openssl rand -base64 32) \
  -e ENCRYPTION_PEPPER=$(openssl rand -hex 32) \
  -e AUTH_URL=http://localhost:3000 \
  -v vaultrix-storage:/app/storage \
  -v vaultrix-backups:/app/backups \
  helio5/vaultrix:latest
```

## First Steps

### 1. Complete Setup Wizard

After accessing Vaultrix for the first time:

1. You'll be redirected to `/setup`
2. Create your Super Admin account:
   - Email
   - Name
   - Password (minimum 8 characters)
3. Click "Complete Setup"

### 2. Configure System Settings

Navigate to **Settings** and configure:

- **System Name**: Customize your instance name
- **Logo**: Upload your company logo
- **Public Base URL**: Set your public URL (important for email links and agent installation)

### 3. Set Up SMTP (Optional but Recommended)

For email notifications and password resets:

1. Go to **Settings** → **SMTP Configuration**
2. Enter your SMTP details:
   - Host
   - Port
   - Username
   - Password
   - From address
3. Test the connection
4. Save

### 4. Add Your First Machine

1. Navigate to **Machines**
2. Click "New Machine"
3. Fill in the details:
   - Hostname
   - IP address
   - SSH credentials (username/password or SSH key)
   - Provider (optional)
4. Save

### 5. Install Monitoring Agent

To enable real-time monitoring:

1. Go to **Observability**
2. Find your machine
3. Click "Generate Token"
4. Copy the installation command
5. Run it on your server via SSH

The agent will start sending metrics immediately!

### 6. Add Credentials

1. Navigate to **Credentials**
2. Click "New Credential"
3. Select platform (or create custom)
4. Enter credential details
5. Save

### 7. Deploy Your First Stack

1. Navigate to **Stacks**
2. Browse available stacks (WordPress, Nginx, etc.)
3. Click "Deploy"
4. Select target machine
5. Configure environment variables
6. Deploy!

## Common Tasks

### View System Metrics

- Go to **Dashboard** for overview
- Go to **Observability** for detailed machine metrics
- Click on a machine to see historical data

### Set Up Alerts

1. Go to **Observability**
2. Click on a machine
3. Click "Configure Alerts"
4. Set thresholds:
   - CPU usage
   - Memory usage
   - Container down
   - Machine offline
5. Save

### Create Backup Schedule

1. Go to **Settings** → **Backup**
2. Click "New Backup Configuration"
3. Configure:
   - Schedule (daily or specific days)
   - Retention period
   - Destination
4. Save

### Invite Users

1. Go to **Users**
2. Click "Invite User"
3. Enter email and select role
4. Send invitation
5. User receives email with setup link

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs app

# Check if database is healthy
docker-compose ps
```

### Can't access the application

1. Check if containers are running: `docker-compose ps`
2. Check if port 3000 is available: `netstat -an | grep 3000`
3. Check firewall rules
4. Try accessing from localhost first

### Database connection error

1. Verify DATABASE_URL in .env
2. Check if PostgreSQL is running: `docker-compose ps db`
3. Check database logs: `docker-compose logs db`

### Agent not sending data

1. Verify token is correct
2. Check if agent is installed: `sudo /usr/local/bin/vaultrix-agent --status`
3. Check agent logs on the server
4. Verify firewall allows outbound HTTPS

## Updating Vaultrix

```bash
# Pull latest image
docker-compose pull

# Restart with new image
docker-compose up -d

# Check logs
docker-compose logs -f app
```

## Backup and Restore

### Manual Backup

```bash
# Backup database
docker-compose exec db pg_dump -U vaultrix vaultrix > backup.sql

# Backup volumes
docker run --rm -v vaultrix_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/vaultrix-volumes.tar.gz /data
```

### Restore from Backup

```bash
# Restore database
docker-compose exec -T db psql -U vaultrix vaultrix < backup.sql

# Or use the built-in restore feature in Settings → Backup
```

## Getting Help

- **Documentation**: [README.md](README.md)
- **Issues**: [GitHub Issues](https://github.com/MendesCorporation/vaultrix/issues)
- **Discussions**: [GitHub Discussions](https://github.com/MendesCorporation/vaultrix/discussions)

## Next Steps

- Explore the [full documentation](README.md)
- Check out [DOCKER.md](DOCKER.md) for advanced Docker configuration
- Read [SECURITY.md](SECURITY.md) for security best practices
- Review [CONTRIBUTING.md](CONTRIBUTING.md) if you want to contribute

---

**Congratulations!** 🎉 You now have Vaultrix up and running!
