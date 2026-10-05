import { loadEnvConfig } from "@next/env";

/** Loads the same .env precedence used by Next before Growth modules are imported. */
export function loadGrowthWorkerEnvironment(projectDir = process.cwd()) {
  return loadEnvConfig(projectDir, process.env.NODE_ENV === "development");
}
