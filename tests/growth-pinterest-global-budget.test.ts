import { describe, expect, it } from "vitest";
import { PINTEREST_GLOBAL_HOURLY_CEILING } from "@/lib/growth/pinterest/global-budget";
describe("global budget configuration", () => { it("has a conservative hourly ceiling", () => { expect(PINTEREST_GLOBAL_HOURLY_CEILING).toBe(4); }); });
