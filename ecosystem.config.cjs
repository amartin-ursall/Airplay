module.exports = {
  apps: [
    {
      name: 'airplay-server',
      script: 'npm',
      args: 'run server',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/server-error.log',
      out_file: 'logs/server-output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Restart on crash
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      // Keep the process alive
      kill_timeout: 5000,
      listen_timeout: 10000
    },
    {
      name: 'airplay-frontend',
      script: 'npm',
      args: 'run dev',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development'
      },
      error_file: 'logs/frontend-error.log',
      out_file: 'logs/frontend-output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Restart on crash
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      // Keep the process alive
      kill_timeout: 5000,
      listen_timeout: 10000
    }
  ]
};
