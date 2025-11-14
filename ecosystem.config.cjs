/**
 * PM2 Ecosystem Configuration for Monk API
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 logs monk-api
 *   pm2 restart monk-api
 *   pm2 stop monk-api
 *   pm2 delete monk-api
 *
 * Auto-start on boot:
 *   pm2 startup
 *   pm2 save
 */

module.exports = {
  apps: [
    {
      name: 'monk-api',
      script: 'dist/index.js',
      cwd: '/Users/ianzepp/Workspaces/monk-api',

      // Process management
      instances: 1,
      exec_mode: 'fork',

      // Auto-restart configuration
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      // Crash handling
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,

      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 9001,
      },

      // Use .env.local for sensitive config (DATABASE_URL, JWT_SECRET, etc.)
      env_file: '.env.local',

      // Logging
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Process identifier
      pid_file: 'logs/monk-api.pid',

      // Cron restart (optional - restart daily at 3am)
      // cron_restart: '0 3 * * *',

      // Advanced options
      kill_timeout: 5000,
      listen_timeout: 3000,
      shutdown_with_message: true,
    }
  ]
};
