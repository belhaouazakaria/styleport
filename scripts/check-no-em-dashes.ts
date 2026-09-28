import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { EM_DASH_CHARACTER } from "../lib/text-sanitizer";

const excludedParts = ["node_modules/", ".next/", "dist/", "build/", "coverage/", "storage/generated/"];
const excludedNames = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
const textExtensions = new Set([
  ".cjs", ".css", ".html", ".js", ".jsx", ".json", ".md", ".mjs", ".prisma", ".svg", ".ts", ".tsx",
]);

const trackedFiles = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((file) => !excludedParts.some((part) => file.startsWith(part) || file.includes(`/${part}`)))
  .filter((file) => !excludedNames.has(file.split("/").at(-1) || ""))
  .filter((file) => textExtensions.has(file.slice(file.lastIndexOf("."))));

const violations: string[] = [];
for (const file of trackedFiles) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes(EM_DASH_CHARACTER)) violations.push(`${file}:${index + 1}`);
  });
}

if (violations.length) {
  console.error("Forbidden em dash characters found:");
  violations.forEach((violation) => console.error(violation));
  process.exitCode = 1;
} else {
  console.log(`Em dash check passed across ${trackedFiles.length} source files.`);
}
