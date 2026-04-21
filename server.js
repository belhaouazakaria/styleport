const port = process.env.PORT || "3000";

async function main() {
  const { spawn } = await import("node:child_process");

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
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
