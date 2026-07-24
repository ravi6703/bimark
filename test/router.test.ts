import { describe, expect, it } from "vitest";
import { modelForTask, tierForTask } from "../src/llm/router.js";
import { config } from "../src/config.js";

describe("model routing (§20)", () => {
  it("routes high-volume, low-stakes tasks to the fast tier", () => {
    expect(tierForTask("pitch")).toBe("fast");
    expect(tierForTask("draft")).toBe("fast");
    expect(modelForTask("pitch")).toBe(config.llm.modelFast);
  });

  it("routes quality/safety-critical tasks to the strong tier", () => {
    expect(tierForTask("review")).toBe("strong");
    expect(tierForTask("polish")).toBe("strong");
    expect(tierForTask("memo")).toBe("strong");
    expect(modelForTask("review")).toBe(config.llm.modelStrong);
  });
});
