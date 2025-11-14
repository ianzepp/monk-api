# PM2 Process Management for Monk API

This document describes how to run monk-api as a background service using PM2.

## Prerequisites

Before starting, create `.env.production` with required variables:

```bash
# Copy from example
cp .env.example .env.production

# Edit with your production settings
# DATABASE_URL=postgresql://user:password@localhost:5432/monk
# PORT=8000
# JWT_SECRET=your_secure_random_string
# NODE_ENV=production
```

**Security Note:** `.env.production` is gitignored and should never be committed. It contains sensitive credentials.

## Quick Start

```bash
# Build production code
npm run build

# Start monk-api
pm2 start ecosystem.config.cjs

# View status
pm2 list

# View logs
pm2 logs monk-api

# Restart
pm2 restart monk-api

# Stop
pm2 stop monk-api

# Delete from PM2
pm2 delete monk-api
```

## Configuration

The `ecosystem.config.cjs` file contains the PM2 configuration:

- **Application**: Runs `dist/index.js` (production build)
- **Port**: 8000 (production)
- **Instances**: 1 (fork mode)
- **Auto-restart**: Yes, with crash protection
- **Memory limit**: 1GB (restarts if exceeded)
- **Environment**: Loads from `.env.production`
- **Database**: `monk` (configured in `.env.production`)
- **Logs**: Written to `logs/pm2-out.log` and `logs/pm2-error.log`

## Development vs Production

**Production (PM2):**
- Port: `8000`
- Database: `monk`
- Config: `.env.production` (gitignored)
- Command: `pm2 start ecosystem.config.cjs`

**Development (npm):**
- Port: `9001`
- Database: `monk_dev`
- Config: `.env.local` (gitignored)
- Command: `npm start`

Both can run simultaneously without conflicts.

## Auto-Start on Boot

To configure monk-api to start automatically when your system boots:

### Step 1: Save PM2 Process List

```bash
pm2 save
```

This saves the current running processes to `~/.pm2/dump.pm2`.

### Step 2: Generate Startup Script (macOS)

```bash
pm2 startup
```

This will output a command like:

```bash
sudo env PATH=$PATH:/path/to/node /path/to/pm2 startup launchd -u your_username --hp /Users/your_username
```

### Step 3: Run the Generated Command

Copy and paste the command from step 2 and run it with `sudo`. You'll need to enter your password.

This creates a launchd plist at:
```
/Library/LaunchDaemons/io.keymetrics.pm2.your_username.plist
```

### Step 4: Verify

Restart your computer and check that monk-api starts automatically:

```bash
pm2 list
```

## Monitoring

### View Real-Time Logs

```bash
pm2 logs monk-api
```

### View Log Files

```bash
tail -f logs/pm2-out.log
tail -f logs/pm2-error.log
```

### Check Process Status

```bash
pm2 status
```

### Monitor Resources

```bash
pm2 monit
```

## Troubleshooting

### Service Won't Start

**Common Cause: Missing Environment Variables**

The application enforces these required variables at startup:
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Server port (8000 for production)
- `JWT_SECRET` - JWT signing secret
- `NODE_ENV` - Environment mode (production)

If any are missing, the app will **fail immediately** with a clear error message. This is intentional - no silent defaults.

Check the error logs:
```bash
pm2 logs monk-api --err --lines 50
```

Common errors:
```
Fatal: environment is missing "DATABASE_URL"
Fatal: environment is missing "JWT_SECRET"
```

**Solution:** Ensure `.env.production` exists and contains all required variables.

### High Memory Usage

Check memory consumption:
```bash
pm2 list
```

If consistently above 1GB, the service will auto-restart. Increase the limit in `ecosystem.config.cjs`:
```javascript
max_memory_restart: '2G',
```

### Database Connection Issues

Verify `.env.local` contains correct `DATABASE_URL`:
```bash
cat .env.local | grep DATABASE_URL
```

### Check PM2 Status

```bash
pm2 status
pm2 info monk-api
```

## Uninstall Auto-Start

To remove the auto-start configuration:

```bash
pm2 unstartup launchd
```

Then remove the saved process list:
```bash
rm ~/.pm2/dump.pm2
```

## Advanced Configuration

### Scheduled Restarts

Uncomment in `ecosystem.config.cjs`:
```javascript
cron_restart: '0 3 * * *',  // Restart daily at 3am
```

### Cluster Mode

For multiple instances (load balancing):
```javascript
instances: 4,
exec_mode: 'cluster',
```

Note: Only use cluster mode if your application is stateless.

### Watch Mode (Development)

To auto-restart on file changes:
```javascript
watch: true,
ignore_watch: ['node_modules', 'logs'],
```

Note: Not recommended for production.

## Related Commands

```bash
# Restart all PM2 processes
pm2 restart all

# Stop all processes
pm2 stop all

# Delete all processes
pm2 delete all

# Update PM2
npm install -g pm2@latest

# PM2 web interface (optional)
pm2 web
```

## Production Checklist

- [ ] Built production code: `npm run build`
- [ ] Configured `.env.local` with production settings
- [ ] Started service: `pm2 start ecosystem.config.cjs`
- [ ] Saved process list: `pm2 save`
- [ ] Configured auto-start: `pm2 startup` (and run generated command)
- [ ] Tested restart: `sudo reboot` and verify with `pm2 list`
- [ ] Monitoring set up: `pm2 logs monk-api` accessible

## See Also

- [PM2 Official Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [PM2 Process Management Guide](https://pm2.keymetrics.io/docs/usage/process-management/)
- [PM2 Startup Hook](https://pm2.keymetrics.io/docs/usage/startup/)
