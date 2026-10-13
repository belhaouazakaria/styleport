module.exports = {
  apps: [
    {
      name: "saytwist",
      script: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/npm",
      args: "start",
      cwd: "/home/saytwist/htdocs/saytwist.com",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      env: { NODE_ENV: "production", PORT: "3001" },
    },
  ],
};
