const DEFAULT_PORT = 3000;
const host = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || String(DEFAULT_PORT), 10);

if (!Number.isFinite(port) || port <= 0) {
  console.error("[server] Invalid PORT value:", process.env.PORT);
  process.exit(1);
}

async function main() {
  const [{ createServer }, { default: next }] = await Promise.all([
    import("node:http"),
    import("next"),
  ]);

  const app = next({
    dev: false,
    hostname: host,
    port,
  });

  await app.prepare();
  const handle = app.getRequestHandler();

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error("[server] Request handling failed:", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      } else {
        res.end();
      }
    });
  });

  server.on("error", (error) => {
    if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
      console.error(`[server] Port ${port} is already in use.`);
      process.exit(1);
    }
    console.error("[server] Fatal server error:", error);
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.log(`[server] Received ${signal}. Shutting down gracefully...`);
    server.close((error) => {
      if (error) {
        console.error("[server] Error while closing server:", error);
        process.exit(1);
      }
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  server.listen(port, host, () => {
    console.log(`[server] Listening on http://${host}:${port}`);
  });
}

void main().catch((error) => {
  console.error("[server] Startup failed:", error);
  process.exit(1);
});
