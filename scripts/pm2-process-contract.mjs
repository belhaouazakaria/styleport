import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

export async function validatePm2CliPath(cliPath) {
  const resolved = requireString(cliPath, "PM2 CLI path");
  if (!path.isAbsolute(resolved)) {
    throw new Error("PM2 CLI path must be absolute.");
  }
  try {
    await access(resolved, fsConstants.X_OK);
  } catch {
    throw new Error(`PM2 CLI is missing or not executable: ${resolved}`);
  }
  return resolved;
}

function normalizedArgs(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.trim().split(/\s+/).filter(Boolean);
  return [];
}

export function validatePm2ProcessList(raw, expected) {
  const entries = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!Array.isArray(entries)) throw new Error("PM2 process list must be an array.");

  const processName = requireString(expected.processName, "PM2 process name");
  const matches = entries.filter((entry) => entry?.name === processName);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one PM2 process named ${processName}; found ${matches.length}.`);
  }

  const item = matches[0];
  const env = item.pm2_env || {};
  const expectedNpm = requireString(expected.npmPath, "npm path");
  const expectedCwd = requireString(expected.cwd, "application working directory");
  const expectedPm2Home = requireString(expected.pm2Home, "PM2 home");
  const expectedPort = String(expected.port);
  const args = normalizedArgs(env.args ?? item.args);

  if (env.status !== "online") throw new Error(`PM2 process ${processName} is not online.`);
  if (!Number.isInteger(item.pid) || item.pid <= 0) throw new Error(`PM2 process ${processName} has no live PID.`);
  if (env.pm_exec_path !== expectedNpm) {
    throw new Error(`PM2 process ${processName} does not execute the approved npm binary.`);
  }
  if (args.length !== 1 || args[0] !== "start") {
    throw new Error(`PM2 process ${processName} was not registered as npm start.`);
  }
  if (env.pm_cwd !== expectedCwd) throw new Error(`PM2 process ${processName} has an unexpected working directory.`);
  if (env.PM2_HOME !== expectedPm2Home) throw new Error(`PM2 process ${processName} has an unexpected PM2_HOME.`);
  if (String(env.PORT ?? "") !== expectedPort) throw new Error(`PM2 process ${processName} has an unexpected PORT.`);
  if (env.NODE_ENV !== "production") throw new Error(`PM2 process ${processName} does not use NODE_ENV=production.`);

  return {
    pid: item.pid,
    status: env.status,
    execPath: env.pm_exec_path,
    cwd: env.pm_cwd,
    restartCount: Number(env.restart_time || 0),
    port: expectedPort,
    nodeEnv: env.NODE_ENV,
    pm2Home: env.PM2_HOME,
    args,
  };
}

async function readStdin() {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function main() {
  const [processName, npmPath, cwd, pm2Home, port] = process.argv.slice(2);
  const result = validatePm2ProcessList(await readStdin(), {
    processName,
    npmPath,
    cwd,
    pm2Home,
    port,
  });
  process.stdout.write(
    [result.pid, result.status, result.execPath, result.cwd, result.restartCount, result.port].join("\t"),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(`[pm2-contract] ${error instanceof Error ? error.message : "Validation failed."}`);
    process.exit(1);
  });
}
