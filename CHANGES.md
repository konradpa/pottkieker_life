# Changes Made for Production Deployment

## Summary
Your Mensa photo sharing app has been upgraded with essential privacy, security, and admin features to make it production-ready for deployment tonight.

---

## What Was Added

### 1. Privacy Protections ✅

#### IP Address Hashing
- **Before:** Raw IP addresses stored in database (privacy risk)
- **After:** IP addresses hashed with SHA-256 before storage
- **Impact:** Users cannot be identified, but spam prevention still works
- **Files changed:**
  - `backend/utils/hashIP.js` (new)
  - All route files updated to use `hashIP()`

#### EXIF Metadata Stripping
- **Before:** Photos uploaded with GPS location, camera info, timestamps
- **After:** All EXIF metadata automatically removed on upload
- **Impact:** User privacy protected, no location leaks
- **Package added:** `sharp` for image processing
- **Files changed:** `backend/routes/photos.js`

### 2. Security Enhancements ✅

#### Environment Variables
- **New files:**
  - `.env` - Local development config
  - `.env.example` - Template for production
- **Variables added:**
  - `JWT_SECRET` - For admin authentication
  - `ADMIN_PASSWORD` - For admin panel access
  - `CORS_ORIGIN` - Restrict API access to your domain
  - `NODE_ENV` - Production/development mode

#### Security Middleware
- **Helmet.js** - Adds security headers (XSS, clickjacking protection)
- **CORS restriction** - Only your domain can access the API in production
- **Files changed:** `backend/server.js`

### 3. Admin Panel ✅

#### Admin Authentication
- **New route:** `/api/admin/login`
- **Password-based login** with JWT tokens
- **24-hour session expiration**
- **Package added:** `jsonwebtoken`, `bcrypt`

#### Admin API Endpoints
- `GET /api/admin/stats` - View statistics
- `GET /api/admin/photos` - List all photos
- `DELETE /api/admin/photos/:id` - Delete any photo
- `GET /api/admin/comments` - List all comments
- `DELETE /api/admin/comments/meal/:id` - Delete meal comments
- `DELETE /api/admin/comments/photo/:id` - Delete photo comments

#### Admin UI
- **New file:** `frontend/admin.html`
- **Features:**
  - Login page with password
  - Dashboard with statistics
  - Photo management (view & delete)
  - Comment management (view & delete)
  - Clean, mobile-responsive design

**Access:** `https://yourdomain.com/admin.html`
**Password:** Set in `.env` file (`ADMIN_PASSWORD`)

### 4. Deployment Documentation ✅

**New file:** `DEPLOYMENT.md`

Comprehensive guide covering:
- Server setup (Oracle Cloud Free Tier recommended)
- Domain registration ($8-12/year)
- SSL certificate setup (free)
- Nginx configuration
- PM2 process management
- Database backups
- Firewall setup
- Troubleshooting
- **Total cost: ~$1/month** (or $0 with Oracle Free Tier)

---

## Statistics Dashboard

The admin panel shows:
- Total photos (all-time)
- Photos uploaded today
- Total comments (meal + photo)
- Storage used (MB)

---

## What You Need to Do

### Before Deployment:

1. **Set strong passwords in `.env`:**
   ```bash
   # Generate secure JWT secret
   openssl rand -base64 32

   # Edit .env file
   JWT_SECRET=paste-generated-secret-here
   ADMIN_PASSWORD=choose-strong-password-here
   CORS_ORIGIN=https://yourdomain.com
   NODE_ENV=production
   ```

2. **Get a server** (see DEPLOYMENT.md for options)

3. **Get a domain** (~$8-12/year)

4. **Follow DEPLOYMENT.md step by step**

---

## Privacy & Legal

### What Data is Collected:
- ✅ **Hashed IP addresses** (for spam prevention, not reversible)
- ✅ **User-provided names** (optional, no verification)
- ✅ **Comments and photos** (user content)
- ✅ **Timestamps**

### What is NOT Collected:
- ❌ Real IP addresses
- ❌ GPS location (EXIF stripped)
- ❌ Email addresses
- ❌ Personal information
- ❌ Tracking cookies

### Data Retention:
- Photos auto-deleted daily at midnight
- Admin can manually delete anything

### Do You Need an Imprint?
**No** - Not required for small private apps for friends.

**Recommended:** Add a simple note on your site like:
> "This is a private app for UHH students. We collect minimal data (hashed IPs for spam prevention). Photos are deleted daily."

---

## Testing Checklist

Before going live, test:

- [ ] Main page loads (`/`)
- [ ] Photo feed works (`/feed.html`)
- [ ] Can upload a photo
- [ ] Can post a comment
- [ ] Admin login works (`/admin.html`)
- [ ] Admin can delete photos
- [ ] Admin can delete comments
- [ ] Statistics show correct numbers
- [ ] HTTPS works (SSL certificate)

---

## File Changes Summary

### New Files:
- `backend/routes/admin.js` - Admin API endpoints
- `backend/utils/hashIP.js` - IP hashing utility
- `frontend/admin.html` - Admin panel UI
- `.env` - Environment configuration
- `.env.example` - Environment template
- `DEPLOYMENT.md` - Deployment guide
- `CHANGES.md` - This file

### Modified Files:
- `backend/server.js` - Added dotenv, helmet, CORS config, admin routes
- `backend/routes/votes.js` - Added IP hashing
- `backend/routes/portions.js` - Added IP hashing
- `backend/routes/comments.js` - Added IP hashing
- `backend/routes/photos.js` - Added IP hashing + EXIF stripping
- `package.json` - Added new dependencies

### New Dependencies:
- `sharp` - Image processing (EXIF removal)
- `bcrypt` - Password hashing
- `jsonwebtoken` - Admin authentication
- `dotenv` - Environment variables
- `helmet` - Security headers

---

## Cost Breakdown

### Recommended Setup (Oracle Free Tier):
- **Server:** $0/month (Oracle Cloud Free Tier)
- **Domain:** ~$0.67-1/month ($8-12/year)
- **SSL:** $0/month (Let's Encrypt)
- **Total:** ~$0.67-1/month ($8-12/year)

### Alternative (Paid Server):
- **Server:** $4.50-6/month (Hetzner/DigitalOcean)
- **Domain:** ~$1/month
- **Total:** ~$5.50-7/month

---

## Quick Start Commands

```bash
# Local development
npm install
npm start
# Visit http://localhost:3000

# Production deployment
# See DEPLOYMENT.md for full guide
```

---

## Admin Access

**URL:** `https://yourdomain.com/admin.html`
**Password:** Check your `.env` file (`ADMIN_PASSWORD`)

---

## Support

If you run into issues:
1. Check `DEPLOYMENT.md` troubleshooting section
2. Check server logs: `pm2 logs mensa-app`
3. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`

---

**Your app is ready to deploy!** 🚀

Follow `DEPLOYMENT.md` to get it online tonight.
