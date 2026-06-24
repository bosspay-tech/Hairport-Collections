/**
 * PM2 process manager config for VPS / dedicated server deploys.
 *
 * Setup:
 *   npm install
 *   npm run build
 *   pm2 start ecosystem.config.cjs --env production
 *
 * Ensure .env exists on the server (see .env.production.example).
 */
module.exports = {
  apps: [
    {
      name: "hairport-collections",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "development",
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
