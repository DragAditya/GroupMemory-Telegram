import { describe, expect, it } from "vitest";
import { getOwnerPlatformMetrics } from "../db";

describe("owner platform metrics", () => {
  it("never inflates group-level counts above the actual group inventory", async () => {
    const metrics = await getOwnerPlatformMetrics();
    expect(metrics.groupCount).toBeGreaterThanOrEqual(0);
    expect(metrics.memoryEnabledGroupCount).toBeLessThanOrEqual(metrics.groupCount);
    expect(metrics.activeGroupCount).toBeLessThanOrEqual(metrics.groupCount);
    expect(metrics.retainedMessageCount).toBeGreaterThanOrEqual(0);
  });
});
