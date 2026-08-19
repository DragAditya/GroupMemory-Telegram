import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getGroupDashboardStatuses: vi.fn().mockResolvedValue([]),
  getSystemJobByKey: vi.fn().mockResolvedValue(undefined),
}));

import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

describe("GroupMemory owner dashboard access", () => {
  it("allows an authenticated project admin to load dashboard data", async () => {
    const ctx = {
      user: {
        id: 1,
        openId: "authenticated-project-owner",
        name: "Project Owner",
        email: "owner@example.com",
        loginMethod: "manus",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    } as TrpcContext;

    await expect(appRouter.createCaller(ctx).groupMemory.dashboard()).resolves.toEqual({
      groups: [],
      retentionJob: undefined,
    });
  });
});
