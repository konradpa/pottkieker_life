# Deployment Guide - UHH Mensa Photo Sharing App

## Quick Start

This guide will help you deploy your Mensa app to a production server.

---

## 1. Server Setup (Oracle Cloud Free Tier - Recommended)

### Why Oracle Cloud Free Tier?
- **FREE forever** (no credit card charges)
- 2 ARM VMs with 4 cores and 24GB RAM total
- 200GB storage
- Locations: US, Canada, Japan, etc.

### Steps:
1. Go to https://www.oracle.com/cloud/free/
2. Sign up for a free account
3. Create a new VM instance:
   - Choose **Ampere A1** (ARM) shape
   - Select **Ubuntu 22.04** as OS
   - Choose a region **outside EU** (e.g., US East, Canada Southeast)
   - Download the SSH key

4. Connect to your server:
   ```bash
   ssh -i /path/to/your-key.pem ubuntu@YOUR_SERVER_IP
   ```

---

## 2. Domain Setup

### Cheap Domain Options:
- **Namecheap**: ~$8-12/year for .com
- **Porkbun**: ~$8-10/year for .com
- **Cloudflare**: ~$10/year for .com
- **Alternative TLDs**: .xyz, .site, .online (~$1-3/year)

### DNS Configuration:
1. Buy domain from any provider
2. Add an **A record** pointing to your server IP:
   ```
   Type: A
   Name: @
   Value: YOUR_SERVER_IP
   TTL: 3600
   ```

---

## 3. Server Configuration

### Install Required Software

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Nginx
sudo apt install -y nginx

# Install certbot for SSL
sudo apt install -y certbot python3-certbot-nginx

# Install git
sudo apt install -y git
```

---

## 4. Deploy Your Application

### Upload Your Code

Option A: Using Git (recommended)
```bash
cd /home/ubuntu
git clone YOUR_REPO_URL mensa_project
cd mensa_project
```

Option B: Using SCP from your local machine
```bash
# From your local machine
scp -i /path/to/your-key.pem -r /Users/test/Desktop/mensa_project ubuntu@YOUR_SERVER_IP:/home/ubuntu/
```

### Install Dependencies

```bash
cd /home/ubuntu/mensa_project
npm install --production
```

### Configure Environment Variables

```bash
nano .env
```

Add the following (replace with your values):
```env
PORT=3000
NODE_ENV=production

# Replace with your actual domain
CORS_ORIGIN=https://yourdomain.com

# Generate a random secret (run: openssl rand -base64 32)
JWT_SECRET=YOUR_RANDOM_SECRET_HERE

# Set a strong admin password
ADMIN_PASSWORD=YOUR_STRONG_PASSWORD_HERE
```

**Important:** Generate a secure JWT_SECRET:
```bash
openssl rand -base64 32
```

---

## 5. Setup Process Manager (PM2)

PM2 keeps your app running even after server restarts.

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start your app
cd /home/ubuntu/mensa_project
pm2 start backend/server.js --name mensa-app

# Save PM2 config
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Copy and run the command it outputs
```

### Useful PM2 Commands:
```bash
pm2 status           # Check app status
pm2 logs mensa-app   # View logs
pm2 restart mensa-app # Restart app
pm2 stop mensa-app   # Stop app
```

---

## 6. Configure Nginx (Reverse Proxy)

Create Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/mensa
```

Paste this configuration (replace `yourdomain.com`):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Increase upload size limit
    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000;
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

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/mensa /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

---

## 7. Setup SSL Certificate (HTTPS)

**Free SSL certificate from Let's Encrypt:**

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Follow the prompts:
- Enter your email
- Agree to terms
- Choose option 2 (redirect HTTP to HTTPS)

Certificate will auto-renew every 90 days.

---

## 8. Configure Firewall

```bash
# Allow SSH, HTTP, and HTTPS
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

**Note for Oracle Cloud:** Also configure Security List in Oracle Cloud Console:
1. Go to your VM instance
2. Click on the subnet
3. Click "Security Lists"
4. Add Ingress Rules for ports 80 and 443

---

## 9. Database Backup Script

Create automatic daily backups:

```bash
mkdir -p /home/ubuntu/backups
nano /home/ubuntu/backup-db.sh
```

