// PM2 process config. Start with:  pm2 start deploy/ecosystem.config.cjs
// Keep instances at 1: the rate limiter and the budget reservations live in
// the app's memory, so a second copy would let visitors bypass them.
const path = require('node:path');

const appDir = path.resolve(__dirname, '..');

module.exports = {
  apps: [
    {
      name: 'privacypls',
      cwd: appDir,
      script: 'src/server.js',
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      max_memory_restart: '500M',
      time: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};
