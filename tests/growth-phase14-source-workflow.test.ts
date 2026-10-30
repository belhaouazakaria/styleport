import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/growth-phase14-source-stage.yml", "utf8");
const expression = (body: string) => String.fromCharCode(36) + "{{ " + body + " }}";

describe("Phase14 trusted main exact-SHA staging workflow", () => {
  it("uses valid GitHub Actions two-brace expressions for every dynamic input", () => {
    expect(workflow).toContain(expression("github.event_path"));
    expect(workflow).toContain(expression("github.sha"));
    expect(workflow).toContain(expression("secrets.HOSTINGER_SSH_PRIVATE_KEY"));
    expect(workflow).toContain(expression("secrets.HOSTINGER_SSH_USER || vars.HOSTINGER_SSH_USER"));
    expect(workflow).not.toMatch(/\$\{(?!\{)/);
    expect([...workflow.matchAll(/\$\{\{[^}]+\}\}/g)].length).toBeGreaterThanOrEqual(18);
  });

  it("leaves all source-staging paths outside the application web root", () => {
    expect(workflow).toContain("/home/saytwist/.local/share/saytwist/phase14-rehearsal/");
    expect(workflow).not.toMatch(/target: \/home\/saytwist\/htdocs/);
    expect(workflow).toContain("GROWTH_PHASE14_RELEASE_SHA=");
  });
});
