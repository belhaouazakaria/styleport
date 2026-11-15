// @vitest-environment node
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
const file = "workers/coordinate-growth-source-prompt-release.py";
const source = readFileSync(file, "utf8");
it("parses without running a production action and pins the deployed 41-migration base", () => {
  expect(() => execFileSync("python3", ["-c", "import ast,sys;ast.parse(open(sys.argv[1]).read())", file])).not.toThrow();
  expect(source).toContain('OLD = "4e1d41be19682126099c4537a2079be71f7f75c1"');
  expect(source).toContain('q["cloneMigrations"] == 41');
  expect(source).toContain('assert len(history) == 41');
  expect(source).toContain('state["migrations"] == 41');
  expect(source).not.toContain('"migrate"');
});
it("retains the real read-only evidence entrypoint and exact owner gates before mutation", () => {
  expect(source).toContain('"GROWTH_V2_FOLLOWUP_EVIDENCE": "true"');
  expect(readFileSync("scripts/growth-v2-followup-evidence.ts", "utf8")).toContain('process.env.GROWTH_V2_FOLLOWUP_EVIDENCE === "true"');
  expect(source).toContain('GROWTH_SOURCE_PROMPT_RELEASE_APPROVAL');
  expect(source).toContain('"HOLD:" + OLD + ":" + new');
  expect(source).toContain('state["fingerprint"] == fingerprint');
  expect(source).toContain('digest_configs() == state["configDigests"]');
  expect(source).toContain('s = p.read_text().replace(OLD, new)');
  expect(source).not.toContain('GROWTH_V2_INTELLIGENCE_ENABLED');
  expect(source).not.toContain('GROWTH_MAIN_PIN_DESIGN_STYLE');
});