Add:
```bash
#!/bin/bash
BACKUP_DIR="/home/ubuntu/backups"
DB_PATH="/home/ubuntu/mensa_project/database/mensa.db"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
cp $DB_PATH $BACKUP_DIR/mensa_db_$DATE.db

# Keep only last 7 days
find $BACKUP_DIR -name "mensa_db_*.db" -mtime +7 -delete

echo "Backup completed: mensa_db_$DATE.db"
```

Make executable and add to crontab:
```bash
chmod +x /home/ubuntu/backup-db.sh

# Add to crontab (run daily at 3 AM)
crontab -e
# Add this line:
0 3 * * * /home/ubuntu/backup-db.sh >> /home/ubuntu/backups/backup.log 2>&1
```

---

## 10. Access Your Admin Panel

After deployment, access your admin panel at:
```
https://yourdomain.com/admin.html
```

Default credentials (as set in .env):
- Password: The value you set for `ADMIN_PASSWORD`

**Change this immediately in production!**

---

## 11. Testing Deployment

1. Visit `https://yourdomain.com` - should show the meal plan
2. Visit `https://yourdomain.com/feed.html` - should show photo feed
3. Visit `https://yourdomain.com/admin.html` - should show admin login
4. Upload a photo - check that EXIF data is stripped
5. Post a comment - check that it appears
6. Login to admin panel - check statistics

---

## 12. Monitoring & Maintenance

### Check Application Logs
```bash
pm2 logs mensa-app
```

### Check Nginx Logs
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Monitor Server Resources
```bash
htop  # Install with: sudo apt install htop
```

### Update Application
```bash
cd /home/ubuntu/mensa_project
git pull  # If using git
npm install
pm2 restart mensa-app
```

---

## 13. Security Checklist

- [x] IP addresses are hashed before storage
- [x] EXIF metadata stripped from photos
- [x] HTTPS enabled
- [x] Firewall configured
- [x] Strong admin password set
- [x] JWT secret is random and secure
- [x] CORS restricted to your domain
- [x] Security headers enabled (helmet.js)
- [ ] Regular backups scheduled
- [ ] Monitor logs for suspicious activity

---

## 14. Cost Breakdown

**Total Monthly Cost: $0** (if using Oracle Cloud Free Tier)

- **Server**: $0 (Oracle Cloud Free Tier)
- **Domain**: ~$0.67-1/month ($8-12/year)
- **SSL Certificate**: $0 (Let's Encrypt)
- **Total**: ~$0.67-1/month

**Alternative Paid Options:**
- Hetzner US ($4.50/month) + Domain ($1/month) = ~$5.50/month
- DigitalOcean ($6/month) + Domain ($1/month) = ~$7/month

---

## 15. Troubleshooting

### App won't start
```bash
pm2 logs mensa-app  # Check error logs
pm2 delete mensa-app && pm2 start backend/server.js --name mensa-app
```

### Can't access site
```bash
# Check if app is running
pm2 status

# Check if nginx is running
sudo systemctl status nginx

# Check firewall
sudo ufw status
```

### SSL certificate issues
```bash
sudo certbot renew --dry-run  # Test renewal
sudo certbot renew  # Force renewal
```

### Database locked error
```bash
# Stop app
pm2 stop mensa-app

# Check for lock file
rm /home/ubuntu/mensa_project/database/mensa.db-shm
rm /home/ubuntu/mensa_project/database/mensa.db-wal

# Restart
pm2 start mensa-app
```

---

## 16. Privacy & Legal Compliance

### What Data is Collected:
- **Hashed IP addresses** (not reversible, used for spam prevention)
- **User-provided names** (optional, no verification)
- **Comments and captions** (user-generated content)
- **Upload timestamps**

### What is NOT Collected:
- ❌ Real IP addresses
- ❌ GPS location (EXIF stripped)
- ❌ Email addresses
- ❌ Personal identifiable information
- ❌ Cookies (except admin session)

### Data Retention:
- Photos automatically deleted at midnight (Europe/Berlin time)
- Old data can be manually purged from admin panel

### For Friends/Private Use:
Since this is a small private app for friends, you don't need:
- Formal imprint (Impressum)
- Complex privacy policy
- Cookie banner

**Recommended:** Add a simple note on the site explaining what data is collected.

---

## Need Help?

- Check PM2 logs: `pm2 logs mensa-app`
- Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
- Restart everything: `pm2 restart mensa-app && sudo systemctl restart nginx`

---

**Your app is now live and secure!** 🎉
