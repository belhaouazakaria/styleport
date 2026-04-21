const { spawn } = require("node:child_process");

const port = process.env.PORT || "3000";

const child = spawn(
  process.execPath,
  ["./node_modules/next/dist/bin/next", "start", "-p", String(port)],
  {
    stdio: "inherit",
    env: process.env,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

