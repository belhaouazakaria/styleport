module.exports = {
  apps: [
    {
      name: "saytwist",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      env: { NODE_ENV: "production" },
    },
    {
      name: "saytwist-editorial-worker",
      script: "node_modules/.bin/tsx",
      args: "workers/editorial-worker.ts",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        TRANSLATOR_EDITORIAL_CONCURRENCY: 3,
      },
    },
  ],
};
